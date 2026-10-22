import { DEFAULT_SETTINGS, type Settings } from '@finance/shared';
import { Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository.js';

export type SettingsPatch = Partial<Omit<Settings, 'id'>>;

@Injectable()
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  /** Stored settings over the defaults, so documents saved by older versions get new fields. */
  async get(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...(await this.settings.find()) };
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const next: Settings = { ...(await this.get()), ...patch, id: 'settings' };
    await this.settings.save(next);
    return next;
  }

  async recordExport(year: number, exportedAt: string): Promise<Settings> {
    const { lastExportAt } = await this.get();
    return this.update({ lastExportAt: { ...lastExportAt, [year]: exportedAt } });
  }

  async seedDefaults(): Promise<void> {
    if (!(await this.settings.find())) await this.settings.save(DEFAULT_SETTINGS);
  }
}
