import { describe, expect, it } from 'vitest';
import { freeToSpend, groceryReserve } from '../src/analytics/free';
import type { RecurringItem } from '../src/types';
import { tx } from './helpers';

const today = new Date(2026, 9, 21); // 21 Oct 2026 → 11 days left including today
const rec = (over: Partial<RecurringItem> & { description: string; type: RecurringItem['type'] }): RecurringItem => ({
  key: `${over.type}|${over.description}`,
  active: true,
  ...over,
});

describe('groceryReserve', () => {
  it('uses the Mercado budget when set', () => {
    expect(groceryReserve([], [{ category: 'Mercado', monthlyLimit: 250 }], 10)).toEqual({ amount: 250, source: 'budget' });
  });
  it('else averages earlier months that had groceries', () => {
    const txs = [
      tx({ month: 8, category: 'Mercado', amount: 100 }),
      tx({ month: 9, category: 'Mercado', amount: 300 }),
      tx({ month: 7, category: 'Lazer', amount: 50 }),
      tx({ month: 10, category: 'Mercado', amount: 999 }), // current month is not history
    ];
    expect(groceryReserve(txs, [], 10)).toEqual({ amount: 200, source: 'average' });
    expect(groceryReserve([], [], 10)).toEqual({ amount: 0, source: 'none' });
  });
});

describe('freeToSpend', () => {
  const base = [
    tx({ month: 10, type: 'income', description: 'Salário', amount: 2000 }),
    tx({ month: 10, type: 'fixed', description: 'Aluguel', amount: 800 }),
    tx({ month: 10, type: 'investment', description: 'Savings', amount: 300 }),
    tx({ month: 10, category: 'Lazer', amount: 150 }),
    tx({ month: 9, category: 'Mercado', amount: 200 }),
  ];

  it('income − fixed − investments − reserved groceries − other spending', () => {
    const f = freeToSpend(base, [], [], 2026, 10, today);
    expect(f).toMatchObject({ income: 2000, fixed: 800, investment: 300, groceries: 200, groceryReserveSource: 'average', otherSpent: 150, free: 550, daysLeft: 11, perDay: 50 });
  });

  it('groceries count as the larger of spent and reserved', () => {
    const f = freeToSpend([...base, tx({ month: 10, category: 'Mercado', amount: 260 })], [], [], 2026, 10, today);
    expect(f.groceries).toBe(260);
    expect(f.free).toBe(490);
  });

  it('includes recurring lines not recorded yet, at their expected amount', () => {
    const recurring = [rec({ type: 'fixed', description: 'Netflix', expectedAmount: 10 }), rec({ type: 'fixed', description: 'Aluguel', expectedAmount: 800 })];
    expect(freeToSpend(base, recurring, [], 2026, 10, today).fixed).toBe(810);
  });

  it('past months use actuals only: no reserve, no per-day', () => {
    const f = freeToSpend(base, [rec({ type: 'fixed', description: 'Netflix', expectedAmount: 10 })], [], 2026, 10, new Date(2026, 10, 5));
    expect(f).toMatchObject({ isCurrent: false, groceries: 0, fixed: 800, free: 750, perDay: null, daysLeft: 0 });
  });

  it('no per-day amount when nothing is free', () => {
    const f = freeToSpend([...base, tx({ month: 10, category: 'Viagem', amount: 1000 })], [], [], 2026, 10, today);
    expect(f.free).toBe(-450);
    expect(f.perDay).toBeNull();
  });
});
