import type { Goal } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import { GoalRecord } from './goal.schema.js';

@Injectable()
export class GoalsRepository extends DocumentRepository<Goal, 'id'> {
  constructor(@InjectModel(GoalRecord.name) model: Model<GoalRecord>) {
    super(model, 'id');
  }
}
