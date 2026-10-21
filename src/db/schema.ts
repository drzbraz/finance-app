import Dexie, { type Table } from 'dexie';
import type { Budget, CategoryRule, Goal, RecurringItem, Settings, Transaction } from '../types';

/** The originally imported file, kept so export can write back into the same layout. */
export interface StoredWorkbook {
  year: number;
  fileName: string;
  importedAt: string; // ISO
  data: ArrayBuffer;
}

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction, string>;
  rules!: Table<CategoryRule, string>;
  settings!: Table<Settings, string>;
  workbooks!: Table<StoredWorkbook, number>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  recurring!: Table<RecurringItem, string>;

  constructor(name = 'finance-app') {
    super(name);
    this.version(1).stores({
      transactions: 'id, year, [year+month], type, category, paid',
      rules: 'id, category',
      settings: 'id',
      workbooks: 'year',
    });
    // v2: budgets, goals, bills. The sheet's single META becomes the "Patrimônio" goal.
    this.version(2)
      .stores({ budgets: 'category', goals: 'id', recurring: 'key' })
      .upgrade(async (tx) => {
        const settings = (await tx.table('settings').get('settings')) as Partial<Settings> | undefined;
        if (settings?.goalBRL) await tx.table('goals').put(patrimonyGoal(settings.goalBRL));
        await tx.table('settings').update('settings', { theme: 'system', lastExportAt: {} });
      });
  }
}

export const PATRIMONY_GOAL_ID = 'goal-patrimonio';

export function patrimonyGoal(target: number): Goal {
  return {
    id: PATRIMONY_GOAL_ID,
    name: 'Patrimônio',
    target,
    currency: 'BRL',
    source: 'patrimony',
    contributions: [],
    createdAt: new Date().toISOString(),
  };
}

export const db = new FinanceDB();
