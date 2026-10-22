import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SeedService } from './seed.service.js';

@Module({ imports: [RulesModule, SettingsModule], providers: [SeedService] })
export class SeedModule {}
