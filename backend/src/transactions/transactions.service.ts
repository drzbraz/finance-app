import type { Transaction } from '@finance/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { UnitOfWork } from '../database/unit-of-work.js';
import { TransactionsRepository } from './transactions.repository.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly clock: Clock,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  listLive(year: number): Promise<Transaction[]> {
    return this.transactions.findLiveByYear(year);
  }

  /** Saves edits made in the app, stamping them for the "not exported yet" badge. */
  async save(transaction: Transaction): Promise<Transaction> {
    const [saved] = await this.saveMany([transaction]);
    return saved;
  }

  async saveMany(transactions: Transaction[]): Promise<Transaction[]> {
    const updatedAt = this.clock.isoNow();
    const stamped = transactions.map((t) => ({ ...t, updatedAt }));
    await this.transactions.saveMany(stamped);
    return stamped;
  }

  /** Puts a transaction back exactly as it was (undo for edits and deletes). */
  async restore(transaction: Transaction): Promise<void> {
    await this.transactions.save(transaction);
  }

  /** Imported rows are soft-deleted so the export can clear their cell; app-only rows are removed. */
  async remove(id: string): Promise<void> {
    const transaction = await this.transactions.findByKey(id);
    if (!transaction) throw new NotFoundException(`Transaction ${id} not found`);
    await this.removeExisting([transaction]);
  }

  /** Same as `remove` for several ids; unknown ids are ignored (the undo may run twice). */
  async removeMany(ids: string[]): Promise<void> {
    await this.removeExisting(await this.transactions.findByIds(ids));
  }

  private removeExisting(transactions: Transaction[]): Promise<void> {
    const updatedAt = this.clock.isoNow();
    const imported = transactions.filter((t) => t.source).map((t) => ({ ...t, deleted: true, updatedAt }));
    const appOnly = transactions.filter((t) => !t.source).map((t) => t.id);
    return this.unitOfWork.run(async () => {
      await this.transactions.saveMany(imported);
      await this.transactions.deleteByKeys(appOnly);
    });
  }
}
