import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionRecord, TransactionSchema } from './transaction.schema.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsRepository } from './transactions.repository.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: TransactionRecord.name, schema: TransactionSchema }])],
  controllers: [TransactionsController],
  providers: [TransactionsRepository, TransactionsService],
  exports: [TransactionsRepository],
})
export class TransactionsModule {}
