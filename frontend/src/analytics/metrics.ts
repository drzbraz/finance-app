import type { Settings, Transaction, TxType } from '@finance/shared';
import { round2 } from '../util';
import type { MonthlyTotals } from './aggregate';

const EXPENSE: TxType[] = ['fixed', 'variable', 'additional'];
export const isExpense = (t: Transaction) => EXPENSE.includes(t.type);

/** investments ÷ income per month; null when there is no income. */
export function savingsRate(t: MonthlyTotals): (number | null)[] {
  return t.income.map((inc, i) => (inc > 0 ? t.investment[i] / inc : null));
}

/** Year-to-date savings rate up to and including `month` (1-12). */
export function savingsRateYTD(t: MonthlyTotals, month: number): number | null {
  const inc = t.income.slice(0, month).reduce((a, b) => a + b, 0);
  const inv = t.investment.slice(0, month).reduce((a, b) => a + b, 0);
  return inc > 0 ? inv / inc : null;
}

/** Expense total per category, sorted descending. `month` undefined = whole year. */
export function byCategory(txs: Transaction[], month?: number): { category: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const t of txs) {
    if (!isExpense(t) || (month !== undefined && t.month !== month)) continue;
    const c = t.category || 'Outros';
    m.set(c, (m.get(c) ?? 0) + t.amount);
  }
  return [...m.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

export function topExpenses(txs: Transaction[], month: number, n = 5): Transaction[] {
  return txs.filter((t) => isExpense(t) && t.month === month).sort((a, b) => b.amount - a.amount).slice(0, n);
}

export interface GoalProgress {
  currentBRL: number;
  goalBRL: number;
  progress: number; // 0-1 (may exceed 1)
  /** average monthly investment (EUR) over months with income */
  monthlyPaceEUR: number;
  /** months left at current pace; null when pace is 0 or there is no goal */
  monthsLeft: number | null;
}

export function goalProgress(settings: Settings, t: MonthlyTotals): GoalProgress {
  const currentBRL = settings.patrimonyBR + settings.patrimonyEU * settings.eurBrlRate;
  const goalBRL = settings.goalBRL;
  const months = t.income.map((inc, i) => (inc > 0 ? t.investment[i] : null)).filter((v): v is number => v !== null);
  const monthlyPaceEUR = months.length ? months.reduce((a, b) => a + b, 0) / months.length : 0;
  const remaining = goalBRL - currentBRL;
  let monthsLeft: number | null = null;
  if (goalBRL > 0) {
    if (remaining <= 0) monthsLeft = 0;
    else if (monthlyPaceEUR > 0 && settings.eurBrlRate > 0) monthsLeft = Math.ceil(remaining / (monthlyPaceEUR * settings.eurBrlRate));
  }
  return {
    currentBRL: round2(currentBRL),
    goalBRL,
    progress: goalBRL > 0 ? currentBRL / goalBRL : 0,
    monthlyPaceEUR: round2(monthlyPaceEUR),
    monthsLeft,
  };
}

export function pending(txs: Transaction[], month: number): Transaction[] {
  return txs.filter((t) => !t.paid && t.month === month).sort((a, b) => b.amount - a.amount);
}
