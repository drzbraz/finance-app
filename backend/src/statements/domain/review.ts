import {
  findRule,
  normalize,
  TYPE_DEFAULT_CATEGORY,
  type CategoryRule,
  type StatementDoubt,
  type StatementRow,
  type Transaction,
  type TxType,
} from '@finance/shared';
import type { ParsedStatement, StatementEntry } from './activobank.js';
import { describeMovement, isHolder, type Movement } from './describe.js';
import { MERCHANT_RULES } from './merchants.js';

/** Statement entries carry this id prefix; the rest is deterministic (see `statementId`). */
export const STATEMENT_ID_PREFIX = 'stm-';

/** How far apart (in days) a dated entry in the app can be from the bank's date and still be the same. */
const SAME_ENTRY_DAYS = 7;

/**
 * Turns each line of the statement into the entry it would become, with what is uncertain about
 * it. Purchases and direct debits with a known category are recorded by default; transfers,
 * money in, lines without a category and what looks already recorded wait for the user.
 *
 * `existing` = live entries of the statement's years; anything with the same amount in the
 * same month counts as already recorded (the sheet holds many purchases typed by hand), each
 * existing entry matching at most one line, the closest date first.
 */
export function reviewStatement(statement: ParsedStatement, rules: CategoryRule[], existing: Transaction[]): StatementRow[] {
  const allRules = [...rules, ...MERCHANT_RULES];
  const ids = statementIds(statement.entries);
  const imported = new Set(existing.filter((t) => t.id.startsWith(STATEMENT_ID_PREFIX)).map((t) => t.id));
  const candidates = existing.filter((t) => !t.id.startsWith(STATEMENT_ID_PREFIX) && !t.deleted);
  const taken = new Set<string>();

  return statement.entries.map((entry, i) => {
    const movement = describeMovement(entry.raw, entry.direction);
    const own = isHolder(movement.counterparty, statement.holder);
    const type = typeOf(entry, movement, own);
    const rule = type === 'income' || type === 'investment' ? undefined : ruleFor(allRules, movement.description, entry.raw);
    const transaction: Transaction = {
      id: ids[i],
      year: Number(entry.date.slice(0, 4)),
      month: Number(entry.date.slice(5, 7)),
      date: entry.date,
      description: movement.description,
      amount: entry.amount,
      type,
      category: rule?.category ?? TYPE_DEFAULT_CATEGORY[type],
      categorySource: 'auto',
      tags: rule?.tags ?? [],
      paid: true,
    };
    const alreadyImported = imported.has(transaction.id);
    const match = alreadyImported ? undefined : findMatch(transaction, movement, !rule, candidates, taken);
    if (match) taken.add(match.id);
    // A direct debit is usually a bill; Contas may already have it with another amount ("Academia" for two gym debits).
    const bill = !match && !alreadyImported && movement.kind === 'direct-debit' && rule
      ? candidates.find((c) => c.type === 'fixed' && c.year === transaction.year && c.month === transaction.month && c.category === rule.category)
      : undefined;
    const similar = match ?? bill;

    const doubts: StatementDoubt[] = [];
    if (match) doubts.push('duplicate');
    if (bill) doubts.push('bill');
    if (own) doubts.push('own-transfer');
    else if (movement.kind === 'transfer-out' || movement.kind === 'cash') doubts.push('transfer');
    if (entry.direction === 'credit' && !own) doubts.push('credit');
    if (!rule && (type === 'variable' || type === 'fixed') && movement.kind !== 'fee' && !doubts.includes('transfer')) doubts.push('no-category');
    if (!entry.balanceOk) doubts.push('balance');
    return {
      transaction,
      raw: entry.raw,
      direction: entry.direction,
      doubts,
      alreadyImported,
      ...(similar ? { match: { id: similar.id, description: similar.description, date: similar.date, amount: similar.amount, type: similar.type } } : {}),
    };
  });
}

/** Money in is income; moving it to my own account is most likely saving/investing; the rest is spending. */
function typeOf(entry: StatementEntry, movement: Movement, own: boolean): TxType {
  if (entry.direction === 'credit') return 'income';
  if (own && movement.kind === 'transfer-out') return 'investment';
  return 'variable';
}

/**
 * The merchant's own name decides before the city around it: "Anthropic Claude Sub Dublin" is a
 * subscription, not a trip. So the first word is tried, then the first two, then everything.
 */
function ruleFor(rules: CategoryRule[], description: string, raw: string): CategoryRule | undefined {
  const words = description.split(' ');
  for (let n = 1; n <= Math.min(2, words.length - 1); n++) {
    const rule = findRule(rules, words.slice(0, n).join(' '));
    if (rule) return rule;
  }
  return findRule(rules, `${description} ${raw}`);
}

/**
 * Same month, same amount (or the total of a Splitwise split), money in vs out alike. The
 * category must agree when the line has one; a card purchase without a category never matches
 * a fixed bill (2 € at a kiosk is not the Youtube subscription), a transfer or direct debit may.
 * Same category first, then the closest date.
 */
function findMatch(t: Transaction, movement: Movement, uncategorized: boolean, candidates: Transaction[], taken: Set<string>): Transaction | undefined {
  const income = t.type === 'income';
  const distance = (c: Transaction) => (c.date && t.date ? Math.abs(Date.parse(c.date) - Date.parse(t.date)) / 86_400_000 : 0);
  const compatible = (c: Transaction) =>
    c.category === t.category || (uncategorized && (c.type !== 'fixed' || movement.kind !== 'purchase'));
  return candidates
    .filter(
      (c) =>
        !taken.has(c.id) &&
        c.year === t.year &&
        c.month === t.month &&
        (c.type === 'income') === income &&
        (Math.abs(c.amount - t.amount) < 0.005 || (c.split && Math.abs(c.split.total - t.amount) < 0.005)) &&
        compatible(c) &&
        // Undated entries and the sheet's month-start placeholder date match any day.
        (!c.date || c.date.endsWith('-01') || distance(c) <= SAME_ENTRY_DAYS),
    )
    .sort((a, b) => Number(b.category === t.category) - Number(a.category === t.category) || distance(a) - distance(b))[0];
}

/**
 * stm-<date>-<cents>-<hash of the line>-<n>: the same line of the same statement gets the same id,
 * so a second import is recognised; n tells apart identical lines on the same day.
 */
function statementIds(entries: StatementEntry[]): string[] {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const base = `${STATEMENT_ID_PREFIX}${e.date}-${Math.round(e.amount * 100)}${e.direction === 'credit' ? 'c' : 'd'}-${hash(normalize(e.raw))}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}-${n}`;
  });
}

/** FNV-1a, base 36: short and stable, not for security. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
