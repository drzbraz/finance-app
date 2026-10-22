import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsController } from './settings.controller.js';
import { SettingsRepository } from './settings.repository.js';
import { SettingsRecord, SettingsSchema } from './settings.schema.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: SettingsRecord.name, schema: SettingsSchema }])],
  controllers: [SettingsController],
  providers: [SettingsRepository, SettingsService],
  exports: [SettingsRepository, SettingsService],
})
export class SettingsModule {}
