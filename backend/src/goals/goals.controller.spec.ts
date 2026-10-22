import type { Goal } from '@finance/shared';
import { BadRequestException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { GoalsController } from './goals.controller.js';
import type { GoalsService } from './goals.service.js';

describe('GoalsController', () => {
  const goal: Goal = { id: 'g', name: 'Viagem', target: 1, currency: 'EUR', source: 'manual', contributions: [], createdAt: 'x' };
  let service: Mocked<GoalsService>;
  let controller: GoalsController;

  beforeEach(() => {
    service = mockOf<GoalsService>();
    controller = new GoalsController(service);
  });

  it('GET /goals lists them', async () => {
    service.list.mockResolvedValue([goal]);
    await expect(controller.list()).resolves.toEqual([goal]);
  });

  it('PUT /goals/:id saves a goal whose id matches the URL', async () => {
    await controller.save('g', goal);
    expect(service.save).toHaveBeenCalledWith(goal);
    expect(() => controller.save('other', goal)).toThrow(BadRequestException);
  });

  it('DELETE /goals/:id removes one', async () => {
    await controller.remove('g');
    expect(service.remove).toHaveBeenCalledWith('g');
  });
});
