import type { StatementPreview, Transaction } from '@finance/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { tx } from '../src/testing/factories.js';
import { buildStatement } from '../src/testing/statement.fixture.js';
import { clearDatabase, closeTestApp, createTestApp } from '../src/testing/test-app.js';
import { api } from './helpers.js';

describe('bank statements', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createTestApp()));
  beforeEach(() => clearDatabase(app));
  afterAll(() => closeTestApp(app));

  const preview = async (): Promise<StatementPreview> =>
    (await api(app).post('/api/statements/preview').attach('file', await buildStatement(), 'Extrato Combinado.pdf').expect(200)).body;

  it('previews a statement without saving, and recognises the lines once they are recorded', async () => {
    await api(app).put('/api/transactions/jiu').send(tx({ id: 'jiu', year: 2026, month: 9, amount: 80, type: 'fixed', category: 'Saúde' })).expect(200);
    const first = await preview();
    expect(first).toMatchObject({ bank: 'ActivoBank', fileName: 'Extrato Combinado.pdf', from: '2026-09-01' });
    expect(first.rows[0]).toMatchObject({ doubts: ['duplicate'], match: { id: 'jiu' } });
    const live = async (): Promise<Transaction[]> => (await api(app).get('/api/transactions?year=2026')).body;
    expect(await live()).toHaveLength(1);

    const sure = first.rows.filter((r) => r.doubts.length === 0).map((r) => r.transaction);
    await api(app).post('/api/transactions/bulk').send({ transactions: sure }).expect(200);
    const again = await preview();
    expect(again.rows.filter((r) => r.alreadyImported)).toHaveLength(sure.length);
  });

  it('rejects a missing file, other file types and unreadable PDFs', async () => {
    await api(app).post('/api/statements/preview').expect(400);
    await api(app).post('/api/statements/preview').attach('file', Buffer.from('x'), 'planilha.xlsx').expect(400);
    await api(app).post('/api/statements/preview').attach('file', Buffer.from('nope'), 'x.pdf').expect(422);
  });
});
