import type { RecurringItem } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import { RecurringRecord } from './recurring.schema.js';

@Injectable()
export class RecurringRepository extends DocumentRepository<RecurringItem, 'key'> {
  constructor(@InjectModel(RecurringRecord.name) model: Model<RecurringRecord>) {
    super(model, 'key');
  }
}
