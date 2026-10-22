import type { Mock, Mocked } from 'vitest';
import { DEFAULT_SETTINGS } from '@finance/shared';
import { immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import { SettingsService } from '../settings/settings.service.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { YearsService } from './years.service.js';

describe('YearsService', () => {
  let transactions: Mocked<TransactionsRepository>;
  let workbooks: Mocked<WorkbooksRepository>;
  let settings: Mocked<SettingsService>;
  let unitOfWork: ReturnType<typeof immediateUnitOfWork>;
  let service: YearsService;

  beforeEach(() => {
    transactions = mockOf<TransactionsRepository>();
    workbooks = mockOf<WorkbooksRepository>();
    settings = mockOf<SettingsService>();
    unitOfWork = immediateUnitOfWork();
    service = new YearsService(transactions, workbooks, settings, unitOfWork);
    transactions.countByYear.mockResolvedValue(5);
    transactions.countAppOnly.mockResolvedValue(2);
    transactions.countChangedSince.mockResolvedValue(3);
  });

  it('lists the years that have transactions', async () => {
    transactions.findYears.mockResolvedValue([2025, 2026]);
    await expect(service.list()).resolves.toEqual([2025, 2026]);
  });

  it('counts changes since the last export', async () => {
    settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, lastExportAt: { 2026: 'exported' } });
    await expect(service.status(2026)).resolves.toEqual({ year: 2026, exists: true, appOnlyCount: 2, unexportedCount: 3 });
    expect(transactions.countChangedSince).toHaveBeenCalledWith(2026, 'exported');
  });

  it('counts changes since the import when the year was never exported', async () => {
    settings.get.mockResolvedValue(DEFAULT_SETTINGS);
    workbooks.findByKey.mockResolvedValue({ year: 2026, fileName: 'f.xlsx', importedAt: 'imported', data: Buffer.alloc(0) });
    await service.status(2026);
    expect(transactions.countChangedSince).toHaveBeenCalledWith(2026, 'imported');
  });

  it('counts every edit of a year that was never imported nor exported', async () => {
    settings.get.mockResolvedValue(DEFAULT_SETTINGS);
    workbooks.findByKey.mockResolvedValue(null);
    transactions.countByYear.mockResolvedValue(0);
    await expect(service.status(2030)).resolves.toMatchObject({ exists: false });
    expect(transactions.countChangedSince).toHaveBeenCalledWith(2030, '');
  });

  it('deletes a year and its spreadsheet together', async () => {
    await service.remove(2026);
    expect(transactions.deleteByYear).toHaveBeenCalledWith(2026);
    expect(workbooks.deleteByKey).toHaveBeenCalledWith(2026);
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
  });
});
