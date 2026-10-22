import type { Mock, Mocked } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@finance/shared';
import { mockOf } from '../testing/mocks.js';
import { SettingsRepository } from './settings.repository.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  let repository: Mocked<SettingsRepository>;
  let service: SettingsService;

  beforeEach(() => {
    repository = mockOf<SettingsRepository>();
    service = new SettingsService(repository);
  });

  it('returns the defaults when nothing is stored', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('fills fields missing from settings saved by older versions', async () => {
    repository.find.mockResolvedValue({ id: 'settings', eurBrlRate: 6.2 } as Settings);
    await expect(service.get()).resolves.toEqual({ ...DEFAULT_SETTINGS, eurBrlRate: 6.2 });
  });

  it('merges a patch over the stored settings and saves it', async () => {
    repository.find.mockResolvedValue({ ...DEFAULT_SETTINGS, goalBRL: 1000 });
    const next = await service.update({ theme: 'dark' });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, goalBRL: 1000, theme: 'dark' });
    expect(repository.save).toHaveBeenCalledWith(next);
  });

  it('records the export time per year, keeping the other years', async () => {
    repository.find.mockResolvedValue({ ...DEFAULT_SETTINGS, lastExportAt: { 2025: 'old' } });
    const next = await service.recordExport(2026, 'new');
    expect(next.lastExportAt).toEqual({ 2025: 'old', 2026: 'new' });
  });

  it('seeds the defaults only once', async () => {
    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(DEFAULT_SETTINGS);
    await service.seedDefaults();
    await service.seedDefaults();
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(DEFAULT_SETTINGS);
  });
});
