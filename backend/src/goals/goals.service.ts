import type { Goal } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { GoalsRepository } from './goals.repository.js';
import { PATRIMONY_GOAL_ID, patrimonyGoal } from './patrimony-goal.js';

@Injectable()
export class GoalsService {
  constructor(
    private readonly goals: GoalsRepository,
    private readonly clock: Clock,
  ) {}

  list(): Promise<Goal[]> {
    return this.goals.findAll();
  }

  save(goal: Goal): Promise<void> {
    return this.goals.save(goal);
  }

  remove(id: string): Promise<void> {
    return this.goals.deleteByKey(id);
  }

  /** The sheet's META sets the Patrimônio goal's target; a name or date the user edited is kept. */
  async syncPatrimonyTarget(target: number): Promise<void> {
    const existing = await this.goals.findByKey(PATRIMONY_GOAL_ID);
    await this.goals.save(existing ? { ...existing, target } : patrimonyGoal(target, this.clock.isoNow()));
  }
}
