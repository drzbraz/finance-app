import type { Backup } from '@finance/shared';
import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { BackupController } from './backup.controller.js';
import type { BackupService } from './backup.service.js';
import type { BackupDto } from './dto/backup.dto.js';

describe('BackupController', () => {
  let service: Mocked<BackupService>;
  let controller: BackupController;

  beforeEach(() => {
    service = mockOf<BackupService>();
    controller = new BackupController(service);
  });

  it('GET /backup exports everything', async () => {
    const backup = { app: 'finance-app' } as Backup;
    service.export.mockResolvedValue(backup);
    await expect(controller.export()).resolves.toBe(backup);
  });

  it('POST /backup restores the body', async () => {
    const body = { app: 'finance-app', version: 2 } as BackupDto;
    await controller.restore(body);
    expect(service.restore).toHaveBeenCalledWith(body);
  });
});
