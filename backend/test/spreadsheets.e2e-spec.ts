import { EXPORT_WARNINGS_HEADER, type Transaction } from '@finance/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { parseWorkbook } from '../src/spreadsheets/domain/parser/parse-workbook.js';
import { tx } from '../src/testing/factories.js';
import { clearDatabase, closeTestApp, createTestApp } from '../src/testing/test-app.js';
import { buildWorkbook, loadSheet } from '../src/testing/workbook.fixture.js';
import { api, binary, FILE_NAME, importSheet } from './helpers.js';

describe('spreadsheets and years', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createTestApp()));
  beforeEach(() => clearDatabase(app));
  afterAll(() => closeTestApp(app));

  const live = async (year = 2026): Promise<Transaction[]> => (await api(app).get(`/api/transactions?year=${year}`)).body;
  const save = (t: Transaction) => api(app).put(`/api/transactions/${encodeURIComponent(t.id)}`).send(t).expect(200);
  const exportYear = async (year = 2026) => {
    const res = await api(app).post(`/api/years/${year}/spreadsheet/export`).buffer(true).parse(binary).expect(200);
    return { data: res.body as Buffer, headers: res.headers };
  };

  describe('POST /api/spreadsheets/preview', () => {
    it('reads the file without saving anything', async () => {
      const res = await api(app).post('/api/spreadsheets/preview').attach('file', await buildWorkbook(), FILE_NAME).expect(200);
      expect(res.body).toMatchObject({ existing: false, appOnlyCount: 0, result: { year: 2026, yearSource: 'filename' } });
      expect(res.body.result.transactions.length).toBeGreaterThan(5);
      expect(await live()).toEqual([]);
    });

    it('takes a year override and reports what the year already has', async () => {
      await importSheet(app);
      await save(tx({ id: 'app-1' }));
      const res = await api(app).post('/api/spreadsheets/preview?year=2026').attach('file', await buildWorkbook(), 'planilha.xlsx').expect(200);
      expect(res.body).toMatchObject({ existing: true, appOnlyCount: 1, result: { year: 2026, yearSource: 'option' } });
    });

    it('rejects a missing file, other file types and unreadable sheets', async () => {
      await api(app).post('/api/spreadsheets/preview').expect(400);
      await api(app).post('/api/spreadsheets/preview').attach('file', Buffer.from('{}'), 'backup.json').expect(400);
      await api(app).post('/api/spreadsheets/preview').attach('file', Buffer.from('nope'), 'x.xlsx').expect(422);
      await api(app).post('/api/spreadsheets/preview?year=1').attach('file', await buildWorkbook(), FILE_NAME).expect(400);
    });
  });

  describe('PUT /api/years/:year/spreadsheet', () => {
    it('imports the year and applies the sheet settings and goal', async () => {
      const res = await importSheet(app);
      expect(res.body).toMatchObject({ year: 2026, imported: (await live()).length });
      const settings = (await api(app).get('/api/settings')).body;
      expect(settings).toMatchObject({ eurBrlRate: 6.2, goalBRL: 100000, reserveEUR: 3000 });
      expect((await api(app).get('/api/goals')).body).toEqual([expect.objectContaining({ id: 'goal-patrimonio', target: 100000 })]);
      await api(app).get('/api/years').expect(200, [2026]);
    });

    it('keeps manual categories and app-created entries on re-import', async () => {
      await importSheet(app);
      const uber = (await live()).find((t) => t.description === 'uber')!;
      await save({ ...uber, category: 'Lazer', categorySource: 'manual' });
      await save(tx({ id: 'app-1', description: 'pizza' }));
      await importSheet(app);
      const after = await live();
      expect(after.find((t) => t.id === uber.id)).toMatchObject({ category: 'Lazer', categorySource: 'manual' });
      expect(after.some((t) => t.id === 'app-1')).toBe(true);
    });

    it('does not let an older year roll the settings back', async () => {
      await importSheet(app);
      const older = await buildWorkbook({ extra: (ws) => (ws.getCell('O10').value = 5) });
      await importSheet(app, older, 2025);
      expect((await api(app).get('/api/settings')).body.goalBRL).toBe(100000);
      await api(app).get('/api/years').expect(200, [2025, 2026]);
    });
  });

  describe('GET and DELETE /api/years/:year', () => {
    it('reports the status and counts changes since the import, then since the export', async () => {
      await importSheet(app);
      await api(app).get('/api/years/2026').expect(200, { year: 2026, exists: true, appOnlyCount: 0, unexportedCount: 0 });
      await save(tx({ id: 'app-1' }));
      await api(app).get('/api/years/2026').expect(200, { year: 2026, exists: true, appOnlyCount: 1, unexportedCount: 1 });
      await exportYear();
      expect((await api(app).get('/api/years/2026')).body.unexportedCount).toBe(0);
      await api(app).get('/api/years/2030').expect(200, { year: 2030, exists: false, appOnlyCount: 0, unexportedCount: 0 });
      await api(app).get('/api/years/abc').expect(400);
    });

    it('deletes a year with its spreadsheet', async () => {
      await importSheet(app);
      await api(app).delete('/api/years/2026').expect(204);
      expect(await live()).toEqual([]);
      await api(app).get('/api/years').expect(200, []);
      // No stored spreadsheet left: the export falls back to the ledger.
      const { headers } = await exportYear();
      expect(decodeURIComponent(headers[EXPORT_WARNINGS_HEADER.toLowerCase()])).toMatch(/Lançamentos/);
    });
  });

  describe('POST /api/years/:year/spreadsheet/export', () => {
    it('downloads the year in its original layout with a UTF-8 file name', async () => {
      await importSheet(app);
      const { data, headers } = await exportYear();
      expect(headers['content-type']).toContain('spreadsheetml');
      expect(headers['content-disposition']).toContain("filename*=UTF-8''Controle%20financeiro%202026.xlsx");
      expect(JSON.parse(decodeURIComponent(headers[EXPORT_WARNINGS_HEADER.toLowerCase()]))).toEqual([]);
      expect((await loadSheet(data)).getCell('B15').value).toBe(25);
    });

    it('writes edits, paid toggles and deletions into the file', async () => {
      await importSheet(app);
      const txs = await live();
      const salary = txs.find((t) => t.id === 'imp-2026-C4')!;
      await save({ ...salary, amount: 3200 });
      await api(app).delete('/api/transactions/imp-2026-B16').expect(204);
      const ws = await loadSheet((await exportYear()).data);
      expect(ws.getCell('C4').value).toBe(3200);
      expect(ws.getCell('B16').value).toBeNull();
    });
  });

  describe('import → app → export → re-import', () => {
    it('never duplicates entries created in the app', async () => {
      await importSheet(app);
      const before = (await live()).length;
      await save(tx({ id: 'app-1', type: 'fixed', month: 4, description: 'Aluguel', amount: 900, paid: true }));
      await save(tx({ id: 'app-2', month: 2, description: 'pizza', amount: 9 }));

      await importSheet(app, (await exportYear()).data);

      const after = await live();
      expect(after).toHaveLength(before + 2);
      expect(after.filter((t) => t.description === 'pizza')).toHaveLength(1);
      expect(after.filter((t) => t.description === 'Aluguel' && t.month === 4)).toHaveLength(1);
    });

    it('is stable across repeated exports', async () => {
      await importSheet(app);
      for (let i = 0; i < 2; i++) await importSheet(app, (await exportYear()).data);
      const expected = (await parseWorkbook(await buildWorkbook(), { fileName: FILE_NAME })).transactions.length;
      expect(await live()).toHaveLength(expected);
    });

    it('re-points every row to its final cell, keeping what the user chose', async () => {
      await importSheet(app);
      const grocery = (await live()).find((t) => t.id === 'imp-2026-B17')!;
      await save({ ...grocery, category: 'Casa', categorySource: 'manual', tags: ['x'] });
      await api(app).delete('/api/transactions/imp-2026-B16');
      await save(tx({ id: 'app-pizza', month: 1, description: 'pizza', amount: 9 }));
      await save(tx({ id: 'app-sushi', month: 1, description: 'sushi', amount: 8 }));

      const ws = await loadSheet((await exportYear()).data);

      const rows = await live();
      expect(rows.some((t) => t.id.startsWith('app-'))).toBe(false);
      for (const t of rows) {
        expect(t.id).toBe(`imp-2026-${t.source!.cell}`);
        expect(ws.getCell(t.source!.cell).value).toBe(t.amount);
      }
      const movedGrocery = rows.find((t) => t.description === 'Mercado' && t.month === 1 && t.amount === 40)!;
      expect(movedGrocery).toMatchObject({ category: 'Casa', categorySource: 'manual', tags: ['x'] });
      const backup = (await api(app).get('/api/backup')).body;
      expect(backup.transactions.some((t: Transaction) => t.deleted)).toBe(false);
    });

    it('writes later edits to the new cell, not the pre-export one', async () => {
      await importSheet(app);
      await save(tx({ id: 'app-1', type: 'fixed', month: 1, description: 'Netflix', amount: 13 }));
      await exportYear(); // Netflix is inserted before the fixed Total: everything below shifts
      const uber = (await live()).find((t) => t.description === 'uber')!;
      expect(uber.source!.cell).toBe('D16');
      await save({ ...uber, amount: 99 });
      const ws = await loadSheet((await exportYear()).data);
      expect(ws.getCell('D16').value).toBe(99);
      expect(ws.getCell('D17').value).toBeNull();
    });
  });
});
