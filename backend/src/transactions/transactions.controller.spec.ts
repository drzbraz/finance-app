import { BadRequestException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import { tx } from '../testing/factories.js';
import { mockOf } from '../testing/mocks.js';
import { TransactionsController } from './transactions.controller.js';
import type { TransactionsService } from './transactions.service.js';

describe('TransactionsController', () => {
  let service: Mocked<TransactionsService>;
  let controller: TransactionsController;

  beforeEach(() => {
    service = mockOf<TransactionsService>();
    controller = new TransactionsController(service);
  });

  it('GET /transactions?year lists the live transactions', async () => {
    service.listLive.mockResolvedValue([tx({ id: 'a' })]);
    await expect(controller.list(2026)).resolves.toEqual([expect.objectContaining({ id: 'a' })]);
    expect(service.listLive).toHaveBeenCalledWith(2026);
  });

  it('PUT /transactions/:id saves the body', async () => {
    const body = tx({ id: 'a' });
    service.save.mockResolvedValue(body);
    await expect(controller.save('a', body)).resolves.toBe(body);
  });

  it('PUT /transactions/:id rejects a body for another id', () => {
    expect(() => controller.save('b', tx({ id: 'a' }))).toThrow(BadRequestException);
    expect(service.save).not.toHaveBeenCalled();
  });

  it('POST /transactions/bulk saves every transaction', async () => {
    const transactions = [tx(), tx()];
    await controller.saveMany({ transactions });
    expect(service.saveMany).toHaveBeenCalledWith(transactions);
  });

  it('POST /transactions/:id/restore restores the body as it is', async () => {
    const body = tx({ id: 'a' });
    await controller.restore('a', body);
    expect(service.restore).toHaveBeenCalledWith(body);
    expect(() => controller.restore('b', body)).toThrow(BadRequestException);
  });

  it('DELETE /transactions/:id and POST /transactions/bulk-delete remove', async () => {
    await controller.remove('a');
    expect(service.remove).toHaveBeenCalledWith('a');
    await controller.removeMany({ ids: ['a', 'b'] });
    expect(service.removeMany).toHaveBeenCalledWith(['a', 'b']);
  });
});
