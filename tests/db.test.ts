import {
  addRuleAndApply,
  appOnlyCount,
  deleteTransaction,
  ensureSeeded,
  exportBackup,
  getSettings,
  hasYear,
  importBackup,
  replaceYear,
  saveTransaction,
  type Backup,
} from '../src/db/repo';
import { FinanceDB } from '../src/db/schema';
import { DEFAULT_SETTINGS } from '../src/types';
import { tx } from './helpers';

const wbFile = (bytes: number[] = [1, 2, 3, 250]) => ({
  fileName: 'Controle financeiro 2026.xlsx',
  importedAt: '2026-10-21T10:00:00.000Z',
  data: new Uint8Array(bytes).buffer,
});

let db: FinanceDB;
beforeEach(async () => {
  db = new FinanceDB('test-' + Math.random());
  await ensureSeeded(db);
});
afterEach(async () => {
  await db.delete();
});

describe('ensureSeeded / settings', () => {
  it('seeds rules and settings once', async () => {
    const n = await db.rules.count();
    expect(n).toBeGreaterThan(0);
    await db.rules.clear();
    await db.rules.put({ id: 'mine', keyword: 'x', category: 'Lazer', priority: 50 });
    await ensureSeeded(db);
    expect(await db.rules.count()).toBe(1);
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('replaceYear', () => {
  const imported = (over = {}) =>
    tx({ id: 'imp-2026-B15', year: 2026, description: 'uber', source: { sheet: 'Listas de itens', cell: 'B15' }, ...over });

  it('stores the year, categorises it and merges settings', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, goalBRL: 1, reserveEUR: 99 });
    await replaceYear(2026, [imported()], wbFile(), { goalBRL: 500 }, db);
    expect(await hasYear(2026, db)).toBe(true);
    expect(await hasYear(2025, db)).toBe(false);
    expect((await db.transactions.get('imp-2026-B15'))!.category).toBe('Transporte');
    expect(await getSettings(db)).toMatchObject({ goalBRL: 500, reserveEUR: 99 });
    expect((await db.workbooks.get(2026))!.fileName).toBe('Controle financeiro 2026.xlsx');
  });

  it('keeps manual categories and tags for the same id', async () => {
    await replaceYear(2026, [imported()], wbFile(), {}, db);
    await saveTransaction({ ...(await db.transactions.get('imp-2026-B15'))!, category: 'Lazer', categorySource: 'manual', tags: ['festa'] }, db);
    await replaceYear(2026, [imported({ tags: ['novo'] })], wbFile(), {}, db);
    expect(await db.transactions.get('imp-2026-B15')).toMatchObject({ category: 'Lazer', categorySource: 'manual', tags: ['novo', 'festa'] });
  });

  it('keeps app-only rows (no source) and counts them', async () => {
    await replaceYear(2026, [imported()], wbFile(), {}, db);
    await saveTransaction(tx({ id: 'app-1', year: 2026, description: 'pizza' }), db);
    await saveTransaction(tx({ id: 'app-del', year: 2026, deleted: true }), db);
    await saveTransaction(tx({ id: 'app-2025', year: 2025 }), db);
    expect(await appOnlyCount(2026, db)).toBe(1);
    await replaceYear(2026, [imported()], wbFile(), {}, db);
    expect(await db.transactions.get('app-1')).toMatchObject({ description: 'pizza' });
    expect(await appOnlyCount(2026, db)).toBe(1);
    expect(await appOnlyCount(2024, db)).toBe(0);
  });

  it('brings soft-deleted imported rows back when the sheet still has them', async () => {
    await replaceYear(2026, [imported()], wbFile(), {}, db);
    await deleteTransaction((await db.transactions.get('imp-2026-B15'))!, db);
    await replaceYear(2026, [imported()], wbFile(), {}, db);
    expect((await db.transactions.get('imp-2026-B15'))!.deleted).toBeUndefined();
  });

  it('drops rows of that year that are not in the new import, and leaves other years alone', async () => {
    await replaceYear(2026, [imported(), imported({ id: 'imp-2026-C15', source: { sheet: 'Listas de itens', cell: 'C15' } })], wbFile(), {}, db);
    await saveTransaction(tx({ id: 'other', year: 2025 }), db);
    await replaceYear(2026, [imported()], wbFile(), {}, db);
    expect((await db.transactions.where('year').equals(2026).primaryKeys()).sort()).toEqual(['imp-2026-B15']);
    expect(await db.transactions.get('other')).toBeDefined();
  });
});

describe('deleteTransaction', () => {
  it('soft-deletes imported rows so export can clear the cell', async () => {
    const t = tx({ source: { sheet: 's', cell: 'B4' } });
    await saveTransaction(t, db);
    await deleteTransaction(t, db);
    expect((await db.transactions.get(t.id))!.deleted).toBe(true);
  });

  it('hard-deletes rows created in the app', async () => {
    const t = tx();
    await saveTransaction(t, db);
    await deleteTransaction(t, db);
    expect(await db.transactions.get(t.id)).toBeUndefined();
  });
});

describe('addRuleAndApply', () => {
  it('re-categorises auto rows only and returns how many changed', async () => {
    await db.transactions.bulkPut([
      tx({ id: 'a', description: 'pastel de nata', category: 'Outros' }),
      tx({ id: 'b', description: 'pastel', category: 'Outros' }),
      tx({ id: 'm', description: 'pastel', category: 'Lazer', categorySource: 'manual' }),
      tx({ id: 'u', description: 'uber', category: 'Transporte' }),
    ]);
    const n = await addRuleAndApply({ id: 'r', keyword: 'pastel', category: 'Restaurante', priority: 50 }, db);
    expect(n).toBe(2);
    const cat = async (id: string) => (await db.transactions.get(id))!.category;
    expect([await cat('a'), await cat('b'), await cat('m'), await cat('u')]).toEqual(['Restaurante', 'Restaurante', 'Lazer', 'Transporte']);
    expect(await db.rules.get('r')).toBeDefined();
  });
});

describe('backup', () => {
  it('round-trips transactions, rules, settings and the workbook bytes', async () => {
    const bytes = Array.from({ length: 70000 }, (_, i) => (i * 7) % 256); // > one 0x8000 chunk
    await replaceYear(2026, [tx({ id: 'imp-2026-B4', year: 2026, type: 'income' })], wbFile(bytes), { goalBRL: 7 }, db);
    await saveTransaction(tx({ id: 'gone', deleted: true, source: { sheet: 's', cell: 'B5' } }), db);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db))) as Backup;
    expect(backup).toMatchObject({ app: 'finance-app', version: 1 });

    const other = new FinanceDB('test-' + Math.random());
    try {
      await other.transactions.put(tx({ id: 'stale' }));
      await importBackup(backup, other);
      expect((await other.transactions.toArray()).map((t) => t.id).sort()).toEqual(['gone', 'imp-2026-B4']);
      expect((await other.transactions.get('gone'))!.deleted).toBe(true);
      expect(await other.rules.count()).toBe(await db.rules.count());
      expect((await getSettings(other)).goalBRL).toBe(7);
      const wb = (await other.workbooks.get(2026))!;
      expect([...new Uint8Array(wb.data)]).toEqual(bytes);
    } finally {
      await other.delete();
    }
  });

  it('rejects files that are not a backup, without touching data', async () => {
    await saveTransaction(tx({ id: 'keep' }), db);
    await expect(importBackup({ app: 'x' } as unknown as Backup, db)).rejects.toThrow(/inválido/);
    await expect(importBackup(null as unknown as Backup, db)).rejects.toThrow();
    expect(await db.transactions.get('keep')).toBeDefined();
  });
});
