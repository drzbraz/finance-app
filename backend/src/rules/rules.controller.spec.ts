import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { RulesController } from './rules.controller.js';
import type { RulesService } from './rules.service.js';

describe('RulesController', () => {
  const rule = { id: 'r', keyword: 'pizza', category: 'Restaurante', priority: 50 };
  let service: Mocked<RulesService>;
  let controller: RulesController;

  beforeEach(() => {
    service = mockOf<RulesService>();
    controller = new RulesController(service);
  });

  it('GET /rules lists them', async () => {
    service.list.mockResolvedValue([rule]);
    await expect(controller.list()).resolves.toEqual([rule]);
  });

  it('POST /rules adds and applies a rule', async () => {
    service.add.mockResolvedValue({ rule, updated: 3 });
    await expect(controller.add(rule)).resolves.toEqual({ rule, updated: 3 });
  });

  it('DELETE /rules/:id removes one', async () => {
    await controller.remove('r');
    expect(service.remove).toHaveBeenCalledWith('r');
  });
});
