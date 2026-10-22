import type { Budget } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import { BudgetRecord } from './budget.schema.js';

@Injectable()
export class BudgetsRepository extends DocumentRepository<Budget, 'category'> {
  constructor(@InjectModel(BudgetRecord.name) model: Model<BudgetRecord>) {
    super(model, 'category');
  }
}
