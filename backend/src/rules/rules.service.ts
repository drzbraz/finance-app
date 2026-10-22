import { applyRules, defaultRules, type AddRuleResult, type CategoryRule } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../database/unit-of-work.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { RulesRepository } from './rules.repository.js';

@Injectable()
export class RulesService {
  constructor(
    private readonly rules: RulesRepository,
    private readonly transactions: TransactionsRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(): Promise<CategoryRule[]> {
    return this.rules.findAll();
  }

  /** Saves the rule and re-categorises every automatically categorised transaction with it. */
  add(rule: CategoryRule): Promise<AddRuleResult> {
    return this.unitOfWork.run(async () => {
      await this.rules.save(rule);
      const auto = await this.transactions.findAutoCategorized();
      const recategorized = applyRules(auto, await this.rules.findAll());
      const changed = recategorized.filter((t, i) => t.category !== auto[i].category);
      await this.transactions.saveMany(changed);
      return { rule, updated: changed.length };
    });
  }

  remove(id: string): Promise<void> {
    return this.rules.deleteByKey(id);
  }

  async seedDefaults(): Promise<void> {
    if ((await this.rules.count()) === 0) await this.rules.saveMany(defaultRules());
  }
}
