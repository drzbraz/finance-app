import type { Budget, RecurringItem, Transaction } from '../types';
import { round2 } from '../util';
import { daysInMonth } from './bills';

export const GROCERY_CATEGORY = 'Mercado';

export interface FreeToSpend {
  /** What is still free for other (non-grocery) variable spending this month. */
  free: number;
  income: number;
  fixed: number;
  investment: number;
  /** Groceries set aside: max(already spent on Mercado, the month's reserve). */
  groceries: number;
  groceriesSpent: number;
  groceryReserve: number;
  groceryReserveSource: 'budget' | 'average' | 'none';
  /** Variable + additional spending outside Mercado already recorded. */
  otherSpent: number;
  /** Days left including today (0 outside the current month). */
  daysLeft: number;
  /** free ÷ daysLeft when positive and in the current month. */
  perDay: number | null;
  isCurrent: boolean;
}

const isFlexible = (t: Transaction) => t.type === 'variable' || t.type === 'additional';

/**
 * The month's grocery reserve: the Mercado budget when set, else the average Mercado spend of
 * the earlier months of the year that had any (months without groceries weren't logged).
 */
export function groceryReserve(txs: Transaction[], budgets: Budget[], month: number): { amount: number; source: FreeToSpend['groceryReserveSource'] } {
  const budget = budgets.find((b) => b.category === GROCERY_CATEGORY && b.monthlyLimit > 0);
  if (budget) return { amount: budget.monthlyLimit, source: 'budget' };
  const byMonth = new Map<number, number>();
  for (const t of txs) {
    if (t.month >= month || !isFlexible(t) || t.category !== GROCERY_CATEGORY) continue;
    byMonth.set(t.month, (byMonth.get(t.month) ?? 0) + t.amount);
  }
  const values = [...byMonth.values()].filter((v) => v > 0);
  if (!values.length) return { amount: 0, source: 'none' };
  return { amount: round2(values.reduce((a, b) => a + b, 0) / values.length), source: 'average' };
}

/**
 * "Livre para gastar": income − fixed bills − investments − groceries − other variable spending
 * already made. For the current month, income/fixed/investments include active recurring lines
 * not recorded yet (at their expected amount) and groceries are reserved up front; past months
 * use what was actually recorded.
 */
export function freeToSpend(
  txs: Transaction[],
  recurring: RecurringItem[],
  budgets: Budget[],
  year: number,
  month: number,
  today: Date,
): FreeToSpend {
  const inMonth = txs.filter((t) => t.month === month);
  const sum = (f: (t: Transaction) => boolean) => inMonth.filter(f).reduce((a, t) => a + t.amount, 0);
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;

  const missing = isCurrent
    ? recurring.filter((r) => r.active && !inMonth.some((t) => t.type === r.type && t.description === r.description))
    : [];
  const expected = (type: string) => missing.filter((r) => r.type === type).reduce((a, r) => a + (r.expectedAmount ?? 0), 0);

  const income = sum((t) => t.type === 'income') + expected('income');
  const fixed = sum((t) => t.type === 'fixed') + expected('fixed');
  const investment = sum((t) => t.type === 'investment') + expected('investment');
  const groceriesSpent = sum((t) => isFlexible(t) && t.category === GROCERY_CATEGORY);
  const otherSpent = sum((t) => isFlexible(t) && t.category !== GROCERY_CATEGORY);
  const reserve = isCurrent ? groceryReserve(txs, budgets, month) : { amount: 0, source: 'none' as const };
  const groceries = Math.max(groceriesSpent, reserve.amount);

  const free = round2(income - fixed - investment - groceries - otherSpent);
  const daysLeft = isCurrent ? daysInMonth(year, month) - today.getDate() + 1 : 0;
  return {
    free,
    income: round2(income),
    fixed: round2(fixed),
    investment: round2(investment),
    groceries: round2(groceries),
    groceriesSpent: round2(groceriesSpent),
    groceryReserve: reserve.amount,
    groceryReserveSource: reserve.source,
    otherSpent: round2(otherSpent),
    daysLeft,
    perDay: isCurrent && free > 0 && daysLeft > 0 ? round2(free / daysLeft) : null,
    isCurrent,
  };
}
