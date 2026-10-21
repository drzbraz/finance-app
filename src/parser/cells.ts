import type ExcelJS from 'exceljs';

/** A cell's value with formulas resolved to their cached result. */
export function cellResult(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      const r = o.result;
      // Cached errors (#DIV/0!) come back as { error: '#DIV/0!' }.
      if (r && typeof r === 'object' && 'error' in (r as object)) return null;
      return r ?? null;
    }
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join('');
    }
    if ('text' in o) return o.text;
    if ('error' in o) return null;
  }
  return v ?? null;
}

export function isFormula(cell: ExcelJS.Cell): boolean {
  const v = cell.value as unknown;
  return !!v && typeof v === 'object' && ('formula' in (v as object) || 'sharedFormula' in (v as object));
}

export function cellText(cell: ExcelJS.Cell): string {
  const r = cellResult(cell);
  return r == null ? '' : String(r);
}

export function cellNumber(cell: ExcelJS.Cell): number | null {
  const r = cellResult(cell);
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  if (typeof r === 'string') return parseLooseNumber(r);
  return null;
}

/** "10,50" -> 10.5, "1.032,00" -> 1032, "1,032.50" -> 1032.5, "€ 30" / "R$ 30" -> 30. Null when not numeric. */
export function parseLooseNumber(raw: string): number | null {
  let s = raw.replace(/R\$|[€\s ]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function fillArgb(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (!fill || fill.type !== 'pattern' || fill.pattern === 'none') return undefined;
  return fill.fgColor?.argb?.toUpperCase();
}

export function colLetter(col: number): string {
  let s = '';
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

export function parseAddress(addr: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) throw new Error(`Bad cell address: ${addr}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}
