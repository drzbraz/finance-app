import type { Mocked } from 'vitest';
import { BACKUP_VERSION, DEFAULT_SETTINGS, type Backup } from '@finance/shared';
import type { BudgetsRepository } from '../budgets/budgets.repository.js';
import type { GoalsRepository } from '../goals/goals.repository.js';
import { patrimonyGoal } from '../goals/patrimony-goal.js';
import type { RecurringRepository } from '../recurring/recurring.repository.js';
import type { RulesRepository } from '../rules/rules.repository.js';
import type { SettingsRepository } from '../settings/settings.repository.js';
import type { SettingsService } from '../settings/settings.service.js';
import { tx } from '../testing/factories.js';
import { FIXED_NOW, fixedClock, immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import type { TransactionsRepository } from '../transactions/transactions.repository.js';
import type { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { BackupService, type IncomingBackup } from './backup.service.js';

describe('BackupService', () => {
  let transactions: Mocked<TransactionsRepository>;
  let rules: Mocked<RulesRepository>;
  let settingsRepository: Mocked<SettingsRepository>;
  let settings: Mocked<SettingsService>;
  let workbooks: Mocked<WorkbooksRepository>;
  let budgets: Mocked<BudgetsRepository>;
  let goals: Mocked<GoalsRepository>;
  let recurring: Mocked<RecurringRepository>;
  let unitOfWork: ReturnType<typeof immediateUnitOfWork>;
  let service: BackupService;

  beforeEach(() => {
    transactions = mockOf();
    rules = mockOf();
    settingsRepository = mockOf();
    settings = mockOf();
    workbooks = mockOf();
    budgets = mockOf();
    goals = mockOf();
    recurring = mockOf();
    unitOfWork = immediateUnitOfWork();
    service = new BackupService(transactions, rules, settingsRepository, settings, workbooks, budgets, goals, recurring, unitOfWork, fixedClock());
  });

  it('exports everything, with the spreadsheets as base64', async () => {
    transactions.findAll.mockResolvedValue([tx({ id: 'a' })]);
    rules.findAll.mockResolvedValue([]);
    settings.get.mockResolvedValue(DEFAULT_SETTINGS);
    workbooks.findAll.mockResolvedValue([{ year: 2026, fileName: 'f.xlsx', importedAt: 'x', data: Buffer.from('xlsx') }]);
    budgets.findAll.mockResolvedValue([{ category: 'Lazer', monthlyLimit: 50 }]);
    goals.findAll.mockResolvedValue([]);
    recurring.findAll.mockResolvedValue([]);

    const backup = await service.export();

    expect(backup).toMatchObject({ app: 'finance-app', version: BACKUP_VERSION, exportedAt: FIXED_NOW, settings: DEFAULT_SETTINGS });
    expect(backup.workbooks).toEqual([{ year: 2026, fileName: 'f.xlsx', importedAt: 'x', dataBase64: Buffer.from('xlsx').toString('base64') }]);
    expect(backup.transactions.map((t) => t.id)).toEqual(['a']);
    expect(backup.budgets).toEqual([{ category: 'Lazer', monthlyLimit: 50 }]);
  });

  const v2: Backup = {
    app: 'finance-app',
    version: 2,
    exportedAt: 'x',
    transactions: [tx({ id: 'a' })],
    rules: [{ id: 'r', keyword: 'k', category: 'C', priority: 1 }],
    settings: { ...DEFAULT_SETTINGS, goalBRL: 5000 },
    workbooks: [{ year: 2026, fileName: 'f.xlsx', importedAt: 'x', dataBase64: Buffer.from('xlsx').toString('base64') }],
    budgets: [{ category: 'Lazer', monthlyLimit: 50 }],
    goals: [],
    recurring: [{ key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', active: true }],
  };

  it('replaces all data with the backup, in one transaction', async () => {
    await service.restore(v2);

    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    for (const repository of [transactions, rules, settingsRepository, workbooks, budgets, goals, recurring]) {
      expect(repository.deleteAll).toHaveBeenCalled();
    }
    expect(transactions.saveMany).toHaveBeenCalledWith(v2.transactions);
    expect(rules.saveMany).toHaveBeenCalledWith(v2.rules);
    expect(settingsRepository.save).toHaveBeenCalledWith(v2.settings);
    expect(workbooks.saveMany).toHaveBeenCalledWith([{ year: 2026, fileName: 'f.xlsx', importedAt: 'x', data: Buffer.from('xlsx') }]);
    expect(budgets.saveMany).toHaveBeenCalledWith(v2.budgets);
    expect(recurring.saveMany).toHaveBeenCalledWith(v2.recurring);
    expect(goals.saveMany).toHaveBeenCalledWith([]); // v2 with no goals stays without goals
  });

  it('rebuilds the Patrimônio goal and fills missing settings for a version 1 backup', async () => {
    const v1: IncomingBackup = { ...v2, version: 1, settings: { goalBRL: 5000 }, budgets: undefined, goals: undefined, recurring: undefined };
    await service.restore(v1);

    expect(settingsRepository.save).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, goalBRL: 5000 });
    expect(goals.saveMany).toHaveBeenCalledWith([patrimonyGoal(5000, FIXED_NOW)]);
    expect(budgets.saveMany).toHaveBeenCalledWith([]);
    expect(recurring.saveMany).toHaveBeenCalledWith([]);
  });

  it('creates no goal for a version 1 backup without META', async () => {
    await service.restore({ ...v2, version: 1, settings: {}, goals: undefined });
    expect(goals.saveMany).toHaveBeenCalledWith([]);
  });
});
