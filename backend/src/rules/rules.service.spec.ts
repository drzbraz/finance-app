import type { Mock, Mocked } from 'vitest';
import { defaultRules, type CategoryRule } from '@finance/shared';
import { tx } from '../testing/factories.js';
import { immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { RulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';

describe('RulesService', () => {
  let rules: Mocked<RulesRepository>;
  let transactions: Mocked<TransactionsRepository>;
  let service: RulesService;
  const pizza: CategoryRule = { id: 'r1', keyword: 'pizza', category: 'Restaurante', priority: 50 };

  beforeEach(() => {
    rules = mockOf<RulesRepository>();
    transactions = mockOf<TransactionsRepository>();
    service = new RulesService(rules, transactions, immediateUnitOfWork());
  });

  it('lists the rules', async () => {
    rules.findAll.mockResolvedValue([pizza]);
    await expect(service.list()).resolves.toEqual([pizza]);
  });

  it('saves a new rule and re-categorises only the automatic transactions it changes', async () => {
    const matching = tx({ id: 'a', description: 'pizza na praia', category: 'Outros' });
    const unrelated = tx({ id: 'b', description: 'uber', category: 'Outros' });
    transactions.findAutoCategorized.mockResolvedValue([matching, unrelated]);
    rules.findAll.mockResolvedValue([pizza]);

    const result = await service.add(pizza);

    expect(rules.save).toHaveBeenCalledWith(pizza);
    expect(transactions.saveMany).toHaveBeenCalledWith([{ ...matching, category: 'Restaurante' }]);
    expect(result).toEqual({ rule: pizza, updated: 1 });
  });

  it('removes a rule', async () => {
    await service.remove('r1');
    expect(rules.deleteByKey).toHaveBeenCalledWith('r1');
  });

  it('seeds the default rules into an empty collection', async () => {
    rules.count.mockResolvedValue(0);
    await service.seedDefaults();
    expect(rules.saveMany).toHaveBeenCalledWith(defaultRules());
  });

  it('never seeds over existing rules', async () => {
    rules.count.mockResolvedValue(3);
    await service.seedDefaults();
    expect(rules.saveMany).not.toHaveBeenCalled();
  });
});
