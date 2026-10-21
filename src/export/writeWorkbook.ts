import ExcelJS from 'exceljs';
import { cellText, colLetter, fillArgb, isFormula, parseAddress } from '../parser/cells';
import { isLightYellow, isPaidGreen, PAID_GREEN } from '../parser/color';
import { formatComment, noteToString, readCommentsFromZip } from '../parser/comments';
import { SHEET_NAME } from '../parser/parseWorkbook';
import { detectSections, findMonthHeader } from '../parser/sections';
import { TYPE_LABELS, type SectionLayout, type Transaction, type TxType } from '../types';
import { shiftFormulaRows } from './formulaShift';

export const LEDGER_SHEET = 'Lançamentos';

const PAID_BY_FILL: TxType[] = ['income', 'investment', 'fixed'];

export interface ExportResult {
  data: ArrayBuffer;
  warnings: string[];
  /**
   * Final cell (in the exported file) of every transaction written to the main sheet.
   * After saving, the exported file becomes the new baseline and each transaction is
   * re-pointed to its cell here (see rebaseAfterExport), so re-importing never duplicates.
   */
  placements: Record<string, string>;
}

const NO_LABEL = '(sem nome)';

/** Column A label as the parser reads it: an empty label is described as "(sem nome)". */
function rowLabel(ws: ExcelJS.Worksheet, row: number): string {
  return cellText(ws.getCell(row, 1)).trim() || NO_LABEL;
}

/**
 * Writes the year's transactions back into the originally imported workbook:
 * values, notes and green fills go to each transaction's source cell, new
 * transactions get a free cell (or an inserted row), and a "Lançamentos" sheet
 * lists every transaction. Formula cells are never overwritten.
 */
export async function writeWorkbook(original: ArrayBuffer, txsIn: Transaction[]): Promise<ExportResult> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(original);
  const ws = wb.worksheets.find((w) => w.name === SHEET_NAME) ?? wb.worksheets[0];
  const header = findMonthHeader(ws);
  if (!header) throw new Error('Linha de meses não encontrada no arquivo original.');
  const monthCol = new Map([...header.columns].map(([col, m]) => [m, col]));

  await restoreNotes(ws, original);
  unshareFormulas(ws);

  const sections = detectSections(ws, header.row).sections;
  // Zero-amount entries (e.g. a fresh "+ Novo") are listed in Lançamentos only: the parser skips zeros.
  const txs = txsIn.filter((t) => !t.deleted);
  const positions = new Map<string, { row: number; col: number }>();

  // 1. Deleted imported rows: clear their cell.
  for (const t of txsIn.filter((t) => t.deleted && t.source?.sheet === ws.name)) clearCell(ws.getCell(t.source!.cell));

  // 2. Existing transactions back into their source cell, unless their month or type was
  //    edited: then the old cell is cleared and they are placed like new ones.
  const fresh: Transaction[] = [];
  const occupied = new Set<string>();
  for (const t of txs) {
    if (!t.source || t.source.sheet !== ws.name) {
      fresh.push(t);
      continue;
    }
    const { col, row } = parseAddress(t.source.cell);
    const section = sections.find((s) => row >= s.firstRow && row <= s.lastRow);
    const cell = ws.getCell(t.source.cell);
    if (isFormula(cell)) {
      warnings.push(`${t.source.cell} é uma fórmula; "${t.description}" não foi escrito.`);
      continue;
    }
    const relabeled = t.type !== 'variable' && rowLabel(ws, row) !== t.description;
    if (t.amount === 0 || header.columns.get(col) !== t.month || section?.type !== t.type || relabeled || occupied.has(t.source.cell)) {
      if (!occupied.has(t.source.cell)) clearCell(cell);
      fresh.push(t);
      continue;
    }
    occupied.add(t.source.cell);
    writeTx(cell, t);
    positions.set(t.id, { row, col });
  }

  // 3. New transactions. One at a time, because an inserted row shifts everything below it.
  for (const t of fresh) {
    if (t.amount === 0) continue;
    const col = monthCol.get(t.month);
    const section = sections.find((s) => s.type === t.type);
    if (!col || !section) {
      warnings.push(`Sem lugar para "${t.description}" (${t.type}); só aparece em ${LEDGER_SHEET}.`);
      continue;
    }
    const row = t.type === 'variable' ? freeVariableRow(ws, section, col, t) : freeLabeledRow(ws, section, col, t);
    let target = row;
    if (target === null) {
      target = insertRowFor(ws, sections, section, t);
      for (const p of positions.values()) if (p.row >= target) p.row++;
    }
    if (t.type !== 'variable' && !ws.getCell(target, 1).value && t.description !== NO_LABEL) {
      ws.getCell(target, 1).value = t.description;
    }
    const cell = ws.getCell(target, col);
    copyStyleFromAbove(ws, target, col);
    writeTx(cell, t);
    positions.set(t.id, { row: target, col });
  }

  addLedgerSheet(wb, ledgerOrder(txs));
  const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const placements: Record<string, string> = {};
  for (const [id, p] of positions) placements[id] = colLetter(p.col) + p.row;
  return { data, warnings, placements };
}

/** Fallback when no original file is stored for the year (data entered only in the app). */
export async function writeLedgerOnly(txs: Transaction[]): Promise<ExportResult> {
  const wb = new ExcelJS.Workbook();
  addLedgerSheet(wb, ledgerOrder(txs.filter((t) => !t.deleted)));
  return {
    data: (await wb.xlsx.writeBuffer()) as ArrayBuffer,
    warnings: ['Nenhuma planilha original importada para este ano: exportado só a aba Lançamentos.'],
    placements: {},
  };
}

function ledgerOrder(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => a.month - b.month || (a.date ?? '').localeCompare(b.date ?? '') || a.type.localeCompare(b.type));
}

function writeTx(cell: ExcelJS.Cell, t: Transaction): void {
  cell.value = t.amount;
  if (t.type === 'variable') {
    const isPlainGrocery = !t.noteHeader && t.description === 'Mercado' && t.subgroup && isLightYellow(t.subgroup);
    if (!isPlainGrocery && t.description !== '(sem descrição)') {
      cell.note = formatComment(t.description, t.noteHeader);
    } else {
      cell.note = undefined as unknown as string;
    }
    if (t.subgroup && !fillArgb(cell)) setFill(cell, t.subgroup);
  }
  if (PAID_BY_FILL.includes(t.type)) {
    if (t.paid) setFill(cell, PAID_GREEN);
    else if (isPaidGreen(fillArgb(cell))) clearFill(cell);
  }
}

function clearCell(cell: ExcelJS.Cell): void {
  if (isFormula(cell)) return;
  cell.value = null;
  cell.note = undefined as unknown as string;
  if (isPaidGreen(fillArgb(cell))) clearFill(cell);
}

// Cells loaded from one style share a style object in ExcelJS; assigning a fresh style
// keeps a fill change from leaking into every cell with the same original format.
function setFill(cell: ExcelJS.Cell, argb: string): void {
  cell.style = { ...cell.style, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb }, bgColor: { argb } } };
}

function clearFill(cell: ExcelJS.Cell): void {
  cell.style = { ...cell.style, fill: { type: 'pattern', pattern: 'none' } };
}

/** Rows of the variable section that carry the yellow grocery fill in any month column. */
function yellowRows(ws: ExcelJS.Worksheet, s: SectionLayout): number[] {
  const rows: number[] = [];
  for (let r = s.firstRow; r <= s.lastRow; r++) {
    let yellow = false;
    ws.getRow(r).eachCell((c) => {
      if (isLightYellow(fillArgb(c))) yellow = true;
    });
    if (yellow) rows.push(r);
  }
  return rows;
}

function isEmpty(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function freeVariableRow(ws: ExcelJS.Worksheet, s: SectionLayout, col: number, t: Transaction): number | null {
  const yellow = new Set(yellowRows(ws, s));
  const wantYellow = !!t.subgroup && isLightYellow(t.subgroup);
  for (let r = s.firstRow; r <= s.lastRow; r++) {
    if (yellow.has(r) !== wantYellow) continue;
    const cell = ws.getCell(r, col);
    if (isEmpty(cell) && !isFormula(cell) && !noteToString(cell.note)) return r;
  }
  return null;
}

function freeLabeledRow(ws: ExcelJS.Worksheet, s: SectionLayout, col: number, t: Transaction): number | null {
  for (let r = s.firstRow; r <= s.lastRow; r++) {
    const label = rowLabel(ws, r);
    if (label === t.description && isEmpty(ws.getCell(r, col)) && !isFormula(ws.getCell(r, col))) return r;
  }
  return null;
}

/**
 * Inserts a row for `t` and shifts every formula below. Variable expenses go above the yellow
 * block (groceries at its end); labeled rows and full sections go right before the Total row.
 */
function insertRowFor(ws: ExcelJS.Worksheet, sections: SectionLayout[], s: SectionLayout, t: Transaction): number {
  const yellow = s.type === 'variable' ? yellowRows(ws, s) : [];
  const wantYellow = !!t.subgroup && isLightYellow(t.subgroup);
  let at: number;
  if (s.type === 'variable' && yellow.length && !wantYellow) at = yellow[0];
  else at = s.lastRow + 1; // the Total row (or the row after the section)
  const extendEndingAt = at - 1;

  // spliceRows moves values and styles but drops notes: carry them over by hand.
  const movedNotes: { row: number; col: number; note: string }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < at) return;
    row.eachCell((cell, c) => {
      const note = noteToString(cell.note);
      if (note) {
        movedNotes.push({ row: r, col: c, note });
        cell.note = undefined as unknown as string;
      }
    });
  });

  // Stretch ranges only in section rows (Totals, the Mercado SUM), never elsewhere.
  const inSection = (originalRow: number) =>
    sections.some((sec) => originalRow >= sec.firstRow && originalRow <= (sec.totalRow ?? sec.lastRow));

  ws.spliceRows(at, 0, []);
  for (const n of movedNotes) ws.getCell(n.row + 1, n.col).note = n.note;
  ws.eachRow({ includeEmpty: false }, (row, r) =>
    row.eachCell((cell) => {
      if (!isFormula(cell)) return;
      const v = cell.value as ExcelJS.CellFormulaValue;
      const originalRow = r > at ? r - 1 : r;
      const extend = inSection(originalRow) ? extendEndingAt : undefined;
      cell.value = { formula: shiftFormulaRows(v.formula, at, 1, extend), result: v.result } as ExcelJS.CellFormulaValue;
    }),
  );
  shiftConditionalFormatting(ws, at);

  for (const sec of sections) {
    if (sec.firstRow >= at) sec.firstRow++;
    if (sec.lastRow >= at - 1 && sec === s) sec.lastRow++;
    else if (sec.lastRow >= at) sec.lastRow++;
    if (sec.totalRow && sec.totalRow >= at) sec.totalRow++;
    if (sec.labelRow >= at) sec.labelRow++;
  }
  return at;
}

function shiftConditionalFormatting(ws: ExcelJS.Worksheet, at: number): void {
  const cfs = (ws as unknown as { conditionalFormattings?: { ref: string }[] }).conditionalFormattings;
  for (const cf of cfs ?? []) {
    cf.ref = cf.ref
      .split(' ')
      .map((r) => shiftFormulaRows(r, at))
      .join(' ');
  }
}

function copyStyleFromAbove(ws: ExcelJS.Worksheet, row: number, col: number): void {
  const cell = ws.getCell(row, col);
  if (cell.numFmt || row <= 1) return;
  const above = ws.getCell(row - 1, col).style;
  cell.style = { ...cell.style, numFmt: above.numFmt, font: above.font && { ...above.font }, alignment: above.alignment && { ...above.alignment } };
}

/**
 * ExcelJS reads Google's comments with empty text (it expects rich-text runs) and would
 * write them back empty. Re-set every note from the raw XML before saving.
 */
async function restoreNotes(ws: ExcelJS.Worksheet, original: ArrayBuffer): Promise<void> {
  const raw = await readCommentsFromZip(original, ws.name);
  for (const [ref, text] of raw) {
    const cell = ws.getCell(ref);
    if (!noteToString(cell.note)) cell.note = text;
  }
}

/** Shared formulas point at a master cell by address; make each one standalone before rows move. */
function unshareFormulas(ws: ExcelJS.Worksheet): void {
  ws.eachRow({ includeEmpty: false }, (row) =>
    row.eachCell((cell) => {
      if (!isFormula(cell)) return;
      const v = cell.value as { result?: unknown };
      const formula = cell.formula;
      if (formula) cell.value = { formula, result: v.result } as ExcelJS.CellFormulaValue;
    }),
  );
}

function addLedgerSheet(wb: ExcelJS.Workbook, txs: Transaction[]): void {
  const existing = wb.getWorksheet(LEDGER_SHEET);
  if (existing) wb.removeWorksheet(existing.id);
  const sheet = wb.addWorksheet(LEDGER_SHEET);
  sheet.columns = [
    { header: 'Data', key: 'date', width: 12 },
    { header: 'Descrição', key: 'description', width: 36 },
    { header: 'Valor', key: 'amount', width: 12, style: { numFmt: '#,##0.00 €' } },
    { header: 'Tipo', key: 'type', width: 20 },
    { header: 'Categoria', key: 'category', width: 16 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Pago', key: 'paid', width: 8 },
    { header: 'Célula', key: 'cell', width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const t of txs) {
    sheet.addRow({
      date: t.date ? new Date(`${t.date}T00:00:00Z`) : null,
      description: t.description,
      amount: t.amount,
      type: TYPE_LABELS[t.type],
      category: t.category,
      tags: t.tags.map((x) => `#${x}`).join(' '),
      paid: t.paid ? 'Sim' : 'Não',
      cell: t.source?.cell ?? '',
    });
  }
  sheet.getColumn('date').numFmt = 'yyyy-mm-dd';
}
