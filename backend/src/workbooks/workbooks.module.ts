import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkbookRecord, WorkbookSchema } from './workbook.schema.js';
import { WorkbooksRepository } from './workbooks.repository.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: WorkbookRecord.name, schema: WorkbookSchema }])],
  providers: [WorkbooksRepository],
  exports: [WorkbooksRepository],
})
export class WorkbooksModule {}
