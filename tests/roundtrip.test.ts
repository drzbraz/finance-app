import { exportYearXlsx } from '../src/db/actions';
import { replaceYear, saveTransaction } from '../src/db/repo';
import { FinanceDB } from '../src/db/schema';
import { writeWorkbook } from '../src/export/writeWorkbook';
import { parseWorkbook } from '../src/parser/parseWorkbook';
import { buildWorkbook, loadSheet } from './fixtures/workbook';
import { tx } from './helpers';

// The full user flow: import → change things in the app → export → re-import that export.
const FILE = 'Controle financeiro 2026.xlsx';

let db: FinanceDB;
beforeEach(() => {
  db = new FinanceDB('test-' + Math.random());
});
afterEach(async () => {
  await db.delete();
});

async function importFile(data: ArrayBuffer) {
  const r = await parseWorkbook(data, { fileName: FILE });
  await replaceYear(2026, r.transactions, { fileName: FILE, importedAt: '2026-10-21T00:00:00Z', data }, r.settings, db);
}

const live = async () => (await db.transactions.where('year').equals(2026).toArray()).filter((t) => !t.deleted);

describe('import → app → export → re-import', () => {
  it('does not duplicate entries created in the app', async () => {
    await importFile(await buildWorkbook());
    const before = (await live()).length;
    // e.g. ticking an "expected" checklist item, or "+ Novo" in the table: no source cell.
    await saveTransaction(tx({ id: 'app-1', year: 2026, type: 'fixed', month: 4, description: 'Aluguel', amount: 900, paid: true }), db);
    await saveTransaction(tx({ id: 'app-2', year: 2026, month: 2, description: 'pizza', amount: 9 }), db);

    const { data } = await exportYearXlsx(2026, db);
    await importFile(data);

    const after = await live();
    expect(after).toHaveLength(before + 2);
    expect(after.filter((t) => t.description === 'pizza')).toHaveLength(1);
    expect(after.filter((t) => t.description === 'Aluguel' && t.month === 4)).toHaveLength(1);
  });

  it('is stable across repeated exports', async () => {
    await importFile(await buildWorkbook());
    for (let i = 0; i < 2; i++) await importFile((await exportYearXlsx(2026, db)).data);
    expect((await live()).length).toBe((await parseWorkbook(await buildWorkbook(), { fileName: FILE })).transactions.length);
  });
});

describe('unlabeled rows', () => {
  it('leaves a value on a row with no label in column A where it is', async () => {
    // A fixed amount typed on a row whose label cell is empty imports as "(sem nome)".
    const original = await buildWorkbook({ extra: (ws) => { ws.getCell('A12').value = null; ws.getCell('D12').value = 5; } });
    const txs = (await parseWorkbook(original, { fileName: FILE })).transactions;
    expect(txs.find((t) => t.source?.cell === 'D12')!.description).toBe('(sem nome)');
    const ws = await loadSheet((await writeWorkbook(original, txs)).data);
    expect(ws.getCell('D12').value).toBe(5);
    expect(ws.getCell('A13').value).toBe('Total'); // no "(sem nome)" row inserted
  });
});

describe('exportYearXlsx rebase', () => {
  const get = async (id: string) => db.transactions.get(id);

  it('re-points every row to its final cell after a row insert, keeping what the user chose', async () => {
    await importFile(await buildWorkbook());
    // Manual category + unpaid on the yellow grocery, which moves down when a row is inserted above it.
    await saveTransaction({ ...(await get('imp-2026-B17'))!, category: 'Casa', categorySource: 'manual', tags: ['x'] }, db);
    await saveTransaction({ ...(await get('imp-2026-B16'))!, deleted: true }, db);
    // January variable column is full (B15, B16 taken in the sheet) → row inserted at 17.
    await saveTransaction(tx({ id: 'app-pizza', year: 2026, month: 1, description: 'pizza', amount: 9 }), db);
    await saveTransaction(tx({ id: 'app-pizza2', year: 2026, month: 1, description: 'sushi', amount: 8 }), db);

    const out = await exportYearXlsx(2026, db);
    const ids = (await db.transactions.where('year').equals(2026).primaryKeys()).sort();
    expect(ids).not.toContain('app-pizza');
    // The soft-deleted row is gone after the export; its freed cell B16 is reused by "pizza".
    const all = await db.transactions.where('year').equals(2026).toArray();
    expect(all.some((t) => t.deleted)).toBe(false);
    expect(all.some((t) => t.description === '(sem descrição)')).toBe(false);
    expect((await get('imp-2026-B16'))!.description).toBe('pizza');
    expect(new Set(Object.values(out.placements)).size).toBe(Object.keys(out.placements).length);

    // Every stored source cell really holds that transaction's amount in the exported file.
    const ws = await loadSheet(out.data);
    for (const t of await live()) {
      expect(t.id).toBe(`imp-2026-${t.source!.cell}`);
      expect(ws.getCell(t.source!.cell).value).toBe(t.amount);
    }
    const grocery = (await live()).find((t) => t.description === 'Mercado')!;
    expect(grocery).toMatchObject({ category: 'Casa', categorySource: 'manual', tags: ['x'] });
    expect(grocery.source!.cell).not.toBe('B17');
  });

  it('writes later edits to the new cell, not the pre-export one', async () => {
    await importFile(await buildWorkbook());
    await saveTransaction(tx({ id: 'app-1', year: 2026, type: 'fixed', month: 1, description: 'Netflix', amount: 13 }), db);
    await exportYearXlsx(2026, db); // inserts Netflix before the fixed Total: everything below shifts
    const uber = (await live()).find((t) => t.description === 'uber')!;
    expect(uber.source!.cell).toBe('D16');
    await saveTransaction({ ...uber, amount: 99 }, db);
    const ws = await loadSheet((await exportYearXlsx(2026, db)).data);
    expect(ws.getCell('D16').value).toBe(99);
    expect(ws.getCell('D17').value).toBeNull();
    expect(ws.getCell('A14').value).toBe('Total'); // nothing inserted the second time
  });

  it('keeps manual categories when the exported file is re-imported', async () => {
    await importFile(await buildWorkbook());
    await saveTransaction({ ...(await get('imp-2026-D15'))!, category: 'Lazer', categorySource: 'manual' }, db);
    await saveTransaction(tx({ id: 'app-1', year: 2026, type: 'fixed', month: 1, description: 'Netflix', amount: 13 }), db);
    await importFile((await exportYearXlsx(2026, db)).data);
    expect((await live()).find((t) => t.description === 'uber')).toMatchObject({ category: 'Lazer', categorySource: 'manual' });
  });

  it('only exports the ledger when no workbook is stored, leaving rows untouched', async () => {
    await saveTransaction(tx({ id: 'app-1', year: 2027 }), db);
    const out = await exportYearXlsx(2027, db);
    expect(out.warnings.join(' ')).toMatch(/Lançamentos/);
    expect(await get('app-1')).toBeDefined();
    expect((await get('app-1'))!.source).toBeUndefined();
  });
});
