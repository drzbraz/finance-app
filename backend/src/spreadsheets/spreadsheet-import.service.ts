import { applyRules, type ImportPreview, type ImportResult, type ImportSummary, type Transaction } from '@finance/shared';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { UnitOfWork } from '../database/unit-of-work.js';
import { GoalsService } from '../goals/goals.service.js';
import { RulesRepository } from '../rules/rules.repository.js';
import { SettingsService } from '../settings/settings.service.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { parseWorkbook } from './domain/parser/parse-workbook.js';
import type { UploadedSpreadsheet } from './uploaded-spreadsheet.js';

@Injectable()
export class SpreadsheetImportService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly rules: RulesRepository,
    private readonly workbooks: WorkbooksRepository,
    private readonly settings: SettingsService,
    private readonly goals: GoalsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** What importing the file would do: categorised entries, warnings, and what the year already has. */
  async preview(file: UploadedSpreadsheet, year?: number): Promise<ImportPreview> {
    const result = await this.parse(file, year);
    result.transactions = applyRules(result.transactions, await this.rules.findAll());
    if (result.year === null) return { result, existing: false, appOnlyCount: 0 };
    const [count, appOnlyCount] = await Promise.all([
      this.transactions.countByYear(result.year),
      this.transactions.countAppOnly(result.year),
    ]);
    return { result, existing: count > 0, appOnlyCount };
  }

  /**
   * Replaces the year's imported entries with the file's. Manual categories and tags survive
   * when the same cell is imported again (ids are deterministic: imp-<year>-<cell>), and entries
   * created in the app are kept. Only the most recent year's sheet updates the settings
   * (rate, patrimony, goal): importing an older year must not roll them back.
   */
  async import(year: number, file: UploadedSpreadsheet): Promise<ImportSummary> {
    const result = await this.parse(file, year);
    await this.unitOfWork.run(async () => {
      const incoming = await this.withManualChoicesKept(year, result.transactions);
      await this.transactions.deleteImportedByYear(year);
      await this.transactions.saveMany(applyRules(incoming, await this.rules.findAll()));
      await this.workbooks.save({ year, fileName: file.fileName, importedAt: this.clock.isoNow(), data: file.data });
      if (await this.isLatestYear(year)) await this.applySheetSettings(result);
    });
    return { year, imported: result.transactions.length, warnings: result.warnings.map((w) => w.message) };
  }

  private async parse(file: UploadedSpreadsheet, year?: number): Promise<ImportResult> {
    try {
      return await parseWorkbook(file.data, { fileName: file.fileName, year });
    } catch (error) {
      throw new UnprocessableEntityException(`Could not read the spreadsheet: ${(error as Error).message}`);
    }
  }

  private async withManualChoicesKept(year: number, incoming: Transaction[]): Promise<Transaction[]> {
    const current = await this.transactions.findByYear(year);
    const manual = new Map(current.filter((t) => t.categorySource === 'manual').map((t) => [t.id, t]));
    return incoming.map((t) => {
      const previous = manual.get(t.id);
      if (!previous) return t;
      return { ...t, category: previous.category, categorySource: 'manual', tags: [...new Set([...t.tags, ...previous.tags])] };
    });
  }

  private async isLatestYear(year: number): Promise<boolean> {
    return (await this.workbooks.findYears()).every((stored) => stored <= year);
  }

  private async applySheetSettings({ settings }: ImportResult): Promise<void> {
    await this.settings.update(settings);
    if (settings.goalBRL) await this.goals.syncPatrimonyTarget(settings.goalBRL);
  }
}
