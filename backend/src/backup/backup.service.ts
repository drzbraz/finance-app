import { BACKUP_APP, BACKUP_VERSION, DEFAULT_SETTINGS, type Backup, type Goal, type Settings } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { BudgetsRepository } from '../budgets/budgets.repository.js';
import { Clock } from '../common/clock.js';
import { UnitOfWork } from '../database/unit-of-work.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { patrimonyGoal } from '../goals/patrimony-goal.js';
import { RecurringRepository } from '../recurring/recurring.repository.js';
import { RulesRepository } from '../rules/rules.repository.js';
import { SettingsRepository } from '../settings/settings.repository.js';
import { SettingsService } from '../settings/settings.service.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { WorkbooksRepository } from '../workbooks/workbooks.repository.js';

/** A backup as received: settings saved by older versions may lack newer fields. */
export type IncomingBackup = Omit<Backup, 'settings'> & { settings: Partial<Settings> };

@Injectable()
export class BackupService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly rules: RulesRepository,
    private readonly settingsRepository: SettingsRepository,
    private readonly settings: SettingsService,
    private readonly workbooks: WorkbooksRepository,
    private readonly budgets: BudgetsRepository,
    private readonly goals: GoalsRepository,
    private readonly recurring: RecurringRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** Everything the app stores, spreadsheets included (base64). */
  async export(): Promise<Backup> {
    const [transactions, rules, settings, workbooks, budgets, goals, recurring] = await Promise.all([
      this.transactions.findAll(),
      this.rules.findAll(),
      this.settings.get(),
      this.workbooks.findAll(),
      this.budgets.findAll(),
      this.goals.findAll(),
      this.recurring.findAll(),
    ]);
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: this.clock.isoNow(),
      transactions,
      rules,
      settings,
      workbooks: workbooks.map(({ data, ...info }) => ({ ...info, dataBase64: data.toString('base64') })),
      budgets,
      goals,
      recurring,
    };
  }

  /** Replaces all data with the backup's. A version 1 backup has no goals: its META becomes the Patrimônio goal. */
  restore(backup: IncomingBackup): Promise<void> {
    const settings: Settings = { ...DEFAULT_SETTINGS, ...backup.settings, id: 'settings' };
    return this.unitOfWork.run(async () => {
      await this.clearAll();
      await this.transactions.saveMany(backup.transactions);
      await this.rules.saveMany(backup.rules);
      await this.settingsRepository.save(settings);
      await this.workbooks.saveMany(
        backup.workbooks.map(({ dataBase64, ...info }) => ({ ...info, data: Buffer.from(dataBase64, 'base64') })),
      );
      await this.budgets.saveMany(backup.budgets ?? []);
      await this.recurring.saveMany(backup.recurring ?? []);
      await this.goals.saveMany(backup.goals ?? this.goalsFromSettings(settings));
    });
  }

  private goalsFromSettings(settings: Settings): Goal[] {
    return settings.goalBRL ? [patrimonyGoal(settings.goalBRL, this.clock.isoNow())] : [];
  }

  private async clearAll(): Promise<void> {
    const repositories = [this.transactions, this.rules, this.settingsRepository, this.workbooks, this.budgets, this.goals, this.recurring];
    for (const repository of repositories) await repository.deleteAll();
  }
}
