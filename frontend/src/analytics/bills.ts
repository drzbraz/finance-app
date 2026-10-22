import { newId, type RecurringItem, type Transaction, type TxType } from '@finance/shared';
import { round2 } from '../util';
import { monthChecklist } from './checklist';

/** 'optional': an optional line with nothing recorded this month (record it if you want). */
export type BillBucket = 'overdue' | 'soon' | 'later' | 'optional' | 'done';

export interface Bill {
  item: RecurringItem;
  /** Transactions recorded for this item in the month. */
  txs: Transaction[];
  /** Recorded amount, or the expected one when nothing is recorded yet. */
  amount: number;
  recorded: boolean;
  done: boolean;
  dueDate?: string; // ISO
  bucket: BillBucket;
}

export const SOON_DAYS = 7;

export const recurringKey = (type: TxType, description: string) => `${type}|${description}`;

/** Optional lines (investments unless set otherwise) only count in a month once recorded. */
export const isOptional = (r: Pick<RecurringItem, 'type' | 'optional'>): boolean => r.optional ?? r.type === 'investment';

/** Lines the month expects even before they are recorded: forecasts reserve them, "Iniciar mês" creates them. */
export const isExpected = (r: RecurringItem): boolean => r.active && !isOptional(r);

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The date's local yyyy-mm-dd, for comparisons with ISO date strings. */
export function todayIso(today: Date): string {
  return isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Recurring items = every income/investment/fixed line seen in the year (the checklist's
 * items), overlaid with what the user stored (due day, expected amount, active flag).
 * Stored items that no longer appear in the data are kept, so a bill can be set up ahead.
 */
export function mergeRecurring(txs: Transaction[], stored: RecurringItem[], month: number): RecurringItem[] {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const out: RecurringItem[] = [];
  for (const i of monthChecklist(txs, month).items) {
    const s = byKey.get(i.key);
    byKey.delete(i.key);
    if (s?.removed) continue;
    const lastAmount = i.txs.length ? i.txs.reduce((a, t) => a + t.amount, 0) : i.expected;
    out.push({
      key: i.key,
      type: i.type,
      description: i.description,
      active: s?.active ?? true,
      optional: s?.optional,
      dueDay: s?.dueDay,
      expectedAmount: s?.expectedAmount ?? lastAmount,
    });
  }
  return [...out, ...[...byKey.values()].filter((s) => !s.removed)];
}

/**
 * Renames a recurring line: every transaction of the year with the old type+description gets
 * the new name/type, so history and the sheet row stay one line. Returns the changed rows.
 */
export function renameRecurringTxs(txs: Transaction[], from: RecurringItem, to: { type: TxType; description: string }): Transaction[] {
  return txs
    .filter((t) => t.type === from.type && t.description === from.description)
    .map((t) => ({ ...t, type: to.type, description: to.description }));
}

/** Buckets each active recurring item for `year`/`month` relative to `today`. */
export function billsForMonth(
  txs: Transaction[],
  recurring: RecurringItem[],
  year: number,
  month: number,
  today: Date,
): Bill[] {
  const now = todayIso(today);
  const soonLimit = addDays(now, SOON_DAYS);
  const monthEnd = isoDate(year, month, daysInMonth(year, month));
  const bills: Bill[] = [];
  for (const item of recurring) {
    if (!item.active) continue;
    const inMonth = txs.filter((t) => t.month === month && t.year === year && t.type === item.type && t.description === item.description);
    const recorded = inMonth.length > 0;
    const done = recorded && inMonth.every((t) => t.paid);
    const amount = round2(recorded ? inMonth.reduce((a, t) => a + t.amount, 0) : item.expectedAmount ?? 0);
    const dueDate = item.dueDay ? isoDate(year, month, Math.min(item.dueDay, daysInMonth(year, month))) : undefined;
    let bucket: BillBucket;
    if (done) bucket = 'done';
    else if (!recorded && isOptional(item)) bucket = 'optional';
    else if (dueDate) bucket = dueDate < now ? 'overdue' : dueDate <= soonLimit ? 'soon' : 'later';
    else bucket = monthEnd < now ? 'overdue' : 'later';
    bills.push({ item, txs: inMonth, amount, recorded, done, dueDate, bucket });
  }
  const order: Record<BillBucket, number> = { overdue: 0, soon: 1, later: 2, optional: 3, done: 4 };
  return bills.sort((a, b) => order[a.bucket] - order[b.bucket] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
}

/** Overdue + due within SOON_DAYS, for the home card. Includes next month when the window crosses into it. */
export function upcomingBills(
  txs: Transaction[],
  recurring: RecurringItem[],
  today: Date,
): Bill[] {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const current = billsForMonth(txs, recurring, y, m, today).filter((b) => b.bucket === 'overdue' || b.bucket === 'soon');
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const soonLimit = addDays(todayIso(today), SOON_DAYS);
  const next = billsForMonth(txs, recurring, ny, nm, today).filter((b) => b.bucket === 'soon' && b.dueDate && b.dueDate <= soonLimit);
  return [...current, ...next];
}

/**
 * "Iniciar mês": a pending transaction for every expected recurring item (active, not optional)
 * with nothing recorded in `month` yet. Idempotent: running it again creates nothing.
 */
export function startMonthTxs(txs: Transaction[], recurring: RecurringItem[], year: number, month: number): Transaction[] {
  return recurring
    .filter((r) => isExpected(r) && (r.expectedAmount ?? 0) > 0)
    .filter((r) => !txs.some((t) => t.year === year && t.month === month && t.type === r.type && t.description === r.description))
    .map((r) => ({
      id: newId(),
      year,
      month,
      date: isoDate(year, month, Math.min(r.dueDay ?? 1, daysInMonth(year, month))),
      description: r.description,
      amount: r.expectedAmount!,
      type: r.type,
      category: '',
      categorySource: 'auto' as const,
      tags: [],
      paid: false,
      origin: 'start-month' as const,
    }));
}

/**
 * What "Desfazer início do mês" removes: entries created by "Iniciar mês" that are still
 * pending. Paid ones stay (you already acted on them). Entries from before the `origin` flag
 * existed are recognised as app-created (no sheet cell), pending, and matching a recurring line
 * with its expected amount, i.e. exactly what "Iniciar mês" would have created.
 */
export function startedMonthTxs(txs: Transaction[], recurring: RecurringItem[], year: number, month: number): Transaction[] {
  return txs.filter((t) => {
    if (t.year !== year || t.month !== month || t.paid || t.deleted) return false;
    if (t.origin === 'start-month') return true;
    if (t.origin || t.source) return false;
    return recurring.some((r) => r.type === t.type && r.description === t.description && r.expectedAmount === t.amount);
  });
}
