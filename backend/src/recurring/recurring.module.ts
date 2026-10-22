import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { RecurringController } from './recurring.controller.js';
import { RecurringRepository } from './recurring.repository.js';
import { RecurringRecord, RecurringSchema } from './recurring.schema.js';
import { RecurringService } from './recurring.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: RecurringRecord.name, schema: RecurringSchema }]), TransactionsModule],
  controllers: [RecurringController],
  providers: [RecurringRepository, RecurringService],
  exports: [RecurringRepository],
})
export class RecurringModule {}
