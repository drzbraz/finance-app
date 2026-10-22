import type { Budget, CategoryRule, Goal, ImportResult, RecurringItem, Settings, Transaction } from './types.js';

/** The contract between the frontend and the backend's /api endpoints. */

/** The originally imported file's metadata (the file itself stays on the server). */
export interface WorkbookInfo {
  year: number;
  fileName: string;
  importedAt: string; // ISO
}

export interface BackupWorkbook extends WorkbookInfo {
  dataBase64: string;
}

/** The full JSON backup ("Backup completo"). Version 1 files predate budgets, goals and bills. */
export interface Backup {
  app: 'finance-app';
  version: 1 | 2;
  exportedAt: string;
  transactions: Transaction[];
  rules: CategoryRule[];
  settings: Settings;
  workbooks: BackupWorkbook[];
  budgets?: Budget[];
  goals?: Goal[];
  recurring?: RecurringItem[];
}

export const BACKUP_APP = 'finance-app';
export const BACKUP_VERSION = 2;

/** What importing a spreadsheet would do, shown before the user confirms. */
export interface ImportPreview {
  result: ImportResult;
  /** The year already has data in the app. */
  existing: boolean;
  /** Entries created in the app for that year, kept by the import. */
  appOnlyCount: number;
}

export interface ImportSummary {
  year: number;
  imported: number;
  warnings: string[];
}

export interface YearStatus {
  year: number;
  exists: boolean;
  appOnlyCount: number;
  /** Changes made in the app since the year's last export (or import). */
  unexportedCount: number;
}

export interface RecurringRename {
  previous: RecurringItem | null;
  next: RecurringItem;
  /** Transactions re-labelled to the new name. */
  renamed: Transaction[];
}

export interface AddRuleResult {
  rule: CategoryRule;
  /** Transactions whose automatic category changed. */
  updated: number;
}

/** Response header carrying the xlsx export's warnings (URI-encoded JSON array). */
export const EXPORT_WARNINGS_HEADER = 'X-Export-Warnings';
