import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/schema';
import { DEFAULT_SETTINGS, type CategoryRule, type Settings, type Transaction } from './types';

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

export function useYears(): number[] {
  return (
    useLiveQuery(async () => {
      const keys = (await db.transactions.orderBy('year').uniqueKeys()) as number[];
      return keys.filter((y) => y > 0);
    }) ?? []
  );
}

export function useRules(): CategoryRule[] {
  return useLiveQuery(() => db.rules.toArray()) ?? [];
}

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

export function useCategories(rules: CategoryRule[], txs: Transaction[]): string[] {
  return [...new Set([...rules.map((r) => r.category), ...txs.map((t) => t.category)].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );
}
