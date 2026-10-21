import { applyRules } from '../rules/engine';
import { defaultRules } from '../rules/defaults';
import { DEFAULT_SETTINGS, type Budget, type CategoryRule, type Goal, type RecurringItem, type Settings, type Transaction } from '../types';
import { db as defaultDb, patrimonyGoal, PATRIMONY_GOAL_ID, type FinanceDB, type StoredWorkbook } from './schema';

export async function ensureSeeded(db: FinanceDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.rules, db.settings, async () => {
    if ((await db.rules.count()) === 0) await db.rules.bulkPut(defaultRules());
    if (!(await db.settings.get('settings'))) await db.settings.put(DEFAULT_SETTINGS);
  });
}

export async function getSettings(db: FinanceDB = defaultDb): Promise<Settings> {
  // Spread over defaults so rows saved by older versions get the new fields.
  return { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) };
}

export async function saveSettings(patch: Partial<Settings>, db: FinanceDB = defaultDb): Promise<void> {
  await db.settings.put({ ...(await getSettings(db)), ...patch, id: 'settings' });
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
  await db.transaction('rw', [db.transactions, db.workbooks, db.settings, db.rules, db.goals], async () => {
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
    // Only the most recent year's sheet updates settings (rate, patrimony, goal): importing an
    // older year must not roll them back to that year's values.
    const years = (await db.workbooks.toCollection().primaryKeys()) as number[];
    if (years.some((y) => y > year)) return;
    const current = await getSettings(db);
    await db.settings.put({ ...current, ...settings, id: 'settings' });
    // The sheet's META keeps the Patrimônio goal's target in sync.
    if (settings.goalBRL) {
      const goal = await db.goals.get(PATRIMONY_GOAL_ID);
      await db.goals.put(goal ? { ...goal, target: settings.goalBRL } : patrimonyGoal(settings.goalBRL));
    }
  });
}

/**
 * After an export, the exported file becomes the year's baseline workbook. Every transaction
 * written to the sheet is re-pointed to its final cell there and gets the id a re-import of
 * that file would give it (imp-<year>-<cell>), so importing the exported file later replaces
 * entries instead of duplicating them. Soft-deleted rows are gone from the file, so they are dropped.
 */
export async function rebaseAfterExport(
  year: number,
  data: ArrayBuffer,
  placements: Record<string, string>,
  sheet: string,
  fileName: string,
  db: FinanceDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.transactions, db.workbooks, async () => {
    const txs = await db.transactions.where('year').equals(year).toArray();
    const removed: string[] = [];
    const updated: Transaction[] = [];
    for (const t of txs) {
      if (t.deleted) {
        removed.push(t.id);
        continue;
      }
      const cell = placements[t.id];
      if (!cell) continue;
      const id = `imp-${year}-${cell}`;
      if (id !== t.id) removed.push(t.id);
      updated.push({ ...t, id, source: { sheet, cell } });
    }
    await db.transactions.bulkDelete(removed);
    await db.transactions.bulkPut(updated);
    await db.workbooks.put({ year, fileName, importedAt: new Date().toISOString(), data });
  });
}

/** Removes a year's transactions and its stored workbook. */
export async function deleteYear(year: number, db: FinanceDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.transactions, db.workbooks, async () => {
    await db.transactions.where('year').equals(year).delete();
    await db.workbooks.delete(year);
  });
}

export async function saveTransaction(tx: Transaction, db: FinanceDB = defaultDb): Promise<void> {
  await db.transactions.put({ ...tx, updatedAt: new Date().toISOString() });
}

/** Imported rows are soft-deleted so export can clear their cell; new rows are removed. */
export async function deleteTransaction(tx: Transaction, db: FinanceDB = defaultDb): Promise<void> {
  if (tx.source) await db.transactions.put({ ...tx, deleted: true, updatedAt: new Date().toISOString() });
  else await db.transactions.delete(tx.id);
}

/** Puts a transaction back exactly as it was (undo for edits and deletes). */
export async function restoreTransaction(tx: Transaction, db: FinanceDB = defaultDb): Promise<void> {
  await db.transactions.put(tx);
}

/** Changes in the app since the year's last xlsx export (or import, when never exported). */
export async function unexportedCount(year: number, db: FinanceDB = defaultDb): Promise<number> {
  const settings = await getSettings(db);
  const since = settings.lastExportAt[year] ?? (await db.workbooks.get(year))?.importedAt ?? '';
  return db.transactions.where('year').equals(year).filter((t) => !!t.updatedAt && t.updatedAt > since).count();
}

// ---- budgets, goals, bills ----

export async function saveBudget(budget: Budget, db: FinanceDB = defaultDb): Promise<void> {
  if (budget.monthlyLimit > 0) await db.budgets.put(budget);
  else await db.budgets.delete(budget.category);
}

export async function saveGoal(goal: Goal, db: FinanceDB = defaultDb): Promise<void> {
  await db.goals.put(goal);
}

export async function deleteGoal(id: string, db: FinanceDB = defaultDb): Promise<void> {
  await db.goals.delete(id);
}

export async function saveRecurring(item: RecurringItem, db: FinanceDB = defaultDb): Promise<void> {
  await db.recurring.put(item);
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
  version: 1 | 2;
  exportedAt: string;
  transactions: Transaction[];
  rules: CategoryRule[];
  settings: Settings;
  workbooks: (Omit<StoredWorkbook, 'data'> & { dataBase64: string })[];
  // v2
  budgets?: Budget[];
  goals?: Goal[];
  recurring?: RecurringItem[];
}

export async function exportBackup(db: FinanceDB = defaultDb): Promise<Backup> {
  const workbooks = await db.workbooks.toArray();
  return {
    app: 'finance-app',
    version: 2,
    exportedAt: new Date().toISOString(),
    transactions: await db.transactions.toArray(),
    rules: await db.rules.toArray(),
    settings: await getSettings(db),
    workbooks: workbooks.map(({ data, ...rest }) => ({ ...rest, dataBase64: toBase64(data) })),
    budgets: await db.budgets.toArray(),
    goals: await db.goals.toArray(),
    recurring: await db.recurring.toArray(),
  };
}

export async function importBackup(backup: Backup, db: FinanceDB = defaultDb): Promise<void> {
  if (backup?.app !== 'finance-app' || (backup.version !== 1 && backup.version !== 2)) throw new Error('Arquivo de backup inválido.');
  const tables = [db.transactions, db.rules, db.settings, db.workbooks, db.budgets, db.goals, db.recurring];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.transactions.bulkPut(backup.transactions);
    await db.rules.bulkPut(backup.rules);
    const settings = { ...DEFAULT_SETTINGS, ...backup.settings, id: 'settings' as const };
    await db.settings.put(settings);
    await db.workbooks.bulkPut(backup.workbooks.map(({ dataBase64, ...rest }) => ({ ...rest, data: fromBase64(dataBase64) })));
    await db.budgets.bulkPut(backup.budgets ?? []);
    await db.recurring.bulkPut(backup.recurring ?? []);
    // A v1 backup has no goals: rebuild the Patrimônio goal from its META.
    const goals = backup.goals ?? (settings.goalBRL ? [patrimonyGoal(settings.goalBRL)] : []);
    await db.goals.bulkPut(goals);
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
