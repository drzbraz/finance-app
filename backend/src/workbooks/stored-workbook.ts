import type { WorkbookInfo } from '@finance/shared';

/** A year's spreadsheet file, kept so the export can write back into the same layout. */
export interface StoredWorkbook extends WorkbookInfo {
  data: Buffer;
}
