import ExcelJS from 'exceljs';
import type { ImportResult, ParseWarning, SectionLayout, Transaction, TxType } from '../types';
import { cellNumber, cellResult, cellText, colLetter, fillArgb, isFormula } from './cells';
import { isLightYellow, isNeutral, isPaidGreen } from './color';
import { noteToString, parseComment, readCommentsFromZip } from './comments';
import { readConfig } from './config';
import { detectSections, findMonthHeader } from './sections';

export const SHEET_NAME = 'Listas de itens';

export interface ParseOptions {
  fileName?: string;
  /** Overrides the year detected from A1 / the file name. */
  year?: number;
}

/** Sections whose paid status comes from the green fill; the rest default to paid. */
const PAID_BY_FILL: TxType[] = ['income', 'investment', 'fixed'];

export function detectYear(ws: ExcelJS.Worksheet, fileName?: string): { year: number; source: 'A1' | 'filename' } | null {
  const a1 = cellResult(ws.getCell('A1'));
  if (typeof a1 === 'number' && a1 >= 2000 && a1 <= 2100) return { year: a1, source: 'A1' };
  const m = fileName ? /(20\d{2})/.exec(fileName) : null;
  return m ? { year: Number(m[1]), source: 'filename' } : null;
}

export async function parseWorkbook(data: ArrayBuffer, opts: ParseOptions = {}): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws =
    wb.worksheets.find((w) => w.name.trim().toLowerCase() === SHEET_NAME.toLowerCase()) ?? wb.worksheets[0];
  if (!ws) throw new Error('A planilha não tem abas.');

  const warnings: ParseWarning[] = [];
  const header = findMonthHeader(ws);
  if (!header) throw new Error('Linha de meses (Janeiro … Dezembro) não encontrada.');

  const detected = opts.year ? { year: opts.year, source: 'option' as const } : detectYear(ws, opts.fileName);
  const year = detected?.year ?? null;
  if (year === null) warnings.push({ kind: 'year', message: 'Ano não encontrado em A1 nem no nome do arquivo.' });

  const { sections } = detectSections(ws, header.row);
  for (const t of ['income', 'investment', 'variable', 'fixed', 'additional'] as TxType[]) {
    if (!sections.some((s) => s.type === t)) {
      warnings.push({ kind: 'missing-section', message: `Seção não encontrada: ${t}` });
    }
  }

  const notes = await collectNotes(ws, data);
  const monthCols = [...header.columns.keys()];
  const lastMonthCol = Math.max(...monthCols);
  const { settings, cells: configCells } = readConfig(ws, lastMonthCol + 1, warnings);

  const transactions: Transaction[] = [];
  const y = year ?? 0;

  for (const section of sections) {
    for (let r = section.firstRow; r <= section.lastRow; r++) {
      const row = ws.getRow(r);
      const label = cellText(ws.getCell(r, 1)).trim();
      if (/^% sobre/i.test(label)) continue;

      row.eachCell((cell, col) => {
        const addr = colLetter(col) + r;
        if (isFormula(cell)) return;
        const month = header.columns.get(col);
        if (month === undefined) {
          if (col > 1 && !configCells.has(addr) && cellText(cell).trim() !== '') {
            warnings.push({ kind: 'stray-value', cell: addr, message: `Valor fora da grade de meses ignorado: ${cellText(cell)}` });
          }
          return;
        }
        const raw = cellResult(cell);
        if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return;
        const amount = cellNumber(cell);
        if (amount === null) {
          warnings.push({ kind: 'stray-value', cell: addr, message: `Valor não numérico ignorado: "${String(raw)}"` });
          return;
        }
        if (typeof raw === 'string') {
          warnings.push({ kind: 'text-number', cell: addr, message: `Número salvo como texto "${raw}" lido como ${amount}` });
        }
        if (amount === 0) return;

        const fill = fillArgb(cell);
        const green = isPaidGreen(fill);
        const subgroup = fill && !green && !isNeutral(fill) ? fill : undefined;
        const note = notes.get(addr);
        const comment = note ? parseComment(note) : undefined;

        let description: string;
        if (section.type === 'variable') {
          if (comment?.text) description = comment.text;
          else if (subgroup && isLightYellow(subgroup)) description = 'Mercado';
          else {
            description = '(sem descrição)';
            warnings.push({ kind: 'no-description', cell: addr, message: 'Despesa variável sem comentário.' });
          }
        } else {
          description = label;
          if (!description) {
            description = '(sem nome)';
            warnings.push({ kind: 'no-description', cell: addr, message: 'Valor numa linha sem rótulo na coluna A.' });
          }
        }

        const mm = String(month).padStart(2, '0');
        const commentInMonth = comment?.date?.startsWith(`${y}-${mm}`);

        transactions.push({
          id: `imp-${y}-${addr}`,
          year: y,
          month,
          date: commentInMonth ? comment!.date : `${y}-${mm}-01`,
          description,
          amount,
          type: section.type,
          category: '',
          categorySource: 'auto',
          tags: extractTags(description),
          paid: PAID_BY_FILL.includes(section.type) ? green : true,
          subgroup,
          source: { sheet: ws.name, cell: addr },
          noteHeader: comment?.header,
        });
      });
    }
  }

  return {
    year,
    yearSource: detected?.source ?? null,
    sheetName: ws.name,
    transactions,
    settings,
    warnings,
    sections,
    sheetTotals: readSheetTotals(ws, sections, header.columns),
  };
}

export function extractTags(text: string): string[] {
  return [...new Set([...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase()))];
}

async function collectNotes(ws: ExcelJS.Worksheet, data: ArrayBuffer): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      const s = noteToString(cell.note);
      if (s) notes.set(cell.address, s);
    }),
  );
  if (notes.size > 0) return notes;
  // ExcelJS found nothing: read the comments XML directly.
  return readCommentsFromZip(data, ws.name);
}

function readSheetTotals(
  ws: ExcelJS.Worksheet,
  sections: SectionLayout[],
  columns: Map<number, number>,
): ImportResult['sheetTotals'] {
  const out: ImportResult['sheetTotals'] = {};
  for (const s of sections) {
    if (!s.totalRow) continue;
    const arr = new Array<number>(12).fill(0);
    for (const [col, month] of columns) arr[month - 1] = cellNumber(ws.getCell(s.totalRow, col)) ?? 0;
    out[s.type] = arr;
  }
  return out;
}
