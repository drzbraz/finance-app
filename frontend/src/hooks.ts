import { DEFAULT_SETTINGS, type Budget, type CategoryRule, type Goal, type RecurringItem, type Settings, type Transaction } from '@finance/shared';
import { useEffect, useState } from 'react';
import { keys } from './api/keys';
import {
  fetchBudgets,
  fetchGoals,
  fetchRecurring,
  fetchRules,
  fetchSettings,
  fetchTransactions,
  fetchYears,
  getYearStatus,
} from './api/repo';
import { useQuery } from './api/store';

const NONE: never[] = [];

/** The year's live transactions (the server leaves soft-deleted rows out). */
export function useYearTransactions(year: number): Transaction[] {
  return useYearTransactionsLoading(year) ?? NONE;
}

/** Same as useYearTransactions, but `undefined` while loading (for empty states). */
export function useYearTransactionsLoading(year: number): Transaction[] | undefined {
  return useQuery(keys.transactions(year), () => fetchTransactions(year));
}

/** `undefined` while loading. */
export function useYears(): number[] | undefined {
  return useQuery(keys.years, fetchYears);
}

export function useRules(): CategoryRule[] {
  return useQuery(keys.rules, fetchRules) ?? NONE;
}

export function useSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...useQuery(keys.settings, fetchSettings) };
}

export function useBudgets(): Budget[] {
  return useQuery(keys.budgets, fetchBudgets) ?? NONE;
}

export function useGoals(): Goal[] {
  return useQuery(keys.goals, fetchGoals) ?? NONE;
}

export function useStoredRecurring(): RecurringItem[] {
  return useQuery(keys.recurring, fetchRecurring) ?? NONE;
}

/** Changes made in the app since the year's last xlsx export (or import). */
export function useUnexported(year: number): number {
  return useQuery(keys.yearStatus(year), () => getYearStatus(year))?.unexportedCount ?? 0;
}

export function useCategories(rules: CategoryRule[], txs: Transaction[]): string[] {
  return [...new Set([...rules.map((r) => r.category), ...txs.map((t) => t.category)].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );
}

/** Re-renders every minute so "today"-based views (bills, forecast) stay current. */
export function useToday(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
