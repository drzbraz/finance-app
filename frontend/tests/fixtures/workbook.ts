import ExcelJS from 'exceljs';

export const GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } } as const;
export const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } } as const;
export const DARK_BLUE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5394' } } as const;

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const googleNote = (text: string, date = '2026-04-14 08:56:59', author = 'Fulano') =>
  `======\nID#AAAB\n${author}    (${date})\n${text}`;

export interface FixtureOptions {
  /** Value written to A1 (2025 file has the year there, 2026 leaves it empty). */
  a1?: number;
  /** Blank rows inserted above the sections, to simulate rows moving between years. */
  shift?: number;
  sheetName?: string;
  /** Use the 2026 layout: blank spacer row between REAL and its value. */
  rateSpacer?: boolean;
  /** Called after the standard layout is written, with the row offset applied. */
  extra?: (ws: ExcelJS.Worksheet, row: (n: number) => number) => void;
}

/**
 * A small, synthetic copy of the "Listas de itens" layout (no personal data).
 * Columns B–M are Janeiro–Dezembro; the config block lives in columns O–Q.
 *
 *  2  months header             | O2 EURO  P2 REAL
 *  3  Receitas                  | O3 1     P3 6.2  (P4 when rateSpacer)
 *  4  Salário  (B green, C plain, D '10,50' text)
 *  5  Total (formula)
 *  6  % sobre Receita
 *  7  Investimentos
 *  8  ETF      (B green)
 *  9  Total
 * 10  Despesas Fixas
 * 11  Aluguel  (B green, C dark-blue fill)
 * 12  Mercado  (=SUM, skipped)
 * 13  Total
 * 14  Despesas Variáveis
 * 15  noted cell B (April date, column Jan), D (date in March = column)
 * 16  B no note -> "(sem descrição)"
 * 17  yellow B no note -> "Mercado"; yellow C with note
 * 18  Total
 * 19  Despesas Adicionais
 * 20  Presente B
 * 21  Total
 * 23  Receita (summary block starts)
 * 24  Investimentos (summary line, must not start a section)
 */
export async function buildWorkbook(opts: FixtureOptions = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? 'Listas de itens');
  const off = opts.shift ?? 0;
  const row = (n: number) => (n <= 2 ? n : n + off);
  const set = (addr: string, n: number, value: ExcelJS.CellValue) => {
    ws.getCell(`${addr}${row(n)}`).value = value;
    return ws.getCell(`${addr}${row(n)}`);
  };

  if (opts.a1 !== undefined) ws.getCell('A1').value = opts.a1;
  MONTHS.forEach((m, i) => (ws.getCell(2, i + 2).value = m));

  set('A', 3, 'Receitas');
  set('A', 4, 'Salário');
  set('B', 4, 3000).fill = GREEN;
  set('C', 4, 3100);
  set('D', 4, '10,50');
  set('A', 5, 'Total');
  set('B', 5, { formula: `SUM(B${row(4)})`, result: 3000 });
  set('C', 5, { formula: `SUM(C${row(4)})`, result: 3100 });
  set('A', 6, '% sobre Receita');

  set('A', 7, 'Investimentos');
  set('A', 8, 'ETF');
  set('B', 8, 500).fill = GREEN;
  set('A', 9, 'Total');

  set('A', 10, 'Despesas Fixas');
  set('A', 11, 'Aluguel');
  set('B', 11, 900).fill = GREEN;
  set('C', 11, 900).fill = DARK_BLUE;
  set('A', 12, 'Mercado');
  set('B', 12, { formula: `SUM(B${row(17)}:B${row(17)})`, result: 40 });
  set('A', 13, 'Total');
  set('B', 13, { formula: `SUM(B${row(11)}:B${row(12)})`, result: 940 });
  set('C', 13, { formula: `SUM(C${row(11)}:C${row(12)})`, result: 900 });

  set('A', 14, 'Despesas Variáveis');
  set('B', 15, 25).note = googleNote('jantar #amigos', '2026-04-14 08:56:59');
  set('D', 15, 12).note = googleNote('uber', '2026-03-09 21:10:00');
  set('B', 16, 7);
  const y1 = set('B', 17, 40);
  y1.fill = YELLOW;
  const y2 = set('C', 17, 30);
  y2.fill = YELLOW;
  y2.note = googleNote('lidl', '2026-02-02 10:00:00');
  set('A', 18, 'Total');
  set('B', 18, { formula: `SUM(B${row(15)}:B${row(17)})`, result: 72 });
  set('C', 18, { formula: `SUM(C${row(15)}:C${row(17)})`, result: 30 });

  set('A', 19, 'Despesas Adicionais');
  set('A', 20, 'Presente');
  set('B', 20, 60);
  set('A', 21, 'Total');

  set('A', 23, 'Receita');
  set('A', 24, 'Investimentos');
  set('B', 24, { formula: `B${row(9)}`, result: 500 });

  // Config block, right of the month grid. Header rows are fixed (row 2…12) on purpose:
  // they do not move with `shift` in the real files either.
  ws.getCell('O2').value = 'EURO';
  ws.getCell('P2').value = 'REAL';
  ws.getCell('O3').value = 1;
  ws.getCell(opts.rateSpacer ? 'P4' : 'P3').value = { formula: 'GOOGLEFINANCE("EURBRL")', result: 6.2 };
  ws.getCell('O6').value = 'BRASIL';
  ws.getCell('P6').value = 'EU';
  ws.getCell('Q6').value = 'TOTAL';
  ws.getCell('O7').value = 1000;
  ws.getCell('P7').value = 500;
  ws.getCell('Q7').value = { formula: 'O7+P7*P3', result: 4100 };
  ws.getCell('O9').value = 'META';
  ws.getCell('P9').value = 'ATUAL';
  ws.getCell('O10').value = 100000;
  ws.getCell('O12').value = 'RESERVA';
  ws.getCell('O13').value = 3000;

  opts.extra?.(ws, row);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function loadSheet(data: ArrayBuffer | Blob, name = 'Listas de itens'): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  // A Node Buffer loads in any test environment (jsdom's ArrayBuffer is another realm's).
  const bytes = Buffer.from(data instanceof ArrayBuffer ? data : await (data as Blob).arrayBuffer());
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb.getWorksheet(name)!;
}
