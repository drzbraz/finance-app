import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { RecurringModule } from '../recurring/recurring.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { WorkbooksModule } from '../workbooks/workbooks.module.js';
import { BackupController } from './backup.controller.js';
import { BackupService } from './backup.service.js';

@Module({
  imports: [TransactionsModule, RulesModule, SettingsModule, WorkbooksModule, BudgetsModule, GoalsModule, RecurringModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
