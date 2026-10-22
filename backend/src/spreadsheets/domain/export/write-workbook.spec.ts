import type { Transaction } from '@finance/shared';
import ExcelJS from 'exceljs';
import { fillArgb } from '../parser/cells.js';
import { parseWorkbook } from '../parser/parse-workbook.js';
import { LEDGER_SHEET, writeWorkbook } from './write-workbook.js';
import { buildWorkbook, loadSheet } from '../../../testing/workbook.fixture.js';
import { tx } from '../../../testing/factories.js';

const FILE = 'Controle financeiro 2026.xlsx';

let original: Buffer;
let imported: Transaction[];
beforeAll(async () => {
  original = await buildWorkbook();
  imported = (await parseWorkbook(original, { fileName: FILE })).transactions;
});

const replace = (id: string, over: Partial<Transaction>) => imported.map((t) => (t.id === id ? { ...t, ...over } : t));
const formula = (ws: ExcelJS.Worksheet, addr: string) => (ws.getCell(addr).value as ExcelJS.CellFormulaValue).formula;

async function exportAndLoad(txs: Transaction[]) {
  const { data, warnings } = await writeWorkbook(original, txs);
  return { ws: await loadSheet(data), data, warnings };
}

/** The fields a re-import must reproduce. */
const comparable = (t: Transaction) => {
  const { category: _c, categorySource: _s, ...rest } = t;
  return rest;
};

describe('writeWorkbook', () => {
  it('round-trips an unchanged year, notes included', async () => {
    const { data, warnings } = await writeWorkbook(original, imported);
    expect(warnings).toEqual([]);
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.map(comparable)).toEqual(imported.map(comparable));
    expect(again.find((t) => t.id === 'imp-2026-B15')).toMatchObject({ description: 'jantar #amigos', noteHeader: 'Fulano    (2026-04-14 08:56:59)' });
  });

  it('leaves formula cells untouched', async () => {
    const { ws } = await exportAndLoad(imported);
    expect(formula(ws, 'B12')).toBe('SUM(B17:B17)');
    expect(formula(ws, 'B18')).toBe('SUM(B15:B17)');
    expect(formula(ws, 'P3')).toBe('GOOGLEFINANCE("EURBRL")');
  });

  it('clears the green when a fixed item becomes unpaid, without touching cells that shared the style', async () => {
    const { ws } = await exportAndLoad(replace('imp-2026-B11', { paid: false }));
    expect(fillArgb(ws.getCell('B11'))).toBeUndefined();
    expect(fillArgb(ws.getCell('B4'))).toBe('FFD9EAD3');
    expect(fillArgb(ws.getCell('B8'))).toBe('FFD9EAD3');
  });

  it('paints a newly paid cell green, and only that cell', async () => {
    const { ws } = await exportAndLoad(replace('imp-2026-C4', { paid: true }));
    expect(fillArgb(ws.getCell('C4'))).toBe('FFD9EAD3');
    expect(fillArgb(ws.getCell('D4'))).toBeUndefined();
    expect(fillArgb(ws.getCell('C3'))).toBeUndefined();
  });

  it('does not paint variable expenses green', async () => {
    const { ws } = await exportAndLoad(imported);
    expect(fillArgb(ws.getCell('B16'))).toBeUndefined();
    expect(fillArgb(ws.getCell('B17'))).toBe('FFFFF2CC');
  });

  it('clears the cell and note of a deleted transaction', async () => {
    const { ws, data } = await exportAndLoad(replace('imp-2026-B15', { deleted: true }));
    expect(ws.getCell('B15').value).toBeNull();
    expect(ws.getCell('B15').note).toBeUndefined();
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.find((t) => t.source?.cell === 'B15')).toBeUndefined();
    expect(again).toHaveLength(imported.length - 1);
  });

  it('writes edited amounts and descriptions back to the same cell', async () => {
    const { data } = await exportAndLoad(replace('imp-2026-B15', { amount: 31.5, description: 'jantar fora #amigos' }));
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.find((t) => t.id === 'imp-2026-B15')).toMatchObject({ amount: 31.5, description: 'jantar fora #amigos' });
  });

  it('puts a new variable expense into a free cell of its month', async () => {
    const { ws } = await exportAndLoad([...imported, tx({ month: 2, amount: 9, description: 'pizza' })]);
    expect(ws.getCell('C15').value).toBe(9);
    expect(ws.getCell('C15').note).toContain('pizza');
    expect(ws.getCell('A19').value).toBe('Despesas Adicionais'); // nothing inserted
  });

  it('inserts a row above the yellow block when the month column is full', async () => {
    const { ws, data } = await exportAndLoad([...imported, tx({ month: 1, amount: 9, description: 'pizza' })]);
    expect(ws.getCell('B17').value).toBe(9);
    expect(fillArgb(ws.getCell('B17'))).toBeUndefined();
    // Yellow block, Totals and references below moved down by one.
    expect(fillArgb(ws.getCell('B18'))).toBe('FFFFF2CC');
    expect(ws.getCell('A19').value).toBe('Total');
    expect(formula(ws, 'B19')).toBe('SUM(B15:B18)');
    expect(formula(ws, 'B12')).toBe('SUM(B18:B18)');
    expect(formula(ws, 'B25')).toBe('B9');

    const again = await parseWorkbook(data, { fileName: FILE });
    expect(again.transactions.find((t) => t.source?.cell === 'B17')!.description).toBe('pizza');
    // Notes moved with their cells.
    expect(again.transactions.find((t) => t.source?.cell === 'C18')!.description).toBe('lidl');
    expect(again.sections.find((s) => s.type === 'variable')).toMatchObject({ firstRow: 15, lastRow: 18, totalRow: 19 });
  });

  it('places a new yellow grocery inside the yellow block', async () => {
    const grocery = (month: number) => tx({ month, amount: 15, description: 'Mercado', subgroup: 'FFFFF2CC' });
    // March: D17 is a free yellow cell.
    const free = await exportAndLoad([...imported, grocery(3)]);
    expect(free.ws.getCell('D17').value).toBe(15);
    expect(free.ws.getCell('D15').value).toBe(12); // non-yellow rows untouched

    // January: B17 is taken, so a yellow row is added at the end of the block.
    const full = await exportAndLoad([...imported, grocery(1)]);
    expect(full.ws.getCell('B18').value).toBe(15);
    expect(fillArgb(full.ws.getCell('B18'))).toBe('FFFFF2CC');
    expect(formula(full.ws, 'B19')).toBe('SUM(B15:B18)');
    const again = (await parseWorkbook(full.data, { fileName: FILE })).transactions;
    expect(again.find((t) => t.source?.cell === 'B18')).toMatchObject({ description: 'Mercado', subgroup: 'FFFFF2CC' });
  });

  it('adds a new fixed label as a row before the section Total', async () => {
    const { ws, data } = await exportAndLoad([...imported, tx({ type: 'fixed', month: 1, amount: 13, description: 'Netflix', paid: true })]);
    expect(ws.getCell('A13').value).toBe('Netflix');
    expect(ws.getCell('B13').value).toBe(13);
    expect(fillArgb(ws.getCell('B13'))).toBe('FFD9EAD3');
    expect(ws.getCell('A14').value).toBe('Total');
    expect(formula(ws, 'B14')).toBe('SUM(B11:B13)');
    expect(formula(ws, 'B19')).toBe('SUM(B16:B18)');
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.find((t) => t.description === 'Netflix')).toMatchObject({ type: 'fixed', month: 1, paid: true });
  });

  it('keeps the notes of every cell below an inserted row', async () => {
    const { data } = await exportAndLoad([...imported, tx({ type: 'fixed', month: 1, amount: 13, description: 'Netflix' })]);
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    const at = (cell: string) => again.find((t) => t.source?.cell === cell);
    expect(at('B16')).toMatchObject({ description: 'jantar #amigos', noteHeader: 'Fulano    (2026-04-14 08:56:59)' });
    expect(at('D16')!.description).toBe('uber');
    expect(at('C18')!.description).toBe('lidl');
  });

  it('reuses an existing label row when its month cell is empty', async () => {
    const { ws } = await exportAndLoad([...imported, tx({ type: 'fixed', month: 4, amount: 900, description: 'Aluguel', paid: false })]);
    expect(ws.getCell('E11').value).toBe(900);
    expect(ws.getCell('A13').value).toBe('Total');
  });

  it('moves a transaction whose month was edited', async () => {
    const { ws, data } = await exportAndLoad(replace('imp-2026-B15', { month: 2 }));
    expect(ws.getCell('B15').value).toBeNull();
    expect(ws.getCell('C15').value).toBe(25);
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.find((t) => t.source?.cell === 'C15')).toMatchObject({ month: 2, description: 'jantar #amigos' });
  });

  it('moves a transaction whose type was edited', async () => {
    const { ws, data } = await exportAndLoad(replace('imp-2026-B20', { type: 'fixed', paid: true }));
    expect(ws.getCell('B20').value).toBeNull(); // old place, before the insert shifted nothing above it…
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    const moved = again.filter((t) => t.description === 'Presente');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ type: 'fixed', amount: 60 });
  });

  it('re-places a renamed fixed item under a new label, keeping the old row for other months', async () => {
    const { ws, data } = await exportAndLoad(replace('imp-2026-B11', { description: 'Renda' }));
    expect(ws.getCell('A11').value).toBe('Aluguel'); // col A is never rewritten
    expect(ws.getCell('B11').value).toBeNull();
    expect(ws.getCell('C11').value).toBe(900);
    expect(ws.getCell('A13').value).toBe('Renda');
    expect(ws.getCell('B13').value).toBe(900);
    expect(formula(ws, 'B14')).toBe('SUM(B11:B13)');
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.find((t) => t.description === 'Renda')).toMatchObject({ type: 'fixed', month: 1, amount: 900, paid: true });
  });

  it('re-places a renamed item into an existing row with that label', async () => {
    const { ws } = await exportAndLoad(replace('imp-2026-B4', { description: 'Salário' }).map((t) =>
      t.id === 'imp-2026-C11' ? { ...t, description: 'Aluguel' } : t,
    ));
    // Unchanged labels stay where they are.
    expect(ws.getCell('B4').value).toBe(3000);
    expect(ws.getCell('C11').value).toBe(900);
    expect(ws.getCell('A13').value).toBe('Total');
  });

  it('does not treat a rich-text label as renamed', async () => {
    const rich = await buildWorkbook({
      extra: (s) => { s.getCell('A11').value = { richText: [{ text: 'Alu' }, { text: 'guel' }] }; },
    });
    const txs = (await parseWorkbook(rich, { fileName: FILE })).transactions;
    expect(txs.find((t) => t.id === 'imp-2026-B11')!.description).toBe('Aluguel');
    const { data } = await writeWorkbook(rich, txs);
    const ws = await loadSheet(data);
    expect(ws.getCell('B11').value).toBe(900);
    expect(ws.getCell('A13').value).toBe('Total'); // no duplicate row inserted
  });

  it('adds a Lançamentos sheet with one row per live transaction', async () => {
    const txs = [...replace('imp-2026-B16', { deleted: true }), tx({ month: 2, amount: 9, description: 'pizza', tags: ['fds'] })];
    const { data } = await writeWorkbook(original, txs);
    const ledger = await loadSheet(data, LEDGER_SHEET);
    expect(ledger.getRow(1).values).toContain('Descrição');
    expect(ledger.actualRowCount).toBe(1 + imported.length);
    const descriptions: unknown[] = [];
    ledger.eachRow((r, i) => i > 1 && descriptions.push(r.getCell(2).value));
    expect(descriptions).toContain('pizza');
    expect(descriptions).not.toContain('(sem descrição)');
  });

  it('replaces an existing Lançamentos sheet instead of adding a second one', async () => {
    const first = (await writeWorkbook(original, imported)).data;
    const { data } = await writeWorkbook(first, imported);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.filter((w) => w.name === LEDGER_SHEET)).toHaveLength(1);
    // And the main sheet still parses identically.
    expect((await parseWorkbook(data, { fileName: FILE })).transactions.map(comparable)).toEqual(imported.map(comparable));
  });

  it('warns and skips a transaction that has nowhere to go', async () => {
    const { warnings } = await writeWorkbook(original, [...imported, tx({ month: 13, description: 'mês inválido' })]);
    expect(warnings.join(' ')).toContain('mês inválido');
  });

  it('keeps notes when the data comes back after an insert-heavy export', async () => {
    const extra = [1, 2, 3].map((i) => tx({ month: 1, amount: i, description: `item ${i}` }));
    const { data } = await exportAndLoad([...imported, ...extra]);
    const again = (await parseWorkbook(data, { fileName: FILE })).transactions;
    expect(again.filter((t) => t.type === 'variable').map((t) => t.description).sort()).toEqual(
      ['(sem descrição)', 'Mercado', 'item 1', 'item 2', 'item 3', 'jantar #amigos', 'lidl', 'uber'].sort(),
    );
  });
});
