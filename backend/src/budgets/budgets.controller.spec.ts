import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { BudgetsController } from './budgets.controller.js';
import type { BudgetsService } from './budgets.service.js';

describe('BudgetsController', () => {
  let service: Mocked<BudgetsService>;
  let controller: BudgetsController;

  beforeEach(() => {
    service = mockOf<BudgetsService>();
    controller = new BudgetsController(service);
  });

  it('GET /budgets lists them', async () => {
    service.list.mockResolvedValue([{ category: 'Lazer', monthlyLimit: 10 }]);
    await expect(controller.list()).resolves.toEqual([{ category: 'Lazer', monthlyLimit: 10 }]);
  });

  it('PUT /budgets/:category saves the limit for that category', async () => {
    await controller.save('Saúde', { monthlyLimit: 80 });
    expect(service.save).toHaveBeenCalledWith({ category: 'Saúde', monthlyLimit: 80 });
  });

  it('POST /budgets/bulk and /budgets/bulk-delete', async () => {
    const budgets = [{ category: 'Lazer', monthlyLimit: 10 }];
    await controller.saveMany({ budgets });
    expect(service.saveMany).toHaveBeenCalledWith(budgets);
    await controller.removeMany({ categories: ['Lazer'] });
    expect(service.removeMany).toHaveBeenCalledWith(['Lazer']);
  });
});
