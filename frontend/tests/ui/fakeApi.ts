/**
 * An in-memory stand-in for the backend: a `fetch` that answers the same /api routes with the
 * same rules as backend/src/*\/*.service.ts (soft delete of imported rows, rebase after export,
 * latest-year settings, manual categories kept on re-import…). Spreadsheets go through the
 * backend's real parser and writer, so import/export stay end to end.
 *
 * `db` is a small Dexie-like view of the state for seeding and assertions. Writing through it
 * skips the UI cache, so seed before rendering; after rendering, write through src/api/repo.
 */
import {
  applyRules,
  BACKUP_APP,
  BACKUP_VERSION,
  DEFAULT_SETTINGS,
  defaultRules,
  EXPORT_WARNINGS_HEADER,
  type Backup,
  type Budget,
  type CategoryRule,
  type Goal,
  type ImportResult,
  type RecurringItem,
  type Settings,
  type Transaction,
} from '@finance/shared';
import { writeLedgerOnly, writeWorkbook } from '../../../backend/src/spreadsheets/domain/export/write-workbook';
import { parseWorkbook, SHEET_NAME } from '../../../backend/src/spreadsheets/domain/parser/parse-workbook';

interface StoredWorkbook {
  year: number;
  fileName: string;
  importedAt: string;
  data: Buffer;
}

const PATRIMONY_GOAL_ID = 'goal-patrimonio';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const now = () => new Date().toISOString();

class Table<T extends object> {
  readonly rows = new Map<unknown, T>();
  constructor(readonly key: keyof T) {}

  // Dexie-like helpers for tests.
  async get(key: unknown): Promise<T | undefined> {
    return clone(this.rows.get(key));
  }
  async put(row: T): Promise<void> {
    this.rows.set(row[this.key], clone(row));
  }
  async bulkPut(rows: T[]): Promise<void> {
    for (const r of rows) await this.put(r);
  }
  async update(key: unknown, patch: Partial<T>): Promise<void> {
    const row = this.rows.get(key);
    if (row) this.rows.set(key, { ...row, ...clone(patch) });
  }
  async delete(key: unknown): Promise<void> {
    this.rows.delete(key);
  }
  async count(): Promise<number> {
    return this.rows.size;
  }
  async toArray(): Promise<T[]> {
    return this.all();
  }
  filter(fn: (row: T) => boolean) {
    return { toArray: async () => this.all().filter(fn), count: async () => this.all().filter(fn).length };
  }

  all(): T[] {
    return [...this.rows.values()].map(clone);
  }
  clear(): void {
    this.rows.clear();
  }
}

export const db = {
  transactions: new Table<Transaction>('id'),
  rules: new Table<CategoryRule>('id'),
  settings: new Table<Settings>('id'),
  budgets: new Table<Budget>('category'),
  goals: new Table<Goal>('id'),
  recurring: new Table<RecurringItem>('key'),
  workbooks: new Table<StoredWorkbook>('year'),
};

/** A fresh server: default rules and settings, as the backend's SeedService leaves it. */
export function resetServer(): void {
  Object.values(db).forEach((t) => t.clear());
  for (const r of defaultRules()) db.rules.rows.set(r.id, r);
  db.settings.rows.set('settings', { ...DEFAULT_SETTINGS, id: 'settings' });
}

export const getSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...db.settings.rows.get('settings') });

// ---- server logic (mirrors the services) ----

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const live = (year: number) => db.transactions.all().filter((t) => t.year === year && !t.deleted);

function saveStamped(txs: Transaction[]): Transaction[] {
  const updatedAt = now();
  const stamped = txs.map((t) => ({ ...t, updatedAt }));
  stamped.forEach((t) => db.transactions.rows.set(t.id, t));
  return stamped;
}

/** Imported rows are soft-deleted so the export can clear their cell; app-only rows are removed. */
function removeTransactions(txs: Transaction[]): void {
  const updatedAt = now();
  for (const t of txs) {
    if (t.source) db.transactions.rows.set(t.id, { ...t, deleted: true, updatedAt });
    else db.transactions.rows.delete(t.id);
  }
}

function yearStatus(year: number) {
  const all = db.transactions.all().filter((t) => t.year === year);
  const since = getSettings().lastExportAt[year] ?? db.workbooks.rows.get(year)?.importedAt ?? '';
  return {
    year,
    exists: all.length > 0,
    appOnlyCount: all.filter((t) => !t.source && !t.deleted).length,
    unexportedCount: all.filter((t) => !!t.updatedAt && t.updatedAt > since).length,
  };
}

function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch, id: 'settings' as const };
  db.settings.rows.set('settings', next);
  return next;
}

async function parse(data: Buffer, fileName: string | undefined, year?: number): Promise<ImportResult> {
  try {
    return await parseWorkbook(data, { fileName, year });
  } catch (e) {
    throw new HttpError(422, `Could not read the spreadsheet: ${(e as Error).message}`);
  }
}

async function preview(data: Buffer, fileName: string, year?: number) {
  const result = await parse(data, fileName, year);
  result.transactions = applyRules(result.transactions, db.rules.all());
  if (result.year === null) return { result, existing: false, appOnlyCount: 0 };
  const status = yearStatus(result.year);
  return { result, existing: status.exists, appOnlyCount: status.appOnlyCount };
}

async function importYear(year: number, data: Buffer, fileName: string) {
  const result = await parse(data, fileName, year);
  const current = new Map(db.transactions.all().filter((t) => t.year === year).map((t) => [t.id, t]));
  const incoming = result.transactions.map((t) => {
    const prev = current.get(t.id);
    if (!prev) return t;
    const kept = prev.split && prev.amount === t.amount ? { ...t, split: prev.split } : t;
    return prev.categorySource === 'manual' ? { ...kept, category: prev.category, categorySource: 'manual' as const, tags: [...new Set([...t.tags, ...prev.tags])] } : kept;
  });
  for (const t of db.transactions.all()) if (t.year === year && t.source) db.transactions.rows.delete(t.id);
  for (const t of applyRules(incoming, db.rules.all())) db.transactions.rows.set(t.id, t);
  db.workbooks.rows.set(year, { year, fileName, importedAt: now(), data });
  if ([...db.workbooks.rows.keys()].every((y) => (y as number) <= year)) {
    updateSettings(result.settings);
    if (result.settings.goalBRL) {
      const goal = db.goals.rows.get(PATRIMONY_GOAL_ID);
      db.goals.rows.set(
        PATRIMONY_GOAL_ID,
        goal
          ? { ...goal, target: result.settings.goalBRL }
          : { id: PATRIMONY_GOAL_ID, name: 'Patrimônio', target: result.settings.goalBRL, currency: 'BRL', source: 'patrimony', contributions: [], createdAt: now() },
      );
    }
  }
  return { year, imported: result.transactions.length, warnings: result.warnings.map((w) => w.message) };
}

async function exportYear(year: number) {
  const txs = db.transactions.all().filter((t) => t.year === year);
  const stored = db.workbooks.rows.get(year);
  const fileName = stored?.fileName ?? `Controle financeiro ${year}.xlsx`;
  if (!stored) return { fileName, ...(await writeLedgerOnly(txs)) };
  let out;
  try {
    out = await writeWorkbook(stored.data, txs);
  } catch (e) {
    throw new HttpError(500, (e as Error).message);
  }
  const exportedAt = now();
  for (const t of txs) {
    if (t.deleted) {
      db.transactions.rows.delete(t.id);
      continue;
    }
    const cell = out.placements[t.id];
    if (!cell) continue;
    const id = `imp-${year}-${cell}`;
    if (id !== t.id) db.transactions.rows.delete(t.id);
    db.transactions.rows.set(id, { ...t, id, source: { sheet: SHEET_NAME, cell } });
  }
  db.workbooks.rows.set(year, { year, fileName, importedAt: exportedAt, data: Buffer.from(out.data as ArrayBuffer) });
  updateSettings({ lastExportAt: { ...getSettings().lastExportAt, [year]: exportedAt } });
  return { fileName, data: out.data, warnings: out.warnings };
}

function exportBackup(): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now(),
    transactions: db.transactions.all(),
    rules: db.rules.all(),
    settings: getSettings(),
    workbooks: db.workbooks.all().map(({ data, ...info }) => ({ ...info, dataBase64: Buffer.from(data).toString('base64') })),
    budgets: db.budgets.all(),
    goals: db.goals.all(),
    recurring: db.recurring.all(),
  };
}

function restoreBackup(b: Backup): void {
  if (b?.app !== BACKUP_APP || (b.version !== 1 && b.version !== 2)) throw new HttpError(400, 'Invalid backup');
  Object.values(db).forEach((t) => t.clear());
  b.transactions.forEach((t) => db.transactions.rows.set(t.id, t));
  b.rules.forEach((r) => db.rules.rows.set(r.id, r));
  const settings = { ...DEFAULT_SETTINGS, ...b.settings, id: 'settings' as const };
  db.settings.rows.set('settings', settings);
  b.workbooks.forEach(({ dataBase64, ...info }) => db.workbooks.rows.set(info.year, { ...info, data: Buffer.from(dataBase64, 'base64') }));
  (b.budgets ?? []).forEach((x) => db.budgets.rows.set(x.category, x));
  (b.recurring ?? []).forEach((x) => db.recurring.rows.set(x.key, x));
  const goals = b.goals ?? (settings.goalBRL ? [{ id: PATRIMONY_GOAL_ID, name: 'Patrimônio', target: settings.goalBRL, currency: 'BRL' as const, source: 'patrimony' as const, contributions: [], createdAt: now() }] : []);
  goals.forEach((g) => db.goals.rows.set(g.id, g));
}

// ---- routing ----

type Reply = { status: number; body?: unknown; file?: { data: ArrayBuffer | Buffer; fileName: string; warnings: string[] } };
const ok = (body?: unknown): Reply => (body === undefined ? { status: 204 } : { status: 200, body });

async function uploaded(body: unknown): Promise<{ data: Buffer; fileName: string }> {
  const file = body instanceof FormData ? body.get('file') : null;
  if (!(file instanceof Blob)) throw new HttpError(400, 'Send the spreadsheet in the "file" field');
  const fileName = (file as File).name ?? '';
  if (!fileName.toLowerCase().endsWith('.xlsx')) throw new HttpError(400, 'Only .xlsx files can be imported');
  return { data: Buffer.from(await file.arrayBuffer()), fileName };
}

async function route(method: string, path: string, query: URLSearchParams, body: any): Promise<Reply> {
  const p = path.split('/').filter(Boolean).map(decodeURIComponent);
  const b = p[1];
  // "PUT transactions/:", "POST years/:/spreadsheet/export"…: the second segment is the parameter.
  const key = `${method} ${p.map((seg, i) => (i === 1 ? ':' : seg)).join('/')}`;
  const literal = `${method} ${p.join('/')}`;

  switch (literal) {
    case 'GET health': return ok({ status: 'ok' });
    case 'GET transactions': return ok(live(Number(query.get('year'))));
    case 'POST transactions/bulk': return ok(saveStamped(body.transactions));
    case 'POST transactions/bulk-delete':
      removeTransactions(body.ids.map((id: string) => db.transactions.rows.get(id)).filter(Boolean));
      return ok();
    case 'GET rules': return ok(db.rules.all());
    case 'POST rules': {
      db.rules.rows.set(body.id, body);
      const auto = db.transactions.all().filter((t) => t.categorySource === 'auto');
      const changed = applyRules(auto, db.rules.all()).filter((t, i) => t.category !== auto[i].category);
      changed.forEach((t) => db.transactions.rows.set(t.id, t));
      return { status: 201, body: { rule: body, updated: changed.length } };
    }
    case 'GET settings': return ok(getSettings());
    case 'PATCH settings': return ok(updateSettings(body));
    case 'GET budgets': return ok(db.budgets.all());
    case 'POST budgets/bulk':
      for (const x of body.budgets as Budget[]) x.monthlyLimit > 0 ? db.budgets.rows.set(x.category, x) : db.budgets.rows.delete(x.category);
      return ok();
    case 'POST budgets/bulk-delete':
      body.categories.forEach((x: string) => db.budgets.rows.delete(x));
      return ok();
    case 'GET goals': return ok(db.goals.all());
    case 'GET recurring': return ok(db.recurring.all());
    case 'POST recurring/update': {
      const { previous, next, renamed } = body as { previous: RecurringItem | null; next: RecurringItem; renamed: Transaction[] };
      if (previous && previous.key !== next.key) db.recurring.rows.set(previous.key, { ...previous, removed: true, active: false });
      db.recurring.rows.set(next.key, { ...next, removed: false });
      saveStamped(renamed);
      return ok();
    }
    case 'GET years':
      return ok([...new Set(db.transactions.all().map((t) => t.year))].filter((y) => y > 0).sort((x, y) => x - y));
    case 'POST spreadsheets/preview': {
      const f = await uploaded(body);
      return ok(await preview(f.data, f.fileName, query.get('year') ? Number(query.get('year')) : undefined));
    }
    case 'GET backup': return ok(exportBackup());
    case 'POST backup': restoreBackup(body); return ok();
  }

  switch (key) {
    case 'PUT transactions/:': {
      if (body.id !== b) throw new HttpError(400, 'The body id does not match the URL');
      return ok(saveStamped([body])[0]);
    }
    case 'POST transactions/:/restore':
      db.transactions.rows.set(b, body);
      return ok();
    case 'DELETE transactions/:': {
      const t = db.transactions.rows.get(b);
      if (!t) throw new HttpError(404, `Transaction ${b} not found`);
      removeTransactions([t]);
      return ok();
    }
    case 'DELETE rules/:': db.rules.rows.delete(b); return ok();
    case 'PUT budgets/:':
      if (body.monthlyLimit > 0) db.budgets.rows.set(b, { category: b, monthlyLimit: body.monthlyLimit });
      else db.budgets.rows.delete(b);
      return ok();
    case 'PUT goals/:': db.goals.rows.set(b, body); return ok();
    case 'DELETE goals/:': db.goals.rows.delete(b); return ok();
    case 'PUT recurring/:': db.recurring.rows.set(b, body); return ok();
    case 'DELETE recurring/:': {
      const item = db.recurring.rows.get(b);
      if (!item) throw new HttpError(404, `Recurring item ${b} not found`);
      db.recurring.rows.set(b, { ...item, removed: true, active: false });
      return ok();
    }
    case 'GET years/:': return ok(yearStatus(Number(b)));
    case 'DELETE years/:':
      for (const t of db.transactions.all()) if (t.year === Number(b)) db.transactions.rows.delete(t.id);
      db.workbooks.rows.delete(Number(b));
      return ok();
    case 'PUT years/:/spreadsheet': {
      const f = await uploaded(body);
      return ok(await importYear(Number(b), f.data, f.fileName));
    }
    case 'POST years/:/spreadsheet/export': {
      const out = await exportYear(Number(b));
      return { status: 200, file: out };
    }
  }
  throw new HttpError(404, `Cannot ${method} /api${path}`);
}

/** Requests the app made, for tests that check what was sent. */
export const requests: { method: string; path: string; body?: unknown }[] = [];

export const fakeFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(String(input), 'http://localhost');
  if (!url.pathname.startsWith('/api/')) throw new TypeError(`Unexpected request to ${url.pathname}`);
  const method = (init.method ?? 'GET').toUpperCase();
  const path = url.pathname.slice('/api'.length);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  requests.push({ method, path, body });
  try {
    const reply = await route(method, path, url.searchParams, body);
    if (reply.file) {
      const { data, fileName, warnings } = reply.file;
      const ascii = fileName.replace(/[^\x20-\x7e]/g, '_');
      // Raw bytes: Node's Response cannot read jsdom's Blob.
      return new Response(new Uint8Array(data as ArrayBuffer), {
        status: 200,
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          [EXPORT_WARNINGS_HEADER]: encodeURIComponent(JSON.stringify(warnings)),
        },
      });
    }
    if (reply.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(clone(reply.body)), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ statusCode: status, message: (e as Error).message }), { status, headers: { 'Content-Type': 'application/json' } });
  }
};
