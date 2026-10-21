import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeRecurring, recurringKey, renameRecurringTxs } from '../src/analytics/bills';
import { removeRecurring, updateRecurring } from '../src/db/repo';
import { FinanceDB } from '../src/db/schema';
import type { RecurringItem } from '../src/types';
import { tx } from './helpers';

const item = (over: Partial<RecurringItem> = {}): RecurringItem => ({
  key: recurringKey('fixed', 'VODA'),
  type: 'fixed',
  description: 'VODA',
  active: true,
  expectedAmount: 15,
  ...over,
});

describe('mergeRecurring with removed items', () => {
  it('hides a removed line even though the data still has it', () => {
    const txs = [tx({ type: 'fixed', description: 'VODA', month: 3 })];
    expect(mergeRecurring(txs, [], 3).map((r) => r.key)).toEqual(['fixed|VODA']);
    expect(mergeRecurring(txs, [item({ removed: true })], 3)).toEqual([]);
  });

  it('keeps stored-only lines (added in Contas) and drops removed ones', () => {
    const added = item({ key: 'fixed|Netflix', description: 'Netflix', expectedAmount: 10 });
    const gone = item({ key: 'fixed|Spotify', description: 'Spotify', removed: true });
    expect(mergeRecurring([], [added, gone], 1).map((r) => r.description)).toEqual(['Netflix']);
  });
});

describe('renameRecurringTxs', () => {
  it('renames every transaction of the line, and only that line', () => {
    const txs = [
      tx({ id: 'a', type: 'fixed', description: 'VODA', month: 1 }),
      tx({ id: 'b', type: 'fixed', description: 'VODA', month: 2 }),
      tx({ id: 'c', type: 'fixed', description: 'MEO', month: 1 }),
      tx({ id: 'd', type: 'variable', description: 'VODA', month: 1 }),
    ];
    const out = renameRecurringTxs(txs, item(), { type: 'fixed', description: 'Vodafone' });
    expect(out.map((t) => t.id)).toEqual(['a', 'b']);
    expect(out.every((t) => t.description === 'Vodafone')).toBe(true);
  });
});

describe('updateRecurring / removeRecurring', () => {
  let db: FinanceDB;
  beforeEach(() => {
    db = new FinanceDB('test-' + Math.random());
  });
  afterEach(async () => {
    await db.delete();
  });

  it('a rename tombstones the old key, saves the new one and the renamed rows', async () => {
    const old = item();
    const rows = [tx({ id: 'a', type: 'fixed', description: 'VODA' })];
    await db.transactions.bulkPut(rows);
    const next = item({ key: 'fixed|Vodafone', description: 'Vodafone', expectedAmount: 20 });
    await updateRecurring(old, next, renameRecurringTxs(rows, old, next), db);

    expect((await db.recurring.get('fixed|VODA'))?.removed).toBe(true);
    expect(await db.recurring.get('fixed|Vodafone')).toMatchObject({ expectedAmount: 20, removed: false });
    const a = await db.transactions.get('a');
    expect(a?.description).toBe('Vodafone');
    expect(a?.updatedAt).toBeTruthy();
    const txs = await db.transactions.toArray();
    expect(mergeRecurring(txs, await db.recurring.toArray(), 1).map((r) => r.description)).toEqual(['Vodafone']);
  });

  it('an edit without rename just updates the line', async () => {
    await updateRecurring(item(), item({ dueDay: 10 }), [], db);
    expect(await db.recurring.toArray()).toHaveLength(1);
    expect((await db.recurring.get('fixed|VODA'))?.dueDay).toBe(10);
  });

  it('removeRecurring hides the line but keeps the transactions', async () => {
    await db.transactions.put(tx({ id: 'a', type: 'fixed', description: 'VODA' }));
    await removeRecurring(item(), db);
    expect((await db.recurring.get('fixed|VODA'))).toMatchObject({ removed: true, active: false });
    expect(await db.transactions.get('a')).toBeTruthy();
  });
});
