import type { Mocked } from 'vitest';
import { DEFAULT_SETTINGS, type CategoryRule, type Transaction } from '@finance/shared';
import { UnprocessableEntityException } from '@nestjs/common';
import type { GoalsService } from '../goals/goals.service.js';
import type { RulesRepository } from '../rules/rules.repository.js';
import type { SettingsService } from '../settings/settings.service.js';
import { tx } from '../testing/factories.js';
import { FIXED_NOW, fixedClock, immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import { buildWorkbook } from '../testing/workbook.fixture.js';
import type { TransactionsRepository } from '../transactions/transactions.repository.js';
import type { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { SpreadsheetImportService } from './spreadsheet-import.service.js';
import type { UploadedSpreadsheet } from './uploaded-spreadsheet.js';

describe('SpreadsheetImportService', () => {
  const lidl: CategoryRule = { id: 'r', keyword: 'uber', category: 'Transporte', priority: 10 };
  let transactions: Mocked<TransactionsRepository>;
  let rules: Mocked<RulesRepository>;
  let workbooks: Mocked<WorkbooksRepository>;
  let settings: Mocked<SettingsService>;
  let goals: Mocked<GoalsService>;
  let unitOfWork: ReturnType<typeof immediateUnitOfWork>;
  let service: SpreadsheetImportService;
  let file: UploadedSpreadsheet;

  beforeAll(async () => {
    file = { fileName: 'Controle financeiro 2026.xlsx', data: await buildWorkbook() };
  });

  beforeEach(() => {
    transactions = mockOf<TransactionsRepository>();
    rules = mockOf<RulesRepository>();
    workbooks = mockOf<WorkbooksRepository>();
    settings = mockOf<SettingsService>();
    goals = mockOf<GoalsService>();
    unitOfWork = immediateUnitOfWork();
    service = new SpreadsheetImportService(transactions, rules, workbooks, settings, goals, unitOfWork, fixedClock());
    rules.findAll.mockResolvedValue([lidl]);
    transactions.findByYear.mockResolvedValue([]);
    transactions.countByYear.mockResolvedValue(0);
    transactions.countAppOnly.mockResolvedValue(0);
    workbooks.findYears.mockResolvedValue([2026]);
    settings.get.mockResolvedValue(DEFAULT_SETTINGS);
  });

  const saved = (): Transaction[] => transactions.saveMany.mock.calls[0][0];

  describe('preview', () => {
    it('parses and categorises without saving anything', async () => {
      const preview = await service.preview(file);
      expect(preview.result.year).toBe(2026);
      expect(preview.result.transactions.find((t) => t.description === 'uber')!.category).toBe('Transporte');
      expect(preview).toMatchObject({ existing: false, appOnlyCount: 0 });
      expect(transactions.saveMany).not.toHaveBeenCalled();
      expect(unitOfWork.run).not.toHaveBeenCalled();
    });

    it('reports what the year already has', async () => {
      transactions.countByYear.mockResolvedValue(10);
      transactions.countAppOnly.mockResolvedValue(2);
      await expect(service.preview(file)).resolves.toMatchObject({ existing: true, appOnlyCount: 2 });
      expect(transactions.countByYear).toHaveBeenCalledWith(2026);
    });

    it('uses the year given by the user over the one in the file', async () => {
      const preview = await service.preview(file, 2024);
      expect(preview.result.year).toBe(2024);
      expect(preview.result.transactions.every((t) => t.id.startsWith('imp-2024-'))).toBe(true);
    });

    it('has nothing to compare when no year is found', async () => {
      const noYear = { fileName: 'planilha.xlsx', data: await buildWorkbook() };
      await expect(service.preview(noYear)).resolves.toMatchObject({ existing: false, appOnlyCount: 0 });
      expect(transactions.countByYear).not.toHaveBeenCalled();
    });

    it('turns an unreadable file into a 422', async () => {
      const broken = { fileName: 'x.xlsx', data: Buffer.from('not a zip') };
      await expect(service.preview(broken)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('import', () => {
    it('replaces the imported rows, stores the file and applies the sheet settings, in one transaction', async () => {
      const summary = await service.import(2026, file);

      expect(unitOfWork.run).toHaveBeenCalledTimes(1);
      expect(transactions.deleteImportedByYear).toHaveBeenCalledWith(2026);
      expect(saved().length).toBe(summary.imported);
      expect(workbooks.save).toHaveBeenCalledWith({ year: 2026, fileName: file.fileName, importedAt: FIXED_NOW, data: file.data });
      expect(settings.update).toHaveBeenCalledWith(expect.objectContaining({ eurBrlRate: 6.2, goalBRL: 100000 }));
      expect(goals.syncPatrimonyTarget).toHaveBeenCalledWith(100000);
      expect(summary.year).toBe(2026);
    });

    it('keeps categories and tags the user chose by hand for the same cell', async () => {
      transactions.findByYear.mockResolvedValue([
        tx({ id: 'imp-2026-D15', category: 'Lazer', categorySource: 'manual', tags: ['mine'] }),
      ]);
      await service.import(2026, file);
      expect(saved().find((t) => t.id === 'imp-2026-D15')).toMatchObject({ category: 'Lazer', categorySource: 'manual', tags: ['mine'] });
    });

    it('keeps a Splitwise split while the cell still holds my share', async () => {
      const share = (await service.preview(file)).result.transactions.find((t) => t.id === 'imp-2026-D15')!.amount;
      transactions.findByYear.mockResolvedValue([
        tx({ id: 'imp-2026-D15', amount: share, split: { people: 2, total: share * 2 } }),
        tx({ id: 'imp-2026-D16', amount: -1, split: { people: 3, total: 9 } }),
      ]);
      await service.import(2026, file);
      expect(saved().find((t) => t.id === 'imp-2026-D15')?.split).toEqual({ people: 2, total: share * 2 });
      expect(saved().find((t) => t.id === 'imp-2026-D16')?.split).toBeUndefined();
    });

    it('applies the rules to the other rows', async () => {
      await service.import(2026, file);
      expect(saved().find((t) => t.id === 'imp-2026-D15')!.category).toBe('Transporte');
    });

    it('does not roll settings back when an older year is imported', async () => {
      workbooks.findYears.mockResolvedValue([2025, 2026]);
      await service.import(2025, file);
      expect(settings.update).not.toHaveBeenCalled();
      expect(goals.syncPatrimonyTarget).not.toHaveBeenCalled();
    });

    it('leaves the goal alone when the sheet has no META', async () => {
      const noGoal = { fileName: file.fileName, data: await buildWorkbook({ extra: (ws) => (ws.getCell('O10').value = 0) }) };
      await service.import(2026, noGoal);
      expect(goals.syncPatrimonyTarget).not.toHaveBeenCalled();
    });

    it('fails before touching the database when the file cannot be read', async () => {
      await expect(service.import(2026, { fileName: 'x.xlsx', data: Buffer.from('nope') })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(unitOfWork.run).not.toHaveBeenCalled();
    });
  });
});
