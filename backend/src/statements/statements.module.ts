import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { StatementImportService } from './statement-import.service.js';
import { StatementsController } from './statements.controller.js';

@Module({
  imports: [TransactionsModule, RulesModule],
  controllers: [StatementsController],
  providers: [StatementImportService],
})
export class StatementsModule {}
