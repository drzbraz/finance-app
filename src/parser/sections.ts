import type ExcelJS from 'exceljs';
import type { SectionLayout, TxType } from '../types';
import { cellText } from './cells';
import { normalize } from './normalize';

export const MONTHS_PT = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const SECTION_LABELS: Record<string, TxType> = {
  receitas: 'income',
  investimentos: 'investment',
  'despesas variaveis': 'variable',
  'despesas fixas': 'fixed',
  'despesas adicionais': 'additional',
};

export interface MonthHeader {
  row: number;
  /** column number -> month 1-12 */
  columns: Map<number, number>;
}

/** The first row where at least 10 cells are Portuguese month names. */
export function findMonthHeader(ws: ExcelJS.Worksheet): MonthHeader | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const columns = new Map<number, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const idx = MONTHS_PT.indexOf(normalize(cellText(cell)));
      if (idx >= 0) columns.set(col, idx + 1);
    });
    if (columns.size >= 10) return { row: r, columns };
  }
  return null;
}

export interface Layout {
  sections: SectionLayout[];
  /** Row where the summary block starts ("Receita" singular); parsing stops before it. */
  summaryRow?: number;
}

/**
 * Walks column A top to bottom. A section starts at its label and ends at the next "Total".
 * "% sobre Receita" rows are skipped; the summary block (singular "Receita") ends the scan,
 * so its "Investimentos"/"Despesas ..." lines are not mistaken for sections.
 */
export function detectSections(ws: ExcelJS.Worksheet, startRow: number): Layout {
  const sections: SectionLayout[] = [];
  const seen = new Set<TxType>();
  let current: SectionLayout | null = null;

  for (let r = startRow + 1; r <= ws.rowCount; r++) {
    const label = normalize(cellText(ws.getCell(r, 1)));
    if (!label) continue;
    // Inside a section a "Receita" label is just an item; after a Total it starts the summary.
    if (label === 'receita' && !current && seen.size > 0) return { sections, summaryRow: r };
    const type = SECTION_LABELS[label];
    if (type && !seen.has(type)) {
      if (current) {
        current.lastRow = r - 1;
        sections.push(current);
      }
      seen.add(type);
      current = { type, labelRow: r, firstRow: r + 1, lastRow: r };
      continue;
    }
    if (label === 'total' && current && current.totalRow === undefined) {
      current.totalRow = r;
      current.lastRow = r - 1;
      sections.push(current);
      current = null;
    }
  }
  if (current) {
    current.lastRow = ws.rowCount;
    sections.push(current);
  }
  return { sections };
}
