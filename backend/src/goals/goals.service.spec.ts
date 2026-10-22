import type { Mock, Mocked } from 'vitest';
import type { Goal } from '@finance/shared';
import { FIXED_NOW, fixedClock, mockOf } from '../testing/mocks.js';
import { GoalsRepository } from './goals.repository.js';
import { GoalsService } from './goals.service.js';
import { PATRIMONY_GOAL_ID, patrimonyGoal } from './patrimony-goal.js';

describe('GoalsService', () => {
  let repository: Mocked<GoalsRepository>;
  let service: GoalsService;
  const trip: Goal = { id: 'g1', name: 'Viagem', target: 2000, currency: 'EUR', source: 'manual', contributions: [], createdAt: 'x' };

  beforeEach(() => {
    repository = mockOf<GoalsRepository>();
    service = new GoalsService(repository, fixedClock());
  });

  it('lists, saves and removes goals', async () => {
    repository.findAll.mockResolvedValue([trip]);
    await expect(service.list()).resolves.toEqual([trip]);
    await service.save(trip);
    expect(repository.save).toHaveBeenCalledWith(trip);
    await service.remove('g1');
    expect(repository.deleteByKey).toHaveBeenCalledWith('g1');
  });

  it('creates the Patrimônio goal from the sheet META when there is none', async () => {
    repository.findByKey.mockResolvedValue(null);
    await service.syncPatrimonyTarget(100_000);
    expect(repository.findByKey).toHaveBeenCalledWith(PATRIMONY_GOAL_ID);
    expect(repository.save).toHaveBeenCalledWith(patrimonyGoal(100_000, FIXED_NOW));
  });

  it('only updates the target of an existing Patrimônio goal, keeping what the user edited', async () => {
    const edited = { ...patrimonyGoal(50_000, 'then'), name: 'Casa própria', targetDate: '2030-01-01' };
    repository.findByKey.mockResolvedValue(edited);
    await service.syncPatrimonyTarget(100_000);
    expect(repository.save).toHaveBeenCalledWith({ ...edited, target: 100_000 });
  });
});
