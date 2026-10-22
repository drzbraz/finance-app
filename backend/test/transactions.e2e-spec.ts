import type { NestExpressApplication } from '@nestjs/platform-express';
import { tx } from '../src/testing/factories.js';
import { clearDatabase, closeTestApp, createTestApp } from '../src/testing/test-app.js';
import { api } from './helpers.js';

describe('/api/transactions', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createTestApp()));
  beforeEach(() => clearDatabase(app));
  afterAll(() => closeTestApp(app));

  const imported = tx({ id: 'imp-2026-B15', description: 'jantar', source: { sheet: 'Listas de itens', cell: 'B15' } });
  const list = async (year = 2026) => (await api(app).get(`/api/transactions?year=${year}`).expect(200)).body;

  it('saves a transaction with PUT and lists it by year, stamped', async () => {
    const res = await api(app).put(`/api/transactions/${imported.id}`).send(imported).expect(200);
    expect(res.body.updatedAt).toEqual(expect.any(String));
    expect(await list()).toEqual([res.body]);
    expect(await list(2025)).toEqual([]);
  });

  it('requires a valid year', async () => {
    await api(app).get('/api/transactions').expect(400);
    await api(app).get('/api/transactions?year=abc').expect(400);
  });

  it('validates the body', async () => {
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), month: 13 }).expect(400);
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), type: 'other' }).expect(400);
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), source: { sheet: 'S', cell: 'nope' } }).expect(400);
    await api(app).put('/api/transactions/y').send(tx({ id: 'x' })).expect(400);
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), year: 3000 }).expect(400);
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), amount: 1e12 }).expect(400);
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), updatedAt: 'yesterday' }).expect(400);
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), split: { people: 2, total: 20, receivedOn: '22/10' } }).expect(400);
  });

  it('keeps when a Splitwise split was paid back', async () => {
    const split = { people: 2, total: 20, receivedOn: '2026-10-22' };
    await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x', amount: 10 }), split }).expect(200);
    expect((await list())[0].split).toEqual(split);
  });

  it('strips fields that are not part of a transaction', async () => {
    const res = await api(app).put('/api/transactions/x').send({ ...tx({ id: 'x' }), hacker: true }).expect(200);
    expect(res.body).not.toHaveProperty('hacker');
  });

  it('saves several at once with POST /bulk', async () => {
    await api(app).post('/api/transactions/bulk').send({ transactions: [tx({ id: 'a' }), tx({ id: 'b' })] }).expect(200);
    expect((await list()).map((t: { id: string }) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('soft-deletes imported rows and hard-deletes app rows', async () => {
    await api(app).post('/api/transactions/bulk').send({ transactions: [imported, tx({ id: 'app-1' })] });
    await api(app).delete(`/api/transactions/${imported.id}`).expect(204);
    await api(app).delete('/api/transactions/app-1').expect(204);
    expect(await list()).toEqual([]);
    // The soft-deleted row is still in the backup (the export needs it to clear the cell).
    const backup = (await api(app).get('/api/backup')).body;
    expect(backup.transactions).toEqual([expect.objectContaining({ id: imported.id, deleted: true })]);
  });

  it('answers 404 when deleting an unknown id', async () => {
    await api(app).delete('/api/transactions/nope').expect(404);
  });

  it('removes several with POST /bulk-delete, ignoring unknown ids', async () => {
    await api(app).post('/api/transactions/bulk').send({ transactions: [tx({ id: 'a' }), tx({ id: 'b' })] });
    await api(app).post('/api/transactions/bulk-delete').send({ ids: ['a', 'b', 'gone'] }).expect(204);
    expect(await list()).toEqual([]);
    await api(app).post('/api/transactions/bulk-delete').send({ ids: 'a' }).expect(400);
  });

  it('restores a transaction exactly, without a new timestamp', async () => {
    const original = { ...imported, updatedAt: '2026-01-01T00:00:00.000Z' };
    await api(app).post(`/api/transactions/${imported.id}/restore`).send(original).expect(204);
    expect(await list()).toEqual([original]);
    await api(app).post('/api/transactions/other/restore').send(original).expect(400);
  });
});
