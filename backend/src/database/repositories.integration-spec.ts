import { DEFAULT_SETTINGS } from '@finance/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { BudgetsRepository } from '../budgets/budgets.repository.js';
import { RecurringRepository } from '../recurring/recurring.repository.js';
import { SettingsRepository } from '../settings/settings.repository.js';
import { tx } from '../testing/factories.js';
import { clearDatabase, closeTestApp, createTestApp } from '../testing/test-app.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import { WorkbooksRepository } from '../workbooks/workbooks.repository.js';
import { UnitOfWork } from './unit-of-work.js';

/** Repositories against a real MongoDB replica set: queries, mapping and transactions. */
describe('repositories (MongoDB)', () => {
  let app: NestExpressApplication;
  let transactions: TransactionsRepository;

  beforeAll(async () => {
    app = await createTestApp();
    transactions = app.get(TransactionsRepository);
  });
  beforeEach(() => clearDatabase(app));
  afterAll(() => closeTestApp(app));

  const imported = (cell: string, over = {}) => tx({ id: `imp-2026-${cell}`, source: { sheet: 'Listas de itens', cell }, ...over });

  describe('DocumentRepository (via transactions)', () => {
    it('stores the natural key as _id and reads the same object back', async () => {
      const original = imported('B15', { tags: ['amigos'], date: '2026-01-03' });
      await transactions.save(original);
      await expect(transactions.findByKey(original.id)).resolves.toEqual(original);
    });

    it('replaces a document on save instead of merging', async () => {
      await transactions.save(imported('B15', { noteHeader: 'X (2026-01-01)' }));
      await transactions.save(imported('B15'));
      expect((await transactions.findByKey('imp-2026-B15'))!.noteHeader).toBeUndefined();
    });

    it('does not store undefined optional fields', async () => {
      await transactions.save(tx({ id: 'a', date: undefined }));
      const raw = await app.get(TransactionsRepository)['model'].findById('a').lean().exec();
      expect(raw).not.toHaveProperty('date');
    });

    it('deletes by key, by keys and everything', async () => {
      await transactions.saveMany([tx({ id: 'a' }), tx({ id: 'b' }), tx({ id: 'c' })]);
      await transactions.deleteByKey('a');
      await transactions.deleteByKeys(['b']);
      expect((await transactions.findAll()).map((t) => t.id)).toEqual(['c']);
      await transactions.deleteAll();
      await expect(transactions.count()).resolves.toBe(0);
    });

    it('ignores empty bulk calls', async () => {
      await transactions.saveMany([]);
      await transactions.deleteByKeys([]);
      await expect(transactions.count()).resolves.toBe(0);
    });
  });

  describe('TransactionsRepository', () => {
    beforeEach(() =>
      transactions.saveMany([
        imported('B15', { updatedAt: '2026-05-01T00:00:00Z' }),
        imported('B16', { deleted: true }),
        tx({ id: 'app-1', categorySource: 'manual' }),
        tx({ id: 'app-gone', deleted: true }),
        tx({ id: 'old', year: 2025 }),
        tx({ id: 'zero', year: 0 }),
      ]),
    );

    it('separates the live rows from the soft-deleted ones', async () => {
      expect((await transactions.findByYear(2026)).map((t) => t.id).sort()).toEqual(['app-1', 'app-gone', 'imp-2026-B15', 'imp-2026-B16']);
      expect((await transactions.findLiveByYear(2026)).map((t) => t.id).sort()).toEqual(['app-1', 'imp-2026-B15']);
    });

    it('lists real years in order', async () => {
      await expect(transactions.findYears()).resolves.toEqual([2025, 2026]);
    });

    it('finds by ids and the automatically categorised rows', async () => {
      expect((await transactions.findByIds(['app-1', 'nope'])).map((t) => t.id)).toEqual(['app-1']);
      expect((await transactions.findAutoCategorized()).map((t) => t.id)).not.toContain('app-1');
    });

    it('counts per year, app-only rows and changes since a time', async () => {
      await expect(transactions.countByYear(2026)).resolves.toBe(4);
      await expect(transactions.countAppOnly(2026)).resolves.toBe(1);
      await expect(transactions.countChangedSince(2026, '2026-04-01')).resolves.toBe(1);
      await expect(transactions.countChangedSince(2026, '2026-06-01')).resolves.toBe(0);
    });

    it('deletes only the imported rows of a year, or the whole year', async () => {
      await transactions.deleteImportedByYear(2026);
      expect((await transactions.findByYear(2026)).map((t) => t.id).sort()).toEqual(['app-1', 'app-gone']);
      await transactions.deleteByYear(2026);
      await expect(transactions.countByYear(2026)).resolves.toBe(0);
      await expect(transactions.countByYear(2025)).resolves.toBe(1);
    });
  });

  describe('WorkbooksRepository', () => {
    it('round-trips the file bytes exactly and lists the years', async () => {
      const workbooks = app.get(WorkbooksRepository);
      const data = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
      await workbooks.save({ year: 2026, fileName: 'Controle financeiro 2026.xlsx', importedAt: 'now', data });
      await workbooks.save({ year: 2025, fileName: 'f.xlsx', importedAt: 'now', data: Buffer.alloc(0) });
      const stored = await workbooks.findByKey(2026);
      expect(Buffer.isBuffer(stored!.data)).toBe(true);
      expect(stored!.data.equals(data)).toBe(true);
      await expect(workbooks.findYears()).resolves.toEqual([2025, 2026]);
    });
  });

  describe('SettingsRepository', () => {
    it('keeps an empty lastExportAt and numeric year keys', async () => {
      const settings = app.get(SettingsRepository);
      await settings.save(DEFAULT_SETTINGS);
      await expect(settings.find()).resolves.toEqual(DEFAULT_SETTINGS);
      await settings.save({ ...DEFAULT_SETTINGS, lastExportAt: { 2026: 'x' } });
      expect((await settings.find())!.lastExportAt).toEqual({ 2026: 'x' });
    });
  });

  it('keys budgets by category and bills by their checklist key', async () => {
    await app.get(BudgetsRepository).save({ category: 'Saúde', monthlyLimit: 80 });
    await app.get(RecurringRepository).save({ key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', active: true });
    await expect(app.get(BudgetsRepository).findByKey('Saúde')).resolves.toEqual({ category: 'Saúde', monthlyLimit: 80 });
    await expect(app.get(RecurringRepository).findByKey('fixed|Aluguel')).resolves.toMatchObject({ description: 'Aluguel' });
  });

  describe('UnitOfWork', () => {
    it('commits every write together', async () => {
      await app.get(UnitOfWork).run(async () => {
        await transactions.save(tx({ id: 'a' }));
        await transactions.save(tx({ id: 'b' }));
      });
      await expect(transactions.count()).resolves.toBe(2);
    });

    it('rolls every write back when one step fails', async () => {
      await transactions.save(tx({ id: 'keep' }));
      await expect(
        app.get(UnitOfWork).run(async () => {
          await transactions.deleteAll();
          await transactions.save(tx({ id: 'new' }));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect((await transactions.findAll()).map((t) => t.id)).toEqual(['keep']);
    });
  });
});
