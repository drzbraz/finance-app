import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BackupModule } from './backup/backup.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { CommonModule } from './common/common.module.js';
import { loadAppConfig } from './config/app.config.js';
import { DatabaseModule } from './database/database.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HealthModule } from './health/health.module.js';
import { RecurringModule } from './recurring/recurring.module.js';
import { RulesModule } from './rules/rules.module.js';
import { SeedModule } from './seed/seed.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SpreadsheetsModule } from './spreadsheets/spreadsheets.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { YearsModule } from './years/years.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => loadAppConfig()] }),
    CommonModule,
    DatabaseModule,
    HealthModule,
    SeedModule,
    TransactionsModule,
    RulesModule,
    SettingsModule,
    BudgetsModule,
    GoalsModule,
    RecurringModule,
    YearsModule,
    SpreadsheetsModule,
    BackupModule,
  ],
})
export class AppModule {}
