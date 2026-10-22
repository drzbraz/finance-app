import type { CategoryRule } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import { RuleRecord } from './rule.schema.js';

@Injectable()
export class RulesRepository extends DocumentRepository<CategoryRule, 'id'> {
  constructor(@InjectModel(RuleRecord.name) model: Model<RuleRecord>) {
    super(model, 'id');
  }
}
