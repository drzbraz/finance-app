import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { WorkbooksModule } from '../workbooks/workbooks.module.js';
import { SpreadsheetExportService } from './spreadsheet-export.service.js';
import { SpreadsheetImportService } from './spreadsheet-import.service.js';
import { SpreadsheetsController } from './spreadsheets.controller.js';

@Module({
  imports: [TransactionsModule, RulesModule, WorkbooksModule, SettingsModule, GoalsModule],
  controllers: [SpreadsheetsController],
  providers: [SpreadsheetImportService, SpreadsheetExportService],
})
export class SpreadsheetsModule {}
