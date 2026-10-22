import type { Transaction } from '@finance/shared';
import { round2 } from '../util';
import { daysInMonth } from './bills';

export interface Unusual {
  category: string;
  /** Spent in the month so far. */
  spent: number;
  /** The category's average month (the months before, months without it count as zero). */
  usual: number;
  /** What the usual month would have spent by now (`usual` × share of the month gone). */
  expected: number;
  /** spent ÷ expected − 1; null for a category with no history. */
  above: number | null;
}

const isFlexible = (t: Transaction) => t.type === 'variable' || t.type === 'additional';
const key = (year: number, month: number) => year * 12 + month - 1;

/**
 * "Fora do normal": day-to-day categories (variable + additional) spending clearly more than
 * usual. The usual month is the average of up to `history` months before, across the year
 * boundary (pass both years' entries), counting only months where anything flexible was logged.
 * In the current month it compares with what a usual month spends by this day, so a
 * category is not flagged on the 3rd for a whole month's average.
 * Flagged: `ratio` above usual AND at least `minDelta` € more (small categories do not ping),
 * or a category never seen before with `minDelta` € or more.
 */
export function unusualCategories(
  txs: Transaction[],
  year: number,
  month: number,
  today: Date,
  { history = 3, ratio = 1.3, minDelta = 20 } = {},
): Unusual[] {
  const target = key(year, month);
  const flexible = txs.filter(isFlexible);
  const logged = [...new Set(flexible.map((t) => key(t.year, t.month)).filter((k) => k < target))].sort((a, b) => b - a).slice(0, history);
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;
  const share = isCurrent ? today.getDate() / daysInMonth(year, month) : 1;

  const spentBy = new Map<string, number>();
  const pastBy = new Map<string, number>();
  for (const t of flexible) {
    const k = key(t.year, t.month);
    const category = t.category || 'Outros';
    if (k === target) spentBy.set(category, (spentBy.get(category) ?? 0) + t.amount);
    else if (logged.includes(k)) pastBy.set(category, (pastBy.get(category) ?? 0) + t.amount);
  }
  if (!logged.length) return [];

  const out: Unusual[] = [];
  for (const [category, total] of spentBy) {
    const spent = round2(total);
    const usual = round2((pastBy.get(category) ?? 0) / logged.length);
    const expected = round2(usual * share);
    if (usual === 0) {
      if (spent >= minDelta) out.push({ category, spent, usual, expected, above: null });
      continue;
    }
    if (spent > expected * ratio && spent - expected >= minDelta) out.push({ category, spent, usual, expected, above: spent / expected - 1 });
  }
  return out.sort((a, b) => b.spent - b.expected - (a.spent - a.expected));
}
