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

/** Why a bank-statement line waits for the user instead of being recorded right away. */
export type StatementDoubt =
  /** An entry with the same amount is already in the app that month (typed by hand or from the sheet). */
  | 'duplicate'
  /** A direct debit whose category already has a fixed bill that month, with another amount. */
  | 'bill'
  /** Money moved to or from another account of mine: savings, an investment, or not an expense at all. */
  | 'own-transfer'
  /** Sent to a person or a company: rent, a Splitwise settle-up, a gift… */
  | 'transfer'
  /** Money in: salary, a refund, a sale, someone paying me back… */
  | 'credit'
  /** No rule or known merchant gave it a category. */
  | 'no-category'
  /** The amount does not add up with the balance printed on the statement. */
  | 'balance';

export interface StatementRow {
  /** The entry it would become; the id is deterministic, so importing the same file twice is detected. */
  transaction: Transaction;
  /** The line as printed on the statement. */
  raw: string;
  direction: 'debit' | 'credit';
  /** Empty = recorded by default; otherwise the user decides. */
  doubts: StatementDoubt[];
  /** The entry already in the app that looks like this one ('duplicate'). */
  match?: Pick<Transaction, 'id' | 'description' | 'date' | 'amount' | 'type'>;
  /** This same line was imported from a statement before. */
  alreadyImported: boolean;
}

/** A bank statement read on the server, shown for review before anything is saved. */
export interface StatementPreview {
  bank: string;
  fileName: string;
  /** Period covered, ISO yyyy-mm-dd. */
  from: string;
  to: string;
  rows: StatementRow[];
}
