import type { RecurringItem } from '@finance/shared';
import { BadRequestException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { RecurringController } from './recurring.controller.js';
import type { RecurringService } from './recurring.service.js';

describe('RecurringController', () => {
  const rent: RecurringItem = { key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', active: true };
  let service: Mocked<RecurringService>;
  let controller: RecurringController;

  beforeEach(() => {
    service = mockOf<RecurringService>();
    controller = new RecurringController(service);
  });

  it('GET /recurring lists the lines', async () => {
    service.list.mockResolvedValue([rent]);
    await expect(controller.list()).resolves.toEqual([rent]);
  });

  it('PUT /recurring/:key saves a line whose key matches the URL', async () => {
    await controller.save(rent.key, rent);
    expect(service.save).toHaveBeenCalledWith(rent);
    expect(() => controller.save('fixed|Outro', rent)).toThrow(BadRequestException);
  });

  it('POST /recurring/update applies an edit', async () => {
    const body = { previous: rent, next: { ...rent, dueDay: 3 }, renamed: [] };
    await controller.update(body);
    expect(service.update).toHaveBeenCalledWith(body);
  });

  it('DELETE /recurring/:key removes a line', async () => {
    await controller.remove(rent.key);
    expect(service.remove).toHaveBeenCalledWith(rent.key);
  });
});
