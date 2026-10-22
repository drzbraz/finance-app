import type { Mock, Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { BudgetsRepository } from './budgets.repository.js';
import { BudgetsService } from './budgets.service.js';

describe('BudgetsService', () => {
  let repository: Mocked<BudgetsRepository>;
  let service: BudgetsService;

  beforeEach(() => {
    repository = mockOf<BudgetsRepository>();
    service = new BudgetsService(repository);
  });

  it('lists the budgets', async () => {
    repository.findAll.mockResolvedValue([{ category: 'Lazer', monthlyLimit: 100 }]);
    await expect(service.list()).resolves.toEqual([{ category: 'Lazer', monthlyLimit: 100 }]);
  });

  it('saves a positive limit', async () => {
    await service.save({ category: 'Lazer', monthlyLimit: 100 });
    expect(repository.save).toHaveBeenCalledWith({ category: 'Lazer', monthlyLimit: 100 });
    expect(repository.deleteByKey).not.toHaveBeenCalled();
  });

  it.each([0, -5])('treats a limit of %d as "no budget" and removes it', async (monthlyLimit) => {
    await service.save({ category: 'Lazer', monthlyLimit });
    expect(repository.deleteByKey).toHaveBeenCalledWith('Lazer');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('saves several budgets, removing the zero ones', async () => {
    await service.saveMany([
      { category: 'Lazer', monthlyLimit: 100 },
      { category: 'Casa', monthlyLimit: 0 },
    ]);
    expect(repository.saveMany).toHaveBeenCalledWith([{ category: 'Lazer', monthlyLimit: 100 }]);
    expect(repository.deleteByKeys).toHaveBeenCalledWith(['Casa']);
  });

  it('removes budgets by category', async () => {
    await service.removeMany(['Lazer', 'Casa']);
    expect(repository.deleteByKeys).toHaveBeenCalledWith(['Lazer', 'Casa']);
  });
});
