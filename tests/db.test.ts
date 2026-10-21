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
  restoreTransaction,
  saveBudget,
  saveGoal,
  saveRecurring,
  saveSettings,
  saveTransaction,
  unexportedCount,
  type Backup,
} from '../src/db/repo';
import Dexie from 'dexie';
import { FinanceDB, PATRIMONY_GOAL_ID } from '../src/db/schema';
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
    expect(backup).toMatchObject({ app: 'finance-app', version: 2 });

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

describe('v2 additions', () => {
  it('saveTransaction stamps updatedAt; restoreTransaction puts the row back as given', async () => {
    const t = tx({ id: 'a' });
    await saveTransaction(t, db);
    expect((await db.transactions.get('a'))!.updatedAt).toBeDefined();
    await restoreTransaction(t, db);
    expect(await db.transactions.get('a')).toEqual(t);
  });

  it('unexportedCount counts edits since the last export, or since import', async () => {
    await replaceYear(2026, [tx({ id: 'imp-2026-B4', year: 2026, source: { sheet: 's', cell: 'B4' } })], wbFile(), {}, db);
    expect(await unexportedCount(2026, db)).toBe(0);
    await saveTransaction(tx({ id: 'n', year: 2026 }), db);
    expect(await unexportedCount(2026, db)).toBe(1);
    await saveSettings({ lastExportAt: { 2026: new Date(Date.now() + 1000).toISOString() } }, db);
    expect(await unexportedCount(2026, db)).toBe(0);
  });

  it('saveBudget deletes a budget whose limit is not positive', async () => {
    await saveBudget({ category: 'Lazer', monthlyLimit: 100 }, db);
    expect(await db.budgets.get('Lazer')).toEqual({ category: 'Lazer', monthlyLimit: 100 });
    await saveBudget({ category: 'Lazer', monthlyLimit: 0 }, db);
    expect(await db.budgets.get('Lazer')).toBeUndefined();
    await saveBudget({ category: 'Casa', monthlyLimit: -5 }, db);
    expect(await db.budgets.count()).toBe(0);
  });

  it('round-trips v2 tables through a backup', async () => {
    await saveBudget({ category: 'Lazer', monthlyLimit: 100 }, db);
    await saveRecurring({ key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', dueDay: 5, active: true }, db);
    await saveGoal({ id: 'g', name: 'Viagem', target: 2000, currency: 'EUR', source: 'manual', contributions: [{ date: '2026-01-01', amount: 50 }], createdAt: 'x' }, db);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db))) as Backup;
    const other = new FinanceDB('test-' + Math.random());
    try {
      await importBackup(backup, other);
      expect(await other.budgets.toArray()).toEqual(await db.budgets.toArray());
      expect(await other.recurring.toArray()).toEqual(await db.recurring.toArray());
      expect(await other.goals.toArray()).toEqual(await db.goals.toArray());
    } finally {
      await other.delete();
    }
  });

  it('imports a v1 backup, filling new settings and rebuilding the Patrimônio goal', async () => {
    const v1 = {
      app: 'finance-app', version: 1, exportedAt: 'x', transactions: [tx({ id: 'old' })], rules: [],
      settings: { id: 'settings', eurBrlRate: 6, goalBRL: 500000, reserveEUR: 0, patrimonyBR: 0, patrimonyEU: 0, savingsRateTarget: 0.3 },
      workbooks: [],
    } as unknown as Backup;
    await saveBudget({ category: 'Lazer', monthlyLimit: 100 }, db);
    await importBackup(v1, db);
    expect(await getSettings(db)).toMatchObject({ theme: 'system', lastExportAt: {}, goalBRL: 500000 });
    expect(await db.goals.get(PATRIMONY_GOAL_ID)).toMatchObject({ target: 500000, currency: 'BRL', source: 'patrimony' });
    expect(await db.budgets.count()).toBe(0); // restore replaces everything
    expect(await db.transactions.get('old')).toBeDefined();
  });

  it('upgrades a v1 database: META becomes the Patrimônio goal, settings gain the new fields', async () => {
    const name = 'test-upgrade-' + Math.random();
    const v1 = new Dexie(name);
    v1.version(1).stores({ transactions: 'id, year, [year+month], type, category, paid', rules: 'id, category', settings: 'id', workbooks: 'year' });
    await v1.table('settings').put({ id: 'settings', eurBrlRate: 6, goalBRL: 300000, reserveEUR: 0, patrimonyBR: 1, patrimonyEU: 2, savingsRateTarget: 0.3 });
    await v1.table('transactions').put(tx({ id: 'kept' }));
    v1.close();

    const upgraded = new FinanceDB(name);
    try {
      expect(await getSettings(upgraded)).toMatchObject({ theme: 'system', lastExportAt: {}, patrimonyBR: 1 });
      expect(await upgraded.goals.get(PATRIMONY_GOAL_ID)).toMatchObject({ target: 300000 });
      expect(await upgraded.transactions.get('kept')).toBeDefined();
    } finally {
      await upgraded.delete();
    }
  });
});
