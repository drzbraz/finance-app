import type { RecurringItem, RecurringRename } from '@finance/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { UnitOfWork } from '../database/unit-of-work.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { RecurringRepository } from './recurring.repository.js';

@Injectable()
export class RecurringService {
  constructor(
    private readonly recurring: RecurringRepository,
    private readonly transactions: TransactionsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  list(): Promise<RecurringItem[]> {
    return this.recurring.findAll();
  }

  save(item: RecurringItem): Promise<void> {
    return this.recurring.save(item);
  }

  /**
   * Saves an edited line. When its name or type changed, the old key is tombstoned (so the
   * old name is not derived again from past transactions) and the re-labelled transactions are saved.
   */
  update({ previous, next, renamed }: RecurringRename): Promise<void> {
    return this.unitOfWork.run(async () => {
      if (previous && previous.key !== next.key) await this.recurring.save(tombstone(previous));
      await this.recurring.save({ ...next, removed: false });
      const updatedAt = this.clock.isoNow();
      await this.transactions.saveMany(renamed.map((t) => ({ ...t, updatedAt })));
    });
  }

  /** Removes a line from Contas; past transactions keep their history. */
  async remove(key: string): Promise<void> {
    const item = await this.recurring.findByKey(key);
    if (!item) throw new NotFoundException(`Recurring item ${key} not found`);
    await this.recurring.save(tombstone(item));
  }
}

function tombstone(item: RecurringItem): RecurringItem {
  return { ...item, removed: true, active: false };
}
