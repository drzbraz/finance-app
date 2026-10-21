import { applyRules } from '../rules/engine';
import { defaultRules } from '../rules/defaults';
import { DEFAULT_SETTINGS, type CategoryRule, type Settings, type Transaction } from '../types';
import { db as defaultDb, type FinanceDB, type StoredWorkbook } from './schema';

export async function ensureSeeded(db: FinanceDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.rules, db.settings, async () => {
    if ((await db.rules.count()) === 0) await db.rules.bulkPut(defaultRules());
    if (!(await db.settings.get('settings'))) await db.settings.put(DEFAULT_SETTINGS);
  });
}

export async function getSettings(db: FinanceDB = defaultDb): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

export async function appOnlyCount(year: number, db: FinanceDB = defaultDb): Promise<number> {
  return db.transactions.where('year').equals(year).filter((t) => !t.source && !t.deleted).count();
}

export async function hasYear(year: number, db: FinanceDB = defaultDb): Promise<boolean> {
  return (await db.transactions.where('year').equals(year).count()) > 0;
}

/**
 * Replaces a year's imported data with a fresh import. Manual categories/tags survive when
 * the same cell is imported again (ids are deterministic: imp-<year>-<cell>). Entries created
 * in the app (no source cell) are kept; edits to imported cells are replaced by the file.
 */
export async function replaceYear(
  year: number,
  txs: Transaction[],
  workbook: Omit<StoredWorkbook, 'year'>,
  settings: Partial<Settings>,
  db: FinanceDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.transactions, db.workbooks, db.settings, db.rules, async () => {
    const old = await db.transactions.where('year').equals(year).toArray();
    const manual = new Map(old.filter((t) => t.categorySource === 'manual').map((t) => [t.id, t]));
    const rules = await db.rules.toArray();
    const merged = applyRules(
      txs.map((t) => {
        const prev = manual.get(t.id);
        return prev ? { ...t, category: prev.category, categorySource: 'manual' as const, tags: [...new Set([...t.tags, ...prev.tags])] } : t;
      }),
      rules,
    );
    await db.transactions.where('year').equals(year).filter((t) => !!t.source).delete();
    await db.transactions.bulkPut(merged);
    await db.workbooks.put({ ...workbook, year });
    const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
    await db.settings.put({ ...current, ...settings, id: 'settings' });
  });
}

export async function saveTransaction(tx: Transaction, db: FinanceDB = defaultDb): Promise<void> {
  await db.transactions.put(tx);
}

/** Imported rows are soft-deleted so export can clear their cell; new rows are removed. */
export async function deleteTransaction(tx: Transaction, db: FinanceDB = defaultDb): Promise<void> {
  if (tx.source) await db.transactions.put({ ...tx, deleted: true });
  else await db.transactions.delete(tx.id);
}

export async function addRuleAndApply(rule: CategoryRule, db: FinanceDB = defaultDb): Promise<number> {
  return db.transaction('rw', db.rules, db.transactions, async () => {
    await db.rules.put(rule);
    const rules = await db.rules.toArray();
    const auto = await db.transactions.filter((t) => t.categorySource === 'auto').toArray();
    const updated = applyRules(auto, rules).filter((t, i) => t.category !== auto[i].category);
    await db.transactions.bulkPut(updated);
    return updated.length;
  });
}

// ---- JSON backup ----

export interface Backup {
  app: 'finance-app';
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  rules: CategoryRule[];
  settings: Settings;
  workbooks: (Omit<StoredWorkbook, 'data'> & { dataBase64: string })[];
}

export async function exportBackup(db: FinanceDB = defaultDb): Promise<Backup> {
  const workbooks = await db.workbooks.toArray();
  return {
    app: 'finance-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: await db.transactions.toArray(),
    rules: await db.rules.toArray(),
    settings: await getSettings(db),
    workbooks: workbooks.map(({ data, ...rest }) => ({ ...rest, dataBase64: toBase64(data) })),
  };
}

export async function importBackup(backup: Backup, db: FinanceDB = defaultDb): Promise<void> {
  if (backup?.app !== 'finance-app' || backup.version !== 1) throw new Error('Arquivo de backup inválido.');
  await db.transaction('rw', db.transactions, db.rules, db.settings, db.workbooks, async () => {
    await Promise.all([db.transactions.clear(), db.rules.clear(), db.workbooks.clear()]);
    await db.transactions.bulkPut(backup.transactions);
    await db.rules.bulkPut(backup.rules);
    await db.settings.put({ ...backup.settings, id: 'settings' });
    await db.workbooks.bulkPut(backup.workbooks.map(({ dataBase64, ...rest }) => ({ ...rest, data: fromBase64(dataBase64) })));
  });
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
