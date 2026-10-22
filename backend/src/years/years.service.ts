import type { YearStatus } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../database/unit-of-work.js';
import { SettingsService } from '../settings/settings.service.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { WorkbooksRepository } from '../workbooks/workbooks.repository.js';

@Injectable()
export class YearsService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly workbooks: WorkbooksRepository,
    private readonly settings: SettingsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(): Promise<number[]> {
    return this.transactions.findYears();
  }

  async status(year: number): Promise<YearStatus> {
    const [count, appOnlyCount, unexportedCount] = await Promise.all([
      this.transactions.countByYear(year),
      this.transactions.countAppOnly(year),
      this.unexportedCount(year),
    ]);
    return { year, exists: count > 0, appOnlyCount, unexportedCount };
  }

  /** Removes a year's transactions and its stored spreadsheet. */
  remove(year: number): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.transactions.deleteByYear(year);
      await this.workbooks.deleteByKey(year);
    });
  }

  /** Changes made in the app since the year's last export, or since its import when never exported. */
  private async unexportedCount(year: number): Promise<number> {
    const { lastExportAt } = await this.settings.get();
    const since = lastExportAt[year] ?? (await this.workbooks.findByKey(year))?.importedAt ?? '';
    return this.transactions.countChangedSince(year, since);
  }
}
