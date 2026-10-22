import { DEFAULT_SETTINGS, type Backup } from '@finance/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { tx } from '../src/testing/factories.js';
import { clearDatabase, closeTestApp, createTestApp } from '../src/testing/test-app.js';
import { loadSheet } from '../src/testing/workbook.fixture.js';
import { api, binary, importSheet } from './helpers.js';

describe('/api/backup', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createTestApp()));
  beforeEach(() => clearDatabase(app));
  afterAll(() => closeTestApp(app));

  it('round-trips everything, the stored spreadsheet included', async () => {
    await importSheet(app);
    await api(app).put('/api/budgets/Lazer').send({ monthlyLimit: 50 });
    await api(app).put('/api/transactions/app-1').send(tx({ id: 'app-1', description: 'pizza' }));
    const backup: Backup = (await api(app).get('/api/backup').expect(200)).body;
    expect(backup).toMatchObject({ app: 'finance-app', version: 2 });

    await clearDatabase(app);
    await api(app).post('/api/backup').send(backup).expect(204);

    const again: Backup = (await api(app).get('/api/backup')).body;
    expect({ ...again, exportedAt: '' }).toEqual({ ...backup, exportedAt: '' });
    // The restored spreadsheet still exports.
    const res = await api(app).post('/api/years/2026/spreadsheet/export').buffer(true).parse(binary).expect(200);
    expect((await loadSheet(res.body)).getCell('B15').value).toBe(25);
  });

  it('replaces what was there before', async () => {
    await api(app).put('/api/transactions/old').send(tx({ id: 'old' }));
    const empty: Backup = { app: 'finance-app', version: 2, exportedAt: 'x', transactions: [], rules: [], settings: DEFAULT_SETTINGS, workbooks: [] };
    await api(app).post('/api/backup').send(empty).expect(204);
    await api(app).get('/api/transactions?year=2026').expect(200, []);
  });

  it('accepts a version 1 backup and rebuilds the Patrimônio goal from its META', async () => {
    const v1 = { app: 'finance-app', version: 1, exportedAt: 'x', transactions: [tx({ id: 'a' })], rules: [], settings: { goalBRL: 70000 }, workbooks: [] };
    await api(app).post('/api/backup').send(v1).expect(204);
    expect((await api(app).get('/api/goals')).body).toEqual([expect.objectContaining({ id: 'goal-patrimonio', target: 70000 })]);
    expect((await api(app).get('/api/settings')).body).toEqual({ ...DEFAULT_SETTINGS, goalBRL: 70000 });
  });

  it('rejects files that are not finance-app backups, leaving the data alone', async () => {
    await api(app).put('/api/transactions/keep').send(tx({ id: 'keep' }));
    await api(app).post('/api/backup').send({ app: 'other', version: 2 }).expect(400);
    await api(app).post('/api/backup').send({ app: 'finance-app', version: 3, exportedAt: 'x', transactions: [], rules: [], settings: {}, workbooks: [] }).expect(400);
    await api(app).post('/api/backup').send({ app: 'finance-app', version: 2, exportedAt: 'x', transactions: [{ id: 'bad' }], rules: [], settings: {}, workbooks: [] }).expect(400);
    expect((await api(app).get('/api/transactions?year=2026')).body).toHaveLength(1);
  });
});
