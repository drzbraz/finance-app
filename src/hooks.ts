import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { unexportedCount } from './db/repo';
import { db } from './db/schema';
import { DEFAULT_SETTINGS, type Budget, type CategoryRule, type Goal, type RecurringItem, type Settings, type Transaction } from './types';

/**
 * The year's live transactions. Soft-deleted rows (kept only so export can clear their
 * cell) are filtered out here, so analytics and views never see them.
 */
export function useYearTransactions(year: number): Transaction[] {
  return (
    useLiveQuery(
      () => db.transactions.where('year').equals(year).filter((t) => !t.deleted).toArray(),
      [year],
    ) ?? []
  );
}

/** Same as useYearTransactions, but `undefined` while loading (for empty states). */
export function useYearTransactionsLoading(year: number): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.where('year').equals(year).filter((t) => !t.deleted).toArray(), [year]);
}

export function useYears(): number[] | undefined {
  return useLiveQuery(async () => {
    const keys = (await db.transactions.orderBy('year').uniqueKeys()) as number[];
    return keys.filter((y) => y > 0);
  });
}

export function useRules(): CategoryRule[] {
  return useLiveQuery(() => db.rules.toArray()) ?? [];
}

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.settings.get('settings'));
  return { ...DEFAULT_SETTINGS, ...row };
}

export function useBudgets(): Budget[] {
  return useLiveQuery(() => db.budgets.toArray()) ?? [];
}

export function useGoals(): Goal[] {
  return useLiveQuery(() => db.goals.toArray()) ?? [];
}

export function useStoredRecurring(): RecurringItem[] {
  return useLiveQuery(() => db.recurring.toArray()) ?? [];
}

export function useUnexported(year: number): number {
  return useLiveQuery(() => unexportedCount(year), [year]) ?? 0;
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
