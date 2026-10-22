import type { Goal } from '@finance/shared';

export const PATRIMONY_GOAL_ID = 'goal-patrimonio';

/** The goal mirrored from the sheet's META cell: progress is the patrimony itself. */
export function patrimonyGoal(target: number, createdAt: string): Goal {
  return {
    id: PATRIMONY_GOAL_ID,
    name: 'Patrimônio',
    target,
    currency: 'BRL',
    source: 'patrimony',
    contributions: [],
    createdAt,
  };
}
