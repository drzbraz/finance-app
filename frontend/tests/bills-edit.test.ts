import { describe, expect, it } from 'vitest';
import { mergeRecurring, recurringKey, renameRecurringTxs } from '../src/analytics/bills';
import type { RecurringItem } from '@finance/shared';
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

import { startedMonthTxs, startMonthTxs } from '../src/analytics/bills';

describe('Iniciar mês / desfazer', () => {
  const recurring = [
    item(),
    item({ key: 'fixed|Aluguel', description: 'Aluguel', expectedAmount: 380 }),
  ];

  it('marks what it creates and undo finds exactly those, while pending', () => {
    const created = startMonthTxs([], recurring, 2026, 11);
    expect(created).toHaveLength(2);
    expect(created.every((t) => t.origin === 'start-month' && !t.paid)).toBe(true);
    expect(startedMonthTxs(created, recurring, 2026, 11).map((t) => t.description).sort()).toEqual(['Aluguel', 'VODA']);
  });

  it('keeps paid ones, other months, sheet rows and manual entries', () => {
    const [voda, aluguel] = startMonthTxs([], recurring, 2026, 11);
    const txs = [
      { ...voda, paid: true },
      aluguel,
      tx({ id: 'sheet', type: 'fixed', description: 'VODA', amount: 15, month: 11, paid: false, source: { sheet: 's', cell: 'L57' } }),
      tx({ id: 'manual', type: 'fixed', description: 'VODA', amount: 99, month: 11, paid: false }),
      { ...aluguel, id: 'oct', month: 10 },
    ];
    expect(startedMonthTxs(txs, recurring, 2026, 11).map((t) => t.id)).toEqual([aluguel.id]);
  });

  it('recognises legacy entries created before the origin flag', () => {
    const legacy = tx({ id: 'old', type: 'fixed', description: 'Aluguel', amount: 380, month: 11, paid: false });
    expect(startedMonthTxs([legacy], recurring, 2026, 11).map((t) => t.id)).toEqual(['old']);
  });
});
