import type { Transaction } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { UnitOfWork } from '../database/unit-of-work.js';
import { SettingsService } from '../settings/settings.service.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { writeLedgerOnly, writeWorkbook } from './domain/export/write-workbook.js';
import { SHEET_NAME } from './domain/parser/parse-workbook.js';

export interface SpreadsheetExport {
  fileName: string;
  data: Buffer;
  warnings: string[];
}

@Injectable()
export class SpreadsheetExportService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly workbooks: WorkbooksRepository,
    private readonly settings: SettingsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Writes the year into its stored spreadsheet and makes the result the new baseline, so a
   * later re-import of this file never duplicates entries. A year that was never imported
   * only gets the "Lançamentos" ledger sheet.
   */
  async export(year: number): Promise<SpreadsheetExport> {
    const transactions = await this.transactions.findByYear(year);
    const stored = await this.workbooks.findByKey(year);
    const fileName = stored?.fileName ?? `Controle financeiro ${year}.xlsx`;
    if (!stored) return { fileName, ...(await writeLedgerOnly(transactions)) };

    const { data, warnings, placements } = await writeWorkbook(stored.data, transactions);
    await this.unitOfWork.run(async () => {
      const exportedAt = this.clock.isoNow();
      await this.rebase(year, transactions, placements);
      await this.workbooks.save({ year, fileName, importedAt: exportedAt, data });
      await this.settings.recordExport(year, exportedAt);
    });
    return { fileName, data, warnings };
  }

  /**
   * Re-points every exported transaction to its final cell and gives it the id a re-import of
   * the file would give it (imp-<year>-<cell>). Soft-deleted rows are gone from the file.
   */
  private async rebase(year: number, transactions: Transaction[], placements: Record<string, string>): Promise<void> {
    const removed: string[] = [];
    const moved: Transaction[] = [];
    for (const t of transactions) {
      if (t.deleted) {
        removed.push(t.id);
        continue;
      }
      const cell = placements[t.id];
      if (!cell) continue;
      const id = `imp-${year}-${cell}`;
      if (id !== t.id) removed.push(t.id);
      moved.push({ ...t, id, source: { sheet: SHEET_NAME, cell } });
    }
    await this.transactions.deleteByKeys(removed);
    await this.transactions.saveMany(moved);
  }
}
