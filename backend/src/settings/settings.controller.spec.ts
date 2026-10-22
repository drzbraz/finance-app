import { DEFAULT_SETTINGS } from '@finance/shared';
import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { SettingsController } from './settings.controller.js';
import type { SettingsService } from './settings.service.js';

describe('SettingsController', () => {
  let service: Mocked<SettingsService>;
  let controller: SettingsController;

  beforeEach(() => {
    service = mockOf<SettingsService>();
    controller = new SettingsController(service);
  });

  it('GET /settings returns them', async () => {
    service.get.mockResolvedValue(DEFAULT_SETTINGS);
    await expect(controller.get()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('PATCH /settings applies a patch', async () => {
    service.update.mockResolvedValue({ ...DEFAULT_SETTINGS, theme: 'dark' });
    await expect(controller.update({ theme: 'dark' })).resolves.toMatchObject({ theme: 'dark' });
    expect(service.update).toHaveBeenCalledWith({ theme: 'dark' });
  });
});
