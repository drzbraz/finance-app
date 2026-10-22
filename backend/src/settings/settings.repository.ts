import type { Settings } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import { SettingsRecord } from './settings.schema.js';

@Injectable()
export class SettingsRepository extends DocumentRepository<Settings, 'id'> {
  constructor(@InjectModel(SettingsRecord.name) model: Model<SettingsRecord>) {
    super(model, 'id');
  }

  find(): Promise<Settings | null> {
    return this.findByKey('settings');
  }
}
