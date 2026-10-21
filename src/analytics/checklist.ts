import type { Transaction, TxType } from '../types';
import { round2 } from '../util';

export const CHECKLIST_TYPES: TxType[] = ['income', 'investment', 'fixed'];

export interface ChecklistItem {
  key: string;
  type: TxType;
  description: string;
  /** Transactions already recorded for this item in the month. */
  txs: Transaction[];
  /** Amount from the latest earlier month (or any month), shown when nothing is recorded yet. */
  expected?: number;
  done: boolean;
}

export interface Checklist {
  items: ChecklistItem[];
  doneCount: number;
  toPay: number; // unpaid expenses, including expected ones
  toReceive: number; // unreceived income, including expected
}

/**
 * Recurring items for `month`: every income/investment/fixed label seen anywhere in the year.
 * Labels with nothing recorded this month carry the latest known amount as `expected`.
 */
export function monthChecklist(txs: Transaction[], month: number): Checklist {
  const recurring = txs.filter((t) => CHECKLIST_TYPES.includes(t.type));
  const keys = new Map<string, { type: TxType; description: string; firstRow: number }>();
  for (const t of recurring) {
    const key = `${t.type}|${t.description}`;
    const row = t.source ? Number(/\d+$/.exec(t.source.cell)?.[0] ?? 9999) : 9999;
    const prev = keys.get(key);
    if (!prev || row < prev.firstRow) keys.set(key, { type: t.type, description: t.description, firstRow: row });
  }

  const items: ChecklistItem[] = [];
  for (const [key, { type, description }] of keys) {
    const same = recurring.filter((t) => t.type === type && t.description === description);
    const inMonth = same.filter((t) => t.month === month);
    let expected: number | undefined;
    if (inMonth.length === 0) {
      const earlier = same.filter((t) => t.month < month).sort((a, b) => b.month - a.month)[0];
      const any = earlier ?? [...same].sort((a, b) => b.month - a.month)[0];
      expected = any?.amount;
    }
    items.push({
      key,
      type,
      description,
      txs: inMonth,
      expected,
      done: inMonth.length > 0 && inMonth.every((t) => t.paid),
    });
  }

  const order = (i: ChecklistItem) => CHECKLIST_TYPES.indexOf(i.type) * 100000 + (keys.get(i.key)?.firstRow ?? 0);
  items.sort((a, b) => order(a) - order(b));

  let toPay = 0;
  let toReceive = 0;
  for (const i of items) {
    if (i.done) continue;
    const open = i.txs.length ? i.txs.filter((t) => !t.paid).reduce((a, t) => a + t.amount, 0) : i.expected ?? 0;
    if (i.type === 'income') toReceive += open;
    else toPay += open;
  }
  return { items, doneCount: items.filter((i) => i.done).length, toPay: round2(toPay), toReceive: round2(toReceive) };
}
