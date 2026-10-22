import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { type Model } from 'mongoose';
import { DocumentRepository } from '../database/document.repository.js';
import type { StoredWorkbook } from './stored-workbook.js';
import { WorkbookRecord } from './workbook.schema.js';

@Injectable()
export class WorkbooksRepository extends DocumentRepository<StoredWorkbook, 'year'> {
  constructor(@InjectModel(WorkbookRecord.name) model: Model<WorkbookRecord>) {
    super(model, 'year');
  }

  async findYears(): Promise<number[]> {
    const years: number[] = await this.model.distinct('_id').exec();
    return years.sort((a, b) => a - b);
  }

  /** `lean()` returns binary fields as BSON Binary; the app works with Node Buffers. */
  protected override toEntity(doc: Record<string, unknown>): StoredWorkbook {
    const workbook = super.toEntity(doc);
    const data = workbook.data as unknown;
    return { ...workbook, data: data instanceof mongoose.mongo.Binary ? Buffer.from(data.value()) : Buffer.from(data as Buffer) };
  }
}
