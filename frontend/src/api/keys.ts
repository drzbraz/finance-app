/** Cache keys of the server data (see store.ts). Prefixes invalidate whole families. */
export const keys = {
  transactions: (year: number) => `transactions:${year}`,
  years: 'years',
  rules: 'rules',
  settings: 'settings',
  budgets: 'budgets',
  goals: 'goals',
  recurring: 'recurring',
} as const;

export const TRANSACTIONS = 'transactions:';
export const EVERYTHING = '';
