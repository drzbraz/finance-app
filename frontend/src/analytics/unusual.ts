import type { Transaction } from '@finance/shared';
import { round2 } from '../util';

export interface Unusual {
  category: string;
  /** Spent in the month so far. */
  spent: number;
  /** The category's average month over the `months` before (months without it count as zero). */
  usual: number;
  /** How many past months the average covers (up to 3). */
  months: number;
  /** spent ÷ usual − 1; null for a category not seen in those months. */
  above: number | null;
}

const isFlexible = (t: Transaction) => t.type === 'variable' || t.type === 'additional';
const key = (year: number, month: number) => year * 12 + month - 1;

/**
 * "Fora do normal": day-to-day categories (variable + additional) spending clearly more than
 * usual. The usual month is the average of up to `history` months before, across the year
 * boundary (pass both years' entries), counting only months where anything flexible was logged.
 * The month so far is compared with a whole usual month, not prorated by the day: spending is
 * lumpy (one dinner on the 3rd is not "680% above"), so a category is flagged only once it has
 * already gone past what it usually costs in a month.
 * Flagged: `ratio` above usual AND at least `minDelta` € more (small categories do not ping),
 * or a category not seen in those months with `minDelta` € or more.
 */
export function unusualCategories(
  txs: Transaction[],
  year: number,
  month: number,
  { history = 3, ratio = 1.3, minDelta = 20 } = {},
): Unusual[] {
  const target = key(year, month);
  const flexible = txs.filter(isFlexible);
  const logged = [...new Set(flexible.map((t) => key(t.year, t.month)).filter((k) => k < target))].sort((a, b) => b - a).slice(0, history);
  if (!logged.length) return [];

  const spentBy = new Map<string, number>();
  const pastBy = new Map<string, number>();
  for (const t of flexible) {
    const k = key(t.year, t.month);
    const category = t.category || 'Outros';
    if (k === target) spentBy.set(category, (spentBy.get(category) ?? 0) + t.amount);
    else if (logged.includes(k)) pastBy.set(category, (pastBy.get(category) ?? 0) + t.amount);
  }

  const months = logged.length;
  const out: Unusual[] = [];
  for (const [category, total] of spentBy) {
    const spent = round2(total);
    const usual = round2((pastBy.get(category) ?? 0) / months);
    if (usual === 0) {
      if (spent >= minDelta) out.push({ category, spent, usual, months, above: null });
      continue;
    }
    if (spent > usual * ratio && spent - usual >= minDelta) out.push({ category, spent, usual, months, above: spent / usual - 1 });
  }
  return out.sort((a, b) => b.spent - b.usual - (a.spent - a.usual));
}
