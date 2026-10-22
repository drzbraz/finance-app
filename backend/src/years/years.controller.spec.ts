import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { YearsController } from './years.controller.js';
import type { YearsService } from './years.service.js';

describe('YearsController', () => {
  let service: Mocked<YearsService>;
  let controller: YearsController;

  beforeEach(() => {
    service = mockOf<YearsService>();
    controller = new YearsController(service);
  });

  it('GET /years lists them', async () => {
    service.list.mockResolvedValue([2026]);
    await expect(controller.list()).resolves.toEqual([2026]);
  });

  it('GET /years/:year returns its status', async () => {
    const status = { year: 2026, exists: true, appOnlyCount: 1, unexportedCount: 2 };
    service.status.mockResolvedValue(status);
    await expect(controller.status(2026)).resolves.toEqual(status);
  });

  it('DELETE /years/:year removes it', async () => {
    await controller.remove(2026);
    expect(service.remove).toHaveBeenCalledWith(2026);
  });
});
