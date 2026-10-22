import type { Budget } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { BudgetsRepository } from './budgets.repository.js';

@Injectable()
export class BudgetsService {
  constructor(private readonly budgets: BudgetsRepository) {}

  list(): Promise<Budget[]> {
    return this.budgets.findAll();
  }

  /** A limit of zero (or less) means "no budget" and removes it. */
  async save(budget: Budget): Promise<void> {
    if (budget.monthlyLimit > 0) await this.budgets.save(budget);
    else await this.budgets.deleteByKey(budget.category);
  }

  async saveMany(budgets: Budget[]): Promise<void> {
    await this.budgets.saveMany(budgets.filter((b) => b.monthlyLimit > 0));
    await this.budgets.deleteByKeys(budgets.filter((b) => b.monthlyLimit <= 0).map((b) => b.category));
  }

  removeMany(categories: string[]): Promise<void> {
    return this.budgets.deleteByKeys(categories);
  }
}
