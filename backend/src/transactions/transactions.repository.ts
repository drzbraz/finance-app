import type { Transaction } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import { TransactionRecord } from './transaction.schema.js';

const NOT_DELETED = { deleted: { $ne: true } };
const FROM_SPREADSHEET = { source: { $exists: true } };
const APP_ONLY = { source: { $exists: false } };

@Injectable()
export class TransactionsRepository extends DocumentRepository<Transaction, 'id'> {
  constructor(@InjectModel(TransactionRecord.name) model: Model<TransactionRecord>) {
    super(model, 'id');
  }

  /** Every row of the year, soft-deleted ones included (export needs them to clear cells). */
  findByYear(year: number): Promise<Transaction[]> {
    return this.findAll({ year });
  }

  /** What the app shows: the year's rows without the soft-deleted ones. */
  findLiveByYear(year: number): Promise<Transaction[]> {
    return this.findAll({ year, ...NOT_DELETED });
  }

  findByIds(ids: string[]): Promise<Transaction[]> {
    return this.findAll({ _id: { $in: ids } });
  }

  findAutoCategorized(): Promise<Transaction[]> {
    return this.findAll({ categorySource: 'auto' });
  }

  async findYears(): Promise<number[]> {
    const years: number[] = await this.model.distinct('year').exec();
    return years.filter((year) => year > 0).sort((a, b) => a - b);
  }

  countByYear(year: number): Promise<number> {
    return this.count({ year });
  }

  /** Live entries created in the app (no spreadsheet cell behind them). */
  countAppOnly(year: number): Promise<number> {
    return this.count({ year, ...APP_ONLY, ...NOT_DELETED });
  }

  countChangedSince(year: number, since: string): Promise<number> {
    return this.count({ year, updatedAt: { $gt: since } });
  }

  deleteImportedByYear(year: number): Promise<void> {
    return this.deleteWhere({ year, ...FROM_SPREADSHEET });
  }

  deleteByYear(year: number): Promise<void> {
    return this.deleteWhere({ year });
  }
}
