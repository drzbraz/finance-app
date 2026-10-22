import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { WorkbooksModule } from '../workbooks/workbooks.module.js';
import { YearsController } from './years.controller.js';
import { YearsService } from './years.service.js';

@Module({
  imports: [TransactionsModule, WorkbooksModule, SettingsModule],
  controllers: [YearsController],
  providers: [YearsService],
})
export class YearsModule {}
