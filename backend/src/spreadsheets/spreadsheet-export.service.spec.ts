import type { Mocked } from 'vitest';
import type { Transaction } from '@finance/shared';
import type { SettingsService } from '../settings/settings.service.js';
import { tx } from '../testing/factories.js';
import { FIXED_NOW, fixedClock, immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import { buildWorkbook, loadSheet } from '../testing/workbook.fixture.js';
import type { TransactionsRepository } from '../transactions/transactions.repository.js';
import type { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { parseWorkbook } from './domain/parser/parse-workbook.js';
import { SpreadsheetExportService } from './spreadsheet-export.service.js';

describe('SpreadsheetExportService', () => {
  let transactions: Mocked<TransactionsRepository>;
  let workbooks: Mocked<WorkbooksRepository>;
  let settings: Mocked<SettingsService>;
  let unitOfWork: ReturnType<typeof immediateUnitOfWork>;
  let service: SpreadsheetExportService;
  let original: Buffer;
  let imported: Transaction[];

  beforeAll(async () => {
    original = await buildWorkbook();
    imported = (await parseWorkbook(original, { fileName: 'Controle financeiro 2026.xlsx' })).transactions;
  });

  beforeEach(() => {
    transactions = mockOf<TransactionsRepository>();
    workbooks = mockOf<WorkbooksRepository>();
    settings = mockOf<SettingsService>();
    unitOfWork = immediateUnitOfWork();
    service = new SpreadsheetExportService(transactions, workbooks, settings, unitOfWork, fixedClock());
    workbooks.findByKey.mockResolvedValue({ year: 2026, fileName: 'Controle financeiro 2026.xlsx', importedAt: 'x', data: original });
  });

  it('writes the year into its stored file and makes the result the new baseline', async () => {
    transactions.findByYear.mockResolvedValue(imported);
    const out = await service.export(2026);

    expect(out.fileName).toBe('Controle financeiro 2026.xlsx');
    expect((await loadSheet(out.data)).getCell('B15').value).toBe(25);
    expect(workbooks.save).toHaveBeenCalledWith({ year: 2026, fileName: out.fileName, importedAt: FIXED_NOW, data: out.data });
    expect(settings.recordExport).toHaveBeenCalledWith(2026, FIXED_NOW);
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
  });

  it('re-points new entries to their final cell, with the id a re-import would give them', async () => {
    transactions.findByYear.mockResolvedValue([...imported, tx({ id: 'app-1', month: 3, description: 'pizza', amount: 9 })]);
    const out = await service.export(2026);

    expect(transactions.deleteByKeys).toHaveBeenCalledWith(['app-1']);
    const moved: Transaction[] = transactions.saveMany.mock.calls[0][0];
    const pizza = moved.find((t) => t.description === 'pizza')!;
    expect(pizza.id).toBe(`imp-2026-${pizza.source!.cell}`);
    expect((await loadSheet(out.data)).getCell(pizza.source!.cell).value).toBe(9);
  });

  it('drops soft-deleted rows, whose cells the file no longer has', async () => {
    const deleted = { ...imported.find((t) => t.id === 'imp-2026-B16')!, deleted: true };
    transactions.findByYear.mockResolvedValue([...imported.filter((t) => t.id !== deleted.id), deleted]);
    const out = await service.export(2026);

    expect(transactions.deleteByKeys).toHaveBeenCalledWith(['imp-2026-B16']);
    expect((await loadSheet(out.data)).getCell('B16').value).toBeNull();
  });

  it('only writes the ledger when the year was never imported, changing nothing stored', async () => {
    workbooks.findByKey.mockResolvedValue(null);
    transactions.findByYear.mockResolvedValue([tx({ id: 'app-1', year: 2027 })]);
    const out = await service.export(2027);

    expect(out.fileName).toBe('Controle financeiro 2027.xlsx');
    expect(out.warnings.join(' ')).toMatch(/Lançamentos/);
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(settings.recordExport).not.toHaveBeenCalled();
  });
});
