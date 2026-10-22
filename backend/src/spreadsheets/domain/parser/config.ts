import { normalize, type ParseWarning, type Settings } from '@finance/shared';
import type ExcelJS from 'exceljs';
import { cellNumber, cellText, colLetter } from './cells.js';

/**
 * Finds the settings block by its header labels (EURO/REAL, BRASIL/EU/TOTAL, META/ATUAL, RESERVA)
 * and reads the value directly below each header. Only columns after the month grid are searched.
 */
export function readConfig(
  ws: ExcelJS.Worksheet,
  firstCol: number,
  warnings: ParseWarning[],
): { settings: Partial<Settings>; cells: Set<string> } {
  const headers = new Map<string, { row: number; col: number }>();
  ws.eachRow((row, r) => {
    row.eachCell((cell, c) => {
      if (c < firstCol) return;
      const t = normalize(cellText(cell));
      if (['euro', 'real', 'brasil', 'eu', 'total', 'meta', 'atual', 'progresso', 'reserva'].includes(t) && !headers.has(t)) {
        headers.set(t, { row: r, col: c });
      }
    });
  });

  const cells = new Set<string>();
  const below = (key: string): number | undefined => {
    const h = headers.get(key);
    if (!h) return undefined;
    for (const [r, c] of [[h.row, h.col], [h.row + 1, h.col], [h.row + 2, h.col]] as const) cells.add(colLetter(c) + r);
    // The value sits one or two rows below its header (2026 has a blank spacer row).
    for (const r of [h.row + 1, h.row + 2]) {
      if ([...headers.values()].some((o) => o.row === r)) break;
      const n = cellNumber(ws.getCell(r, h.col));
      if (n !== null) return n;
    }
    return undefined;
  };

  const settings: Partial<Settings> = {};
  const rate = below('real');
  if (rate !== undefined) settings.eurBrlRate = rate;
  else warnings.push({ kind: 'config', message: 'Taxa EURO/REAL não encontrada.' });
  below('euro');
  // BRASIL is often left blank: an empty cell under a found header means 0.
  if (headers.has('brasil')) settings.patrimonyBR = below('brasil') ?? 0;
  else warnings.push({ kind: 'config', message: 'Patrimônio BRASIL não encontrado.' });
  if (headers.has('eu')) settings.patrimonyEU = below('eu') ?? 0;
  else warnings.push({ kind: 'config', message: 'Patrimônio EU não encontrado.' });
  below('total');
  const goal = below('meta');
  if (goal !== undefined) settings.goalBRL = goal;
  below('atual');
  below('progresso');
  const reserve = below('reserva');
  if (reserve !== undefined) settings.reserveEUR = reserve;
  return { settings, cells };
}
