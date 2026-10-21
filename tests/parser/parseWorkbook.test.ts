import ExcelJS from 'exceljs';
import { detectYear, extractTags, parseWorkbook } from '../../src/parser/parseWorkbook';
import type { ImportResult, Transaction } from '../../src/types';
import { buildWorkbook, googleNote, loadSheet } from '../fixtures/workbook';

const FILE = 'Controle financeiro 2026.xlsx';
const byCell = (r: ImportResult, cell: string): Transaction | undefined =>
  r.transactions.find((t) => t.source?.cell === cell);

describe('parseWorkbook', () => {
  let r: ImportResult;
  beforeAll(async () => {
    r = await parseWorkbook(await buildWorkbook(), { fileName: FILE });
  });

  it('finds all five sections, bounded by their Total rows', () => {
    expect(r.sections.map((s) => [s.type, s.labelRow, s.firstRow, s.lastRow, s.totalRow])).toEqual([
      ['income', 3, 4, 4, 5],
      ['investment', 7, 8, 8, 9],
      ['fixed', 10, 11, 12, 13],
      ['variable', 14, 15, 17, 18],
      ['additional', 19, 20, 20, 21],
    ]);
    expect(r.warnings.filter((w) => w.kind === 'missing-section')).toEqual([]);
  });

  it('imports exactly the non-formula numeric cells', () => {
    expect(r.transactions.map((t) => t.source!.cell).sort()).toEqual(
      ['B4', 'C4', 'D4', 'B8', 'B11', 'C11', 'B15', 'D15', 'B16', 'B17', 'C17', 'B20'].sort(),
    );
    // Mercado =SUM row, Total rows and the summary block are not transactions.
    expect(byCell(r, 'B12')).toBeUndefined();
    expect(byCell(r, 'B24')).toBeUndefined();
  });

  it('uses the row label as description for labeled sections', () => {
    expect(byCell(r, 'B4')).toMatchObject({ type: 'income', description: 'Salário', amount: 3000, month: 1 });
    expect(byCell(r, 'B20')).toMatchObject({ type: 'additional', description: 'Presente', amount: 60 });
  });

  it('derives paid from the green fill for income, investment and fixed', () => {
    expect(byCell(r, 'B4')!.paid).toBe(true);
    expect(byCell(r, 'C4')!.paid).toBe(false);
    expect(byCell(r, 'B8')!.paid).toBe(true);
    expect(byCell(r, 'B11')!.paid).toBe(true);
    // A dark header blue is not "paid".
    expect(byCell(r, 'C11')!.paid).toBe(false);
  });

  it('defaults variable and additional to paid', () => {
    for (const cell of ['B15', 'B16', 'B17', 'B20']) expect(byCell(r, cell)!.paid).toBe(true);
  });

  it('reads comma-decimal text as a number, with a warning', () => {
    expect(byCell(r, 'D4')!.amount).toBe(10.5);
    expect(r.warnings).toContainEqual(expect.objectContaining({ kind: 'text-number', cell: 'D4' }));
  });

  it('takes variable descriptions from the comment text, with tags', () => {
    expect(byCell(r, 'B15')).toMatchObject({ description: 'jantar #amigos', tags: ['amigos'], noteHeader: 'Fulano    (2026-04-14 08:56:59)' });
    expect(byCell(r, 'D15')!.description).toBe('uber');
  });

  it('uses the comment date only when it is in the column month', () => {
    expect(byCell(r, 'D15')!.date).toBe('2026-03-09');
    // Comment from April in the January column: the column decides.
    expect(byCell(r, 'B15')).toMatchObject({ month: 1, date: '2026-01-01' });
    expect(byCell(r, 'B16')!.date).toBe('2026-01-01');
  });

  it('flags variable cells with no comment', () => {
    expect(byCell(r, 'B16')!.description).toBe('(sem descrição)');
    expect(r.warnings).toContainEqual(expect.objectContaining({ kind: 'no-description', cell: 'B16' }));
  });

  it('marks the yellow block as Mercado groceries', () => {
    expect(byCell(r, 'B17')).toMatchObject({ type: 'variable', description: 'Mercado', subgroup: 'FFFFF2CC' });
    // A comment on a yellow cell still wins as description, keeping the subgroup.
    expect(byCell(r, 'C17')).toMatchObject({ description: 'lidl', subgroup: 'FFFFF2CC' });
    expect(r.warnings.find((w) => w.cell === 'B17')).toBeUndefined();
  });

  it('builds deterministic ids and keeps the source cell', () => {
    expect(byCell(r, 'B4')).toMatchObject({ id: 'imp-2026-B4', year: 2026, source: { sheet: 'Listas de itens', cell: 'B4' } });
    expect(new Set(r.transactions.map((t) => t.id)).size).toBe(r.transactions.length);
  });

  it('reads the config block', () => {
    expect(r.settings).toEqual({ eurBrlRate: 6.2, patrimonyBR: 1000, patrimonyEU: 500, goalBRL: 100000, reserveEUR: 3000 });
  });

  it('collects the sheet Total rows per month', () => {
    expect(r.sheetTotals.income).toEqual([3000, 3100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('produces the same transactions when rows move', async () => {
    const shifted = await parseWorkbook(await buildWorkbook({ shift: 3 }), { fileName: FILE });
    const strip = (x: ImportResult) =>
      x.transactions.map(({ id: _id, source: _s, ...rest }) => rest).sort((a, b) => a.amount - b.amount || a.description.localeCompare(b.description));
    expect(strip(shifted)).toEqual(strip(r));
    expect(shifted.sections[0]).toMatchObject({ labelRow: 6, totalRow: 8 });
  });

  it('reads the 2026 rate two rows under REAL', async () => {
    const x = await parseWorkbook(await buildWorkbook({ rateSpacer: true }), { fileName: FILE });
    expect(x.settings.eurBrlRate).toBe(6.2);
  });

  it('warns on stray values outside the month grid but not on config cells', async () => {
    const x = await parseWorkbook(
      await buildWorkbook({ extra: (ws, row) => (ws.getCell(`N${row(4)}`).value = 99) }),
      { fileName: FILE },
    );
    expect(x.warnings).toContainEqual(expect.objectContaining({ kind: 'stray-value', cell: 'N4' }));
    expect(x.warnings.filter((w) => w.kind === 'stray-value').map((w) => w.cell)).toEqual(['N4']);
  });

  it('ignores whitespace-only strings', async () => {
    const x = await parseWorkbook(
      await buildWorkbook({ extra: (ws, row) => (ws.getCell(`E${row(16)}`).value = ' ') }),
      { fileName: FILE },
    );
    expect(x.transactions.find((t) => t.source?.cell === 'E16')).toBeUndefined();
    expect(x.warnings.find((w) => w.cell === 'E16')).toBeUndefined();
  });

  it('skips zero amounts', async () => {
    const x = await parseWorkbook(
      await buildWorkbook({ extra: (ws, row) => (ws.getCell(`E${row(11)}`).value = 0) }),
      { fileName: FILE },
    );
    expect(x.transactions.find((t) => t.source?.cell === 'E11')).toBeUndefined();
  });

  it('warns about missing sections', async () => {
    const x = await parseWorkbook(
      await buildWorkbook({ extra: (ws, row) => (ws.getCell(`A${row(19)}`).value = 'Outros') }),
      { fileName: FILE },
    );
    expect(x.warnings).toContainEqual(expect.objectContaining({ kind: 'missing-section', message: expect.stringContaining('additional') }));
  });

  it('falls back to the first sheet when the name differs', async () => {
    const x = await parseWorkbook(await buildWorkbook({ sheetName: 'Página1' }), { fileName: FILE });
    expect(x.sheetName).toBe('Página1');
    expect(x.transactions.length).toBe(r.transactions.length);
  });

  it('throws when there is no month header', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Listas de itens').getCell('A1').value = 'nada';
    await expect(parseWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(/meses/);
  });

  describe('year', () => {
    it('prefers A1, then the file name, then the option', async () => {
      const a1 = await parseWorkbook(await buildWorkbook({ a1: 2025 }), { fileName: FILE });
      expect([a1.year, a1.yearSource]).toEqual([2025, 'A1']);
      expect([r.year, r.yearSource]).toEqual([2026, 'filename']);
      const opt = await parseWorkbook(await buildWorkbook({ a1: 2025 }), { fileName: FILE, year: 2024 });
      expect([opt.year, opt.yearSource]).toEqual([2024, 'option']);
      expect(opt.transactions[0].id.startsWith('imp-2024-')).toBe(true);
    });

    it('returns null with a warning when it cannot tell', async () => {
      const x = await parseWorkbook(await buildWorkbook(), { fileName: 'export.xlsx' });
      expect([x.year, x.yearSource]).toEqual([null, null]);
      expect(x.warnings).toContainEqual(expect.objectContaining({ kind: 'year' }));
    });

    it('detectYear ignores numbers in A1 that are not years', async () => {
      const ws = await loadSheet(await buildWorkbook({ a1: 42 }));
      expect(detectYear(ws, 'Controle financeiro 2025 (1).xlsx')).toEqual({ year: 2025, source: 'filename' });
      expect(detectYear(ws)).toBeNull();
    });
  });

  it('creates no transaction for a note on an empty cell', async () => {
    const x = await parseWorkbook(
      await buildWorkbook({ extra: (ws, row) => (ws.getCell(`E${row(15)}`).note = googleNote('café')) }),
      { fileName: FILE },
    );
    expect(x.transactions.find((t) => t.source?.cell === 'E15')).toBeUndefined();
  });
});

describe('extractTags', () => {
  it('extracts unique lowercase hashtags, including accents', () => {
    expect(extractTags('Jantar #Amigos #viagem-2026 #amigos #São_João')).toEqual(['amigos', 'viagem-2026', 'são_joão']);
    expect(extractTags('sem tags')).toEqual([]);
  });
});
