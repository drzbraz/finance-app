import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BudgetRecord, BudgetSchema } from './budget.schema.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsRepository } from './budgets.repository.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: BudgetRecord.name, schema: BudgetSchema }])],
  controllers: [BudgetsController],
  providers: [BudgetsRepository, BudgetsService],
  exports: [BudgetsRepository],
})
export class BudgetsModule {}
