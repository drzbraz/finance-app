import type { Budget, Transaction } from '../types';
import { round2 } from '../util';
import { isExpense } from './metrics';

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  pct: number; // spent / limit
  state: BudgetState;
}

/** 80% of the limit is the warning line; above 100% is over. */
export const BUDGET_WARNING = 0.8;

export function budgetState(pct: number): BudgetState {
  if (pct > 1) return 'over';
  if (pct >= BUDGET_WARNING) return 'warning';
  return 'ok';
}

/** Spend vs limit for every budgeted category in `month`, most used first. */
export function budgetStatus(txs: Transaction[], budgets: Budget[], month: number): BudgetStatus[] {
  return budgets
    .filter((b) => b.monthlyLimit > 0)
    .map((b) => {
      const spent = round2(
        txs.filter((t) => isExpense(t) && t.month === month && (t.category || 'Outros') === b.category).reduce((a, t) => a + t.amount, 0),
      );
      const pct = spent / b.monthlyLimit;
      return { category: b.category, limit: b.monthlyLimit, spent, remaining: round2(b.monthlyLimit - spent), pct, state: budgetState(pct) };
    })
    .sort((a, b) => b.pct - a.pct);
}

/**
 * Suggested limits: each category's average monthly spend over the months before `month`
 * that have any expense (all months with data when there is no earlier one), rounded up to €10.
 */
export function suggestBudgets(txs: Transaction[], month: number): Budget[] {
  const expenses = txs.filter(isExpense);
  let months = new Set(expenses.filter((t) => t.month < month).map((t) => t.month));
  if (months.size === 0) months = new Set(expenses.map((t) => t.month));
  if (months.size === 0) return [];
  const sums = new Map<string, number>();
  for (const t of expenses) {
    if (!months.has(t.month)) continue;
    const c = t.category || 'Outros';
    sums.set(c, (sums.get(c) ?? 0) + t.amount);
  }
  return [...sums.entries()]
    .map(([category, sum]) => ({ category, monthlyLimit: Math.ceil(sum / months.size / 10) * 10 }))
    .filter((b) => b.monthlyLimit > 0)
    .sort((a, b) => b.monthlyLimit - a.monthlyLimit);
}
