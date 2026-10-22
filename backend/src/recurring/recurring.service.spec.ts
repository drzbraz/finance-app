import type { Mock, Mocked } from 'vitest';
import type { RecurringItem } from '@finance/shared';
import { NotFoundException } from '@nestjs/common';
import { tx } from '../testing/factories.js';
import { FIXED_NOW, fixedClock, immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { RecurringRepository } from './recurring.repository.js';
import { RecurringService } from './recurring.service.js';

describe('RecurringService', () => {
  let recurring: Mocked<RecurringRepository>;
  let transactions: Mocked<TransactionsRepository>;
  let unitOfWork: ReturnType<typeof immediateUnitOfWork>;
  let service: RecurringService;
  const rent: RecurringItem = { key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', dueDay: 5, active: true };

  beforeEach(() => {
    recurring = mockOf<RecurringRepository>();
    transactions = mockOf<TransactionsRepository>();
    unitOfWork = immediateUnitOfWork();
    service = new RecurringService(recurring, transactions, unitOfWork, fixedClock());
  });

  it('lists and saves lines', async () => {
    recurring.findAll.mockResolvedValue([rent]);
    await expect(service.list()).resolves.toEqual([rent]);
    await service.save(rent);
    expect(recurring.save).toHaveBeenCalledWith(rent);
  });

  it('tombstones the old key on a rename and saves the re-labelled transactions, in one transaction', async () => {
    const next = { ...rent, key: 'fixed|Renda', description: 'Renda' };
    const renamed = [tx({ id: 'a', description: 'Renda' })];

    await service.update({ previous: rent, next, renamed });

    expect(recurring.save).toHaveBeenNthCalledWith(1, { ...rent, removed: true, active: false });
    expect(recurring.save).toHaveBeenNthCalledWith(2, { ...next, removed: false });
    expect(transactions.saveMany).toHaveBeenCalledWith([{ ...renamed[0], updatedAt: FIXED_NOW }]);
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
  });

  it('does not tombstone when the key is unchanged', async () => {
    await service.update({ previous: rent, next: { ...rent, dueDay: 10 }, renamed: [] });
    expect(recurring.save).toHaveBeenCalledTimes(1);
    expect(recurring.save).toHaveBeenCalledWith({ ...rent, dueDay: 10, removed: false });
  });

  it('saves a brand-new line (no previous)', async () => {
    await service.update({ previous: null, next: rent, renamed: [] });
    expect(recurring.save).toHaveBeenCalledWith({ ...rent, removed: false });
  });

  it('removes a line by tombstoning it, so past transactions keep their history', async () => {
    recurring.findByKey.mockResolvedValue(rent);
    await service.remove(rent.key);
    expect(recurring.save).toHaveBeenCalledWith({ ...rent, removed: true, active: false });
  });

  it('fails to remove an unknown line', async () => {
    recurring.findByKey.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
