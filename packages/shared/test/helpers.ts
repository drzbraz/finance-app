import type { Transaction } from '../src/types.js';

let sequence = 0;

/** A transaction with sensible defaults; override what the test cares about. */
export function tx(overrides: Partial<Transaction> = {}): Transaction {
  sequence++;
  return {
    id: `t${sequence}`,
    year: 2026,
    month: 1,
    description: 'x',
    amount: 10,
    type: 'variable',
    category: '',
    categorySource: 'auto',
    tags: [],
    paid: true,
    ...overrides,
  };
}
