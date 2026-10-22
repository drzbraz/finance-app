import type { Transaction, TxType } from '@finance/shared';
import { round2 } from '../util';
import { totalsByType, type MonthlyTotals } from './aggregate';
import { isExpense } from './metrics';

export interface YoyCategory {
  category: string;
  a: number;
  b: number;
  delta: number; // b - a
  deltaPct: number | null; // null when a is 0
}

export interface YearOverYear {
  /** Months included (1..upTo). */
  months: number;
  /** Expenses (fixed + variable + additional) per month. */
  monthly: { month: number; a: number; b: number }[];
  totals: Record<'income' | 'investment' | 'expenses', { a: number; b: number; delta: number; deltaPct: number | null }>;
  categories: YoyCategory[];
}

const pctChange = (a: number, b: number) => (a > 0 ? (b - a) / a : null);

/**
 * Compares year A (older) with year B. `upToMonth` limits both years to Jan..upToMonth, so a
 * partial year is compared against the same period of the full one.
 */
export function yearOverYear(a: Transaction[], b: Transaction[], upToMonth = 12): YearOverYear {
  const inRange = (t: Transaction) => t.month <= upToMonth;
  const ta = totalsByType(a.filter(inRange));
  const tb = totalsByType(b.filter(inRange));
  const exp = (t: MonthlyTotals, i: number) => t.fixed[i] + t.variable[i] + t.additional[i];
  const sum = (t: MonthlyTotals, k: TxType) => t[k].reduce((x, y) => x + y, 0);

  const monthly = Array.from({ length: upToMonth }, (_, i) => ({ month: i + 1, a: round2(exp(ta, i)), b: round2(exp(tb, i)) }));
  const total = (x: number, y: number) => ({ a: round2(x), b: round2(y), delta: round2(y - x), deltaPct: pctChange(x, y) });
  const expA = monthly.reduce((s, m) => s + m.a, 0);
  const expB = monthly.reduce((s, m) => s + m.b, 0);

  const cats = new Map<string, { a: number; b: number }>();
  for (const [list, key] of [[a, 'a'], [b, 'b']] as const) {
    for (const t of list) {
      if (!isExpense(t) || !inRange(t)) continue;
      const c = t.category || 'Outros';
      const e = cats.get(c) ?? { a: 0, b: 0 };
      e[key] += t.amount;
      cats.set(c, e);
    }
  }
  const categories = [...cats.entries()]
    .map(([category, v]) => ({ category, a: round2(v.a), b: round2(v.b), delta: round2(v.b - v.a), deltaPct: pctChange(v.a, v.b) }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    months: upToMonth,
    monthly,
    totals: {
      income: total(sum(ta, 'income'), sum(tb, 'income')),
      investment: total(sum(ta, 'investment'), sum(tb, 'investment')),
      expenses: total(expA, expB),
    },
    categories,
  };
}
