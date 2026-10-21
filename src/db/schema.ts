import Dexie, { type Table } from 'dexie';
import type { CategoryRule, Settings, Transaction } from '../types';

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

  constructor(name = 'finance-app') {
    super(name);
    this.version(1).stores({
      transactions: 'id, year, [year+month], type, category, paid',
      rules: 'id, category',
      settings: 'id',
      workbooks: 'year',
    });
  }
}

export const db = new FinanceDB();
