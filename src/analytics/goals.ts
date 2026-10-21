import type { Goal, Settings } from '../types';
import { round2 } from '../util';
import type { MonthlyTotals } from './aggregate';

export interface GoalStatus {
  goal: Goal;
  current: number; // in the goal's currency
  remaining: number;
  progress: number; // 0-1+
  /** Months from today to targetDate (≥ 1), when there is one. */
  monthsToTarget: number | null;
  /** What has to be saved per month to hit targetDate. */
  monthlyNeeded: number | null;
  /** Average saved per month so far, in the goal's currency. */
  monthlyPace: number;
  /** Months left at that pace; 0 when reached; null when there is no pace. */
  monthsLeftAtPace: number | null;
  /** Projected completion (yyyy-mm) at the current pace. */
  projectedDate: string | null;
}

function monthsBetween(from: Date, toIso: string): number {
  const to = new Date(`${toIso}T00:00:00`);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function addMonths(from: Date, n: number): string {
  const d = new Date(from.getFullYear(), from.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Patrimony goals track patrimonyBR + patrimonyEU × rate, and their pace is the average monthly
 * investment from the year's data. Manual goals sum their contributions; pace = contributions
 * spread over the months since the goal was created.
 */
export function goalStatus(goal: Goal, settings: Settings, totals: MonthlyTotals | null, today: Date): GoalStatus {
  const toGoal = (eur: number) => (goal.currency === 'BRL' ? eur * settings.eurBrlRate : eur);
  let current: number;
  let monthlyPace: number;
  if (goal.source === 'patrimony') {
    const brl = settings.patrimonyBR + settings.patrimonyEU * settings.eurBrlRate;
    current = goal.currency === 'BRL' ? brl : settings.eurBrlRate > 0 ? brl / settings.eurBrlRate : 0;
    const months = totals ? totals.income.map((inc, i) => (inc > 0 ? totals.investment[i] : null)).filter((v): v is number => v !== null) : [];
    monthlyPace = months.length ? toGoal(months.reduce((a, b) => a + b, 0) / months.length) : 0;
  } else {
    current = goal.contributions.reduce((a, c) => a + c.amount, 0);
    const since = Math.max(1, monthsBetween(new Date(goal.createdAt), todayIsoLocal(today)) + 1);
    monthlyPace = current / since;
  }
  const remaining = Math.max(0, goal.target - current);
  const monthsToTarget = goal.targetDate ? Math.max(1, monthsBetween(today, goal.targetDate)) : null;
  const monthsLeftAtPace = remaining === 0 ? 0 : monthlyPace > 0 ? Math.ceil(remaining / monthlyPace) : null;
  return {
    goal,
    current: round2(current),
    remaining: round2(remaining),
    progress: goal.target > 0 ? current / goal.target : 0,
    monthsToTarget,
    monthlyNeeded: monthsToTarget && remaining > 0 ? round2(remaining / monthsToTarget) : monthsToTarget ? 0 : null,
    monthlyPace: round2(monthlyPace),
    monthsLeftAtPace,
    projectedDate: monthsLeftAtPace === null ? null : addMonths(today, monthsLeftAtPace),
  };
}

function todayIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
