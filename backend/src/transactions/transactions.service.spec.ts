import type { Mock, Mocked } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { tx } from '../testing/factories.js';
import { FIXED_NOW, fixedClock, immediateUnitOfWork, mockOf } from '../testing/mocks.js';
import { TransactionsRepository } from './transactions.repository.js';
import { TransactionsService } from './transactions.service.js';

describe('TransactionsService', () => {
  let repository: Mocked<TransactionsRepository>;
  let unitOfWork: ReturnType<typeof immediateUnitOfWork>;
  let service: TransactionsService;

  beforeEach(() => {
    repository = mockOf<TransactionsRepository>();
    unitOfWork = immediateUnitOfWork();
    service = new TransactionsService(repository, fixedClock(), unitOfWork);
  });

  it('lists the live transactions of a year', async () => {
    const live = [tx()];
    repository.findLiveByYear.mockResolvedValue(live);
    await expect(service.listLive(2026)).resolves.toBe(live);
    expect(repository.findLiveByYear).toHaveBeenCalledWith(2026);
  });

  it('stamps saved transactions with the current time', async () => {
    const saved = await service.save(tx({ id: 'a' }));
    expect(saved).toMatchObject({ id: 'a', updatedAt: FIXED_NOW });
    expect(repository.saveMany).toHaveBeenCalledWith([saved]);
  });

  it('stamps every transaction of a bulk save', async () => {
    const saved = await service.saveMany([tx({ id: 'a' }), tx({ id: 'b' })]);
    expect(saved.map((t) => t.updatedAt)).toEqual([FIXED_NOW, FIXED_NOW]);
  });

  it('restores a transaction exactly as given, without a new timestamp', async () => {
    const original = tx({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    await service.restore(original);
    expect(repository.save).toHaveBeenCalledWith(original);
  });

  describe('remove', () => {
    it('soft-deletes an imported transaction so the export can clear its cell', async () => {
      const imported = tx({ id: 'imp-2026-B15', source: { sheet: 'S', cell: 'B15' } });
      repository.findByKey.mockResolvedValue(imported);
      await service.remove(imported.id);
      expect(repository.saveMany).toHaveBeenCalledWith([{ ...imported, deleted: true, updatedAt: FIXED_NOW }]);
      expect(repository.deleteByKeys).toHaveBeenCalledWith([]);
      expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    });

    it('removes an entry created in the app for good', async () => {
      repository.findByKey.mockResolvedValue(tx({ id: 'app-1' }));
      await service.remove('app-1');
      expect(repository.saveMany).toHaveBeenCalledWith([]);
      expect(repository.deleteByKeys).toHaveBeenCalledWith(['app-1']);
    });

    it('fails for an unknown id', async () => {
      repository.findByKey.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('removes several transactions at once, each the right way', async () => {
    const imported = tx({ id: 'imp', source: { sheet: 'S', cell: 'C3' } });
    repository.findByIds.mockResolvedValue([imported, tx({ id: 'app' })]);
    await service.removeMany(['imp', 'app', 'gone']);
    expect(repository.findByIds).toHaveBeenCalledWith(['imp', 'app', 'gone']);
    expect(repository.saveMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'imp', deleted: true })]);
    expect(repository.deleteByKeys).toHaveBeenCalledWith(['app']);
  });
});
