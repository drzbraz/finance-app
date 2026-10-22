import {
  EXPORT_WARNINGS_HEADER,
  type AddRuleResult,
  type Backup,
  type Budget,
  type CategoryRule,
  type Goal,
  type ImportPreview,
  type ImportSummary,
  type RecurringItem,
  type Settings,
  type Transaction,
  type YearStatus,
} from '@finance/shared';
import { encode, request, requestFile } from './http';
import { EVERYTHING, keys, TRANSACTIONS, YEAR_STATUS } from './keys';
import { invalidate } from './store';

/**
 * Everything the screens read from or write to the backend. Writes refresh the cached
 * queries they affect, so the screens update as they did with the local database.
 */

// ---- reads (used by hooks.ts) ----

export const fetchTransactions = (year: number) => request<Transaction[]>('GET', `/transactions?year=${year}`);
export const fetchYears = () => request<number[]>('GET', '/years');
export const getYearStatus = (year: number) => request<YearStatus>('GET', `/years/${year}`);
export const fetchRules = () => request<CategoryRule[]>('GET', '/rules');
export const fetchSettings = () => request<Settings>('GET', '/settings');
export const fetchBudgets = () => request<Budget[]>('GET', '/budgets');
export const fetchGoals = () => request<Goal[]>('GET', '/goals');
export const fetchRecurring = () => request<RecurringItem[]>('GET', '/recurring');

// ---- transactions ----

const transactionsChanged = () => invalidate(TRANSACTIONS, keys.years, YEAR_STATUS);

export async function saveTransaction(tx: Transaction): Promise<void> {
  await request('PUT', `/transactions/${encode(tx.id)}`, tx);
  await transactionsChanged();
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  await request('POST', '/transactions/bulk', { transactions });
  await transactionsChanged();
}

/** Imported rows are soft-deleted on the server (the export clears their cell); new rows are removed. */
export async function deleteTransaction(tx: Transaction): Promise<void> {
  await request('DELETE', `/transactions/${encode(tx.id)}`);
  await transactionsChanged();
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  await request('POST', '/transactions/bulk-delete', { ids });
  await transactionsChanged();
}

/** Puts a transaction back exactly as it was (undo for edits and deletes). */
export async function restoreTransaction(tx: Transaction): Promise<void> {
  await request('POST', `/transactions/${encode(tx.id)}/restore`, tx);
  await transactionsChanged();
}

// ---- settings, rules ----

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await request('PATCH', '/settings', patch);
  await invalidate(keys.settings, YEAR_STATUS);
}

/** Saves the rule and re-categorises automatic entries; returns how many changed. */
export async function addRuleAndApply(rule: CategoryRule): Promise<number> {
  const { updated } = await request<AddRuleResult>('POST', '/rules', rule);
  await invalidate(keys.rules, TRANSACTIONS);
  return updated;
}

export async function deleteRule(id: string): Promise<void> {
  await request('DELETE', `/rules/${encode(id)}`);
  await invalidate(keys.rules);
}

// ---- budgets, goals, bills ----

/** A limit of zero removes the budget. */
export async function saveBudget(budget: Budget): Promise<void> {
  await request('PUT', `/budgets/${encode(budget.category)}`, { monthlyLimit: budget.monthlyLimit });
  await invalidate(keys.budgets);
}

export async function saveBudgets(budgets: Budget[]): Promise<void> {
  await request('POST', '/budgets/bulk', { budgets });
  await invalidate(keys.budgets);
}

export async function deleteBudgets(categories: string[]): Promise<void> {
  await request('POST', '/budgets/bulk-delete', { categories });
  await invalidate(keys.budgets);
}

export async function saveGoal(goal: Goal): Promise<void> {
  await request('PUT', `/goals/${encode(goal.id)}`, goal);
  await invalidate(keys.goals);
}

export async function deleteGoal(id: string): Promise<void> {
  await request('DELETE', `/goals/${encode(id)}`);
  await invalidate(keys.goals);
}

export async function saveRecurring(item: RecurringItem): Promise<void> {
  await request('PUT', `/recurring/${encode(item.key)}`, item);
  await invalidate(keys.recurring);
}

/** Saves an edited line; a rename tombstones the old key and saves the re-labelled `renamed` entries. */
export async function updateRecurring(previous: RecurringItem | null, next: RecurringItem, renamed: Transaction[]): Promise<void> {
  await request('POST', '/recurring/update', { previous, next, renamed });
  await invalidate(keys.recurring, TRANSACTIONS, YEAR_STATUS);
}

/** Removes a line from Contas; past transactions keep their history. */
export async function removeRecurring(item: RecurringItem): Promise<void> {
  await request('DELETE', `/recurring/${encode(item.key)}`);
  await invalidate(keys.recurring);
}

// ---- years and spreadsheets ----

export async function deleteYear(year: number): Promise<void> {
  await request('DELETE', `/years/${year}`);
  await invalidate(EVERYTHING);
}

function upload(file: File): FormData {
  const form = new FormData();
  form.append('file', file, file.name);
  return form;
}

/** Reads a spreadsheet on the server without saving anything; `year` overrides the detected one. */
export function previewSpreadsheet(file: File, year?: number): Promise<ImportPreview> {
  return request<ImportPreview>('POST', `/spreadsheets/preview${year ? `?year=${year}` : ''}`, upload(file));
}

/** Replaces the year's imported entries (manual categories and app-created entries are kept). */
export async function importSpreadsheet(year: number, file: File): Promise<ImportSummary> {
  const summary = await request<ImportSummary>('PUT', `/years/${year}/spreadsheet`, upload(file));
  await invalidate(EVERYTHING);
  return summary;
}

export interface YearExport {
  data: Blob;
  fileName: string;
  warnings: string[];
}

/** The year in its original layout. The server re-points entries to their new cells, so ids change. */
export async function exportYearXlsx(year: number): Promise<YearExport> {
  const response = await requestFile('POST', `/years/${year}/spreadsheet/export`);
  const result = {
    data: await response.blob(),
    fileName: fileNameOf(response) ?? `Controle financeiro ${year}.xlsx`,
    warnings: JSON.parse(decodeURIComponent(response.headers.get(EXPORT_WARNINGS_HEADER) ?? '%5B%5D')) as string[],
  };
  await invalidate(TRANSACTIONS, keys.settings, YEAR_STATUS);
  return result;
}

function fileNameOf(response: Response): string | undefined {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) return decodeURIComponent(utf8[1]);
  return /filename="([^"]+)"/i.exec(disposition)?.[1];
}

// ---- JSON backup ----

export function exportBackup(): Promise<Backup> {
  return request<Backup>('GET', '/backup');
}

/** Replaces all data with the backup's. */
export async function importBackup(backup: Backup): Promise<void> {
  await request('POST', '/backup', backup);
  await invalidate(EVERYTHING);
}
