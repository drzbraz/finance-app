import { writeLedgerOnly, writeWorkbook, type ExportResult } from '../export/writeWorkbook';
import { SHEET_NAME } from '../parser/parseWorkbook';
import { getSettings, rebaseAfterExport, saveSettings } from './repo';
import { db as defaultDb, type FinanceDB } from './schema';

export interface YearExport extends ExportResult {
  fileName: string;
}

/**
 * The one export path the UI uses: writes the year into its stored workbook, makes the
 * result the new baseline (so a later re-import of this file never duplicates entries),
 * and records the export time for the "changes not exported" badge.
 */
export async function exportYearXlsx(year: number, db: FinanceDB = defaultDb): Promise<YearExport> {
  const txs = await db.transactions.where('year').equals(year).toArray();
  const stored = await db.workbooks.get(year);
  const fileName = stored?.fileName ?? `Controle financeiro ${year}.xlsx`;
  if (!stored) return { ...(await writeLedgerOnly(txs)), fileName };

  const out = await writeWorkbook(stored.data, txs);
  await rebaseAfterExport(year, out.data, out.placements, SHEET_NAME, fileName, db);
  const settings = await getSettings(db);
  await saveSettings({ lastExportAt: { ...settings.lastExportAt, [year]: new Date().toISOString() } }, db);
  return { ...out, fileName };
}
