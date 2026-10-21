import type { Transaction } from '../src/types';

let seq = 0;

/** A transaction with sensible defaults; override what the test cares about. */
export function tx(over: Partial<Transaction> = {}): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    year: 2026,
    month: 1,
    description: 'x',
    amount: 10,
    type: 'variable',
    category: '',
    categorySource: 'auto',
    tags: [],
    paid: true,
    ...over,
  };
}
