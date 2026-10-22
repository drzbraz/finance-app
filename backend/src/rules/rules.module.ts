import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { RuleRecord, RuleSchema } from './rule.schema.js';
import { RulesController } from './rules.controller.js';
import { RulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: RuleRecord.name, schema: RuleSchema }]), TransactionsModule],
  controllers: [RulesController],
  providers: [RulesRepository, RulesService],
  exports: [RulesRepository, RulesService],
})
export class RulesModule {}
