import type { Settings } from '@finance/shared';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<Settings> {
    return this.settings.get();
  }

  @Patch()
  update(@Body() patch: UpdateSettingsDto): Promise<Settings> {
    return this.settings.update(patch);
  }
}
