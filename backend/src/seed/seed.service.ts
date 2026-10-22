import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { RulesService } from '../rules/rules.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** A fresh database starts with the default category rules and settings. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    private readonly rules: RulesService,
    private readonly settings: SettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rules.seedDefaults();
    await this.settings.seedDefaults();
  }
}
