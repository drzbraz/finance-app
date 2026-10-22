import { totalsByType } from '../src/analytics/aggregate';
import { billsForMonth, daysInMonth, mergeRecurring, startMonthTxs, upcomingBills } from '../src/analytics/bills';
import { budgetState, budgetStatus, suggestBudgets } from '../src/analytics/budgets';
import { goalStatus } from '../src/analytics/goals';
import { forecastMonth, insights } from '../src/analytics/insights';
import { yearOverYear } from '../src/analytics/yoy';
import { DEFAULT_SETTINGS, type Goal, type RecurringItem } from '@finance/shared';
import { tx } from './helpers';

const day = (iso: string) => new Date(`${iso}T12:00:00`);
const rec = (over: Partial<RecurringItem> & { description: string }): RecurringItem => ({
  key: `${over.type ?? 'fixed'}|${over.description}`,
  type: 'fixed',
  active: true,
  ...over,
});

describe('budgets', () => {
  it('classifies ok / warning (≥ 80%) / over (> 100%)', () => {
    expect([0, 0.79, 0.8, 1, 1.01].map(budgetState)).toEqual(['ok', 'ok', 'warning', 'warning', 'over']);
  });

  it('computes spend per budgeted category for the month, most used first', () => {
    const txs = [
      tx({ month: 3, category: 'Lazer', amount: 90 }),
      tx({ month: 3, category: 'Lazer', amount: 30 }),
      tx({ month: 3, category: '', amount: 10 }),
      tx({ month: 2, category: 'Casa', amount: 999 }),
      tx({ month: 3, type: 'income', category: 'Casa', amount: 999 }),
    ];
    const s = budgetStatus(txs, [{ category: 'Casa', monthlyLimit: 100 }, { category: 'Lazer', monthlyLimit: 100 }, { category: 'Outros', monthlyLimit: 50 }, { category: 'X', monthlyLimit: 0 }], 3);
    expect(s.map((b) => [b.category, b.spent, b.state])).toEqual([
      ['Lazer', 120, 'over'],
      ['Outros', 10, 'ok'],
      ['Casa', 0, 'ok'],
    ]);
    expect(s[0].remaining).toBe(-20);
  });

  it('suggests the average of earlier months with expenses, rounded up to €10', () => {
    const txs = [
      tx({ month: 1, category: 'Lazer', amount: 41 }),
      tx({ month: 3, category: 'Lazer', amount: 60 }),
      tx({ month: 3, category: 'Casa', amount: 0.5 }),
      tx({ month: 5, category: 'Lazer', amount: 9999 }), // the month itself and later are ignored
      tx({ month: 1, type: 'income', category: 'Receita', amount: 3000 }),
    ];
    // Months with expenses before May: 1 and 3 (2 and 4 are empty and do not count).
    expect(suggestBudgets(txs, 5)).toEqual([
      { category: 'Lazer', monthlyLimit: 60 }, // (41 + 60) / 2 = 50.5 → 60
      { category: 'Casa', monthlyLimit: 10 },
    ]);
    // No earlier month: use all months.
    expect(suggestBudgets([tx({ month: 4, category: 'Lazer', amount: 25 })], 1)).toEqual([{ category: 'Lazer', monthlyLimit: 30 }]);
    expect(suggestBudgets([], 6)).toEqual([]);
  });
});

describe('bills', () => {
  const txs = [
    tx({ type: 'fixed', description: 'Aluguel', month: 1, amount: 900, paid: true }),
    tx({ type: 'fixed', description: 'Aluguel', month: 2, amount: 900, paid: false }),
    tx({ type: 'fixed', description: 'MEO', month: 1, amount: 40, paid: true }),
    tx({ type: 'income', description: 'Salário', month: 2, amount: 3000, paid: true }),
  ];

  it('mergeRecurring overlays stored settings and keeps stored-only items', () => {
    const merged = mergeRecurring(
      txs,
      [rec({ description: 'MEO', dueDay: 10, expectedAmount: 45, active: false }), rec({ description: 'Ginásio', expectedAmount: 30 })],
      2,
    );
    const get = (d: string) => merged.find((r) => r.description === d)!;
    expect(get('Aluguel')).toMatchObject({ active: true, expectedAmount: 900, dueDay: undefined });
    expect(get('MEO')).toMatchObject({ active: false, dueDay: 10, expectedAmount: 45 });
    expect(get('Ginásio')).toMatchObject({ expectedAmount: 30 });
    expect(get('Salário')).toMatchObject({ type: 'income', expectedAmount: 3000 });
  });

  it('buckets into overdue / soon / later / done', () => {
    const recurring = [
      rec({ description: 'Aluguel', dueDay: 1, expectedAmount: 900 }),
      rec({ description: 'MEO', dueDay: 15, expectedAmount: 40 }),
      rec({ description: 'Energia', dueDay: 28, expectedAmount: 60 }),
      rec({ type: 'income', description: 'Salário', dueDay: 25, expectedAmount: 3000 }),
      rec({ description: 'Off', dueDay: 2, active: false }),
    ];
    const bills = billsForMonth(txs, recurring, 2026, 2, day('2026-02-10'));
    expect(bills.map((b) => [b.item.description, b.bucket, b.amount, b.recorded])).toEqual([
      ['Aluguel', 'overdue', 900, true],
      ['MEO', 'soon', 40, false],
      ['Energia', 'later', 60, false],
      ['Salário', 'done', 3000, true],
    ]);
  });

  it('treats a due date 7 days out as soon and 8 as later', () => {
    const r = [rec({ description: 'A', dueDay: 17 }), rec({ description: 'B', dueDay: 18 })];
    expect(billsForMonth([], r, 2026, 2, day('2026-02-10')).map((b) => b.bucket)).toEqual(['soon', 'later']);
  });

  it('clamps day 31 to the end of February, leap years included', () => {
    const r = [rec({ description: 'X', dueDay: 31 })];
    expect(billsForMonth([], r, 2026, 2, day('2026-02-01'))[0].dueDate).toBe('2026-02-28');
    expect(billsForMonth([], r, 2028, 2, day('2028-02-01'))[0].dueDate).toBe('2028-02-29');
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('marks unpaid items of a past month without a due day as overdue', () => {
    const r = [rec({ description: 'Aluguel' })];
    expect(billsForMonth(txs, r, 2026, 2, day('2026-03-01'))[0].bucket).toBe('overdue');
    expect(billsForMonth(txs, r, 2026, 2, day('2026-02-28'))[0].bucket).toBe('later');
  });

  it('upcomingBills includes next month across the year boundary', () => {
    const r = [rec({ description: 'Seguro', dueDay: 2, expectedAmount: 50 }), rec({ description: 'Tarde', dueDay: 20, expectedAmount: 1 })];
    const up = upcomingBills([], r, day('2026-12-28'));
    // December's unpaid items are overdue; January 2 is within 7 days, January 20 is not.
    expect(up.map((b) => [b.item.description, b.dueDate, b.bucket])).toEqual([
      ['Seguro', '2026-12-02', 'overdue'],
      ['Tarde', '2026-12-20', 'overdue'],
      ['Seguro', '2027-01-02', 'soon'],
    ]);
  });

  it('startMonthTxs creates pending entries once, skipping inactive or zero items', () => {
    const recurring = [
      rec({ description: 'Aluguel', expectedAmount: 900, dueDay: 31 }),
      rec({ description: 'MEO', expectedAmount: 40 }),
      rec({ description: 'Off', expectedAmount: 10, active: false }),
      rec({ description: 'Zero', expectedAmount: 0 }),
    ];
    const created = startMonthTxs(txs, recurring, 2026, 2);
    // Aluguel already has a February entry.
    expect(created.map((t) => [t.description, t.amount, t.paid, t.date])).toEqual([['MEO', 40, false, '2026-02-01']]);
    expect(startMonthTxs([...txs, ...created], recurring, 2026, 2)).toEqual([]);
    expect(startMonthTxs([], recurring, 2026, 4).find((t) => t.description === 'Aluguel')!.date).toBe('2026-04-30');
  });
});

describe('forecast and insights', () => {
  it('extrapolates variable spending and adds missing recurring items mid-month', () => {
    const txs = [
      tx({ month: 4, type: 'variable', amount: 100 }),
      tx({ month: 4, type: 'fixed', description: 'Aluguel', amount: 900 }),
      tx({ month: 4, type: 'income', description: 'Salário', amount: 3000 }),
    ];
    const recurring = [
      rec({ description: 'Aluguel', expectedAmount: 900 }),
      rec({ description: 'MEO', expectedAmount: 40 }),
      rec({ description: 'Off', expectedAmount: 999, active: false }),
      rec({ type: 'investment', description: 'ETF', expectedAmount: 500 }),
    ];
    const f = forecastMonth(txs, recurring, 2026, 4, day('2026-04-10'));
    // 100 by day 10 of a 30-day month → 300; fixed 900 recorded + MEO 40 expected.
    expect(f).toMatchObject({ isForecast: true, spentSoFar: 1000, projectedSpend: 1240, projectedIncome: 3000, projectedInvestment: 500, expectedRecurring: 540 });
    expect(f.projectedSaldo).toBe(3000 - 1240 - 500);
  });

  it('reports actuals for other months', () => {
    const txs = [tx({ month: 3, amount: 100 }), tx({ month: 3, type: 'income', amount: 1000 })];
    expect(forecastMonth(txs, [rec({ description: 'MEO', expectedAmount: 40 })], 2026, 3, day('2026-04-10'))).toEqual({
      isForecast: false, spentSoFar: 100, projectedSpend: 100, projectedIncome: 1000, projectedInvestment: 0, projectedSaldo: 900, expectedRecurring: 0,
      expectedFlexibleRest: 0, typicalDaily: 0, basis: 'actual',
    });
    // Same month number, another year: not the current month either.
    expect(forecastMonth(txs, [], 2025, 4, day('2026-04-10')).isForecast).toBe(false);
  });

  it('orders insights by weight, overdue first', () => {
    const txs = [
      tx({ month: 4, type: 'fixed', description: 'Aluguel', amount: 900, paid: false }),
      tx({ month: 4, type: 'income', description: 'Salário', amount: 1000, paid: true }),
      tx({ month: 4, category: 'Lazer', amount: 200 }),
    ];
    const list = insights({
      txs,
      budgets: [{ category: 'Lazer', monthlyLimit: 100 }],
      recurring: [rec({ description: 'Aluguel', dueDay: 1 })],
      settings: DEFAULT_SETTINGS,
      year: 2026,
      month: 4,
      today: day('2026-04-10'),
    });
    expect(list[0].id).toBe('overdue');
    expect(list.map((i) => i.weight)).toEqual([...list.map((i) => i.weight)].sort((a, b) => b - a));
    expect(list.map((i) => i.id)).toContain('budget-Lazer');
    expect(list.map((i) => i.id)).toContain('biggest');
  });

  it('skips category deviations with a small average', () => {
    const base = { budgets: [], recurring: [], settings: DEFAULT_SETTINGS, year: 2026, month: 3, today: day('2026-06-01') };
    const small = [tx({ month: 1, category: 'Café', amount: 5 }), tx({ month: 2, category: 'Café', amount: 5 }), tx({ month: 3, category: 'Café', amount: 50 })];
    expect(insights({ ...base, txs: small }).some((i) => i.id === 'dev-Café')).toBe(false);
    const big = small.map((t) => ({ ...t, amount: t.amount * 10 }));
    expect(insights({ ...base, txs: big }).some((i) => i.id === 'dev-Café')).toBe(true);
  });
});

describe('goalStatus', () => {
  const settings = { ...DEFAULT_SETTINGS, eurBrlRate: 6, patrimonyBR: 10000, patrimonyEU: 5000 };
  const totals = totalsByType([
    tx({ type: 'income', month: 1, amount: 3000 }),
    tx({ type: 'investment', month: 1, amount: 500 }),
    tx({ type: 'income', month: 2, amount: 3000 }),
    tx({ type: 'investment', month: 2, amount: 1000 }),
  ]);
  const goal = (over: Partial<Goal>): Goal => ({
    id: 'g', name: 'G', target: 100000, currency: 'BRL', source: 'patrimony', contributions: [], createdAt: '2026-01-15T10:00:00.000Z', ...over,
  });
  const today = day('2026-03-10');

  it('tracks patrimony in BRL with the investment pace', () => {
    const s = goalStatus(goal({}), settings, totals, today);
    // 10000 + 5000×6 = 40000; pace 750 €/month × 6 = 4500 R$
    expect(s).toMatchObject({ current: 40000, remaining: 60000, progress: 0.4, monthlyPace: 4500, monthsLeftAtPace: 14, projectedDate: '2027-05' });
  });

  it('tracks patrimony in EUR', () => {
    const s = goalStatus(goal({ currency: 'EUR', target: 10000 }), settings, totals, today);
    expect(s).toMatchObject({ current: 6666.67, monthlyPace: 750, monthsLeftAtPace: 5 });
  });

  it('sums manual contributions and spreads them over the months since creation', () => {
    const s = goalStatus(
      goal({ source: 'manual', currency: 'EUR', target: 1000, targetDate: '2026-07-01', contributions: [{ date: '2026-01-20', amount: 100 }, { date: '2026-02-20', amount: 200 }] }),
      settings,
      null,
      today,
    );
    // Jan..Mar = 3 months → 100/month; 4 months to July → 175/month needed.
    expect(s).toMatchObject({ current: 300, remaining: 700, monthlyPace: 100, monthsToTarget: 4, monthlyNeeded: 175, monthsLeftAtPace: 7 });
  });

  it('handles reached goals, no pace and past target dates', () => {
    expect(goalStatus(goal({ target: 30000 }), settings, totals, today)).toMatchObject({ remaining: 0, monthsLeftAtPace: 0, monthlyNeeded: null });
    expect(goalStatus(goal({}), settings, null, today)).toMatchObject({ monthlyPace: 0, monthsLeftAtPace: null, projectedDate: null });
    expect(goalStatus(goal({ targetDate: '2025-01-01' }), settings, totals, today)).toMatchObject({ monthsToTarget: 1, monthlyNeeded: 60000 });
    expect(goalStatus(goal({ target: 0 }), settings, totals, today).progress).toBe(0);
  });
});

describe('yearOverYear', () => {
  const a = [
    tx({ year: 2025, month: 1, category: 'Lazer', amount: 100 }),
    tx({ year: 2025, month: 2, category: 'Casa', amount: 50 }),
    tx({ year: 2025, month: 11, category: 'Lazer', amount: 5000 }),
    tx({ year: 2025, month: 1, type: 'income', amount: 1000 }),
  ];
  const b = [
    tx({ year: 2026, month: 1, category: 'Lazer', amount: 150 }),
    tx({ year: 2026, month: 2, category: 'Viagem', amount: 300 }),
    tx({ year: 2026, month: 1, type: 'income', amount: 1200 }),
  ];

  it('compares the same period only', () => {
    const y = yearOverYear(a, b, 2);
    expect(y.months).toBe(2);
    expect(y.monthly).toEqual([{ month: 1, a: 100, b: 150 }, { month: 2, a: 50, b: 300 }]);
    expect(y.totals.expenses).toEqual({ a: 150, b: 450, delta: 300, deltaPct: 2 });
    expect(y.totals.income).toMatchObject({ a: 1000, b: 1200, deltaPct: 0.2 });
  });

  it('sorts categories by absolute change, with null pct for new categories', () => {
    const y = yearOverYear(a, b, 2);
    expect(y.categories.map((c) => [c.category, c.delta, c.deltaPct])).toEqual([
      ['Viagem', 300, null],
      ['Lazer', 50, 0.5],
      ['Casa', -50, -1],
    ]);
  });

  it('defaults to the full year', () => {
    expect(yearOverYear(a, b).totals.expenses.a).toBe(5150);
  });
});

describe('forecast with history (one-offs are not multiplied)', () => {
  const today = new Date(2026, 9, 21); // 21 Oct 2026, 10 days left

  it('adds the typical daily spend of earlier months for the days left', () => {
    const txs = [
      tx({ month: 9, amount: 300 }), // Sep: 300 / 30 = 10/day
      tx({ month: 8, amount: 310 }), // Aug: 310 / 31 = 10/day
      tx({ month: 10, amount: 700 }), // a one-off this month
    ];
    const f = forecastMonth(txs, [], 2026, 10, today);
    expect(f.basis).toBe('history');
    expect(f.typicalDaily).toBe(10);
    expect(f.expectedFlexibleRest).toBe(100);
    expect(f.projectedSpend).toBe(800); // 700 so far + 10 × 10, not 700 / 21 × 31
  });

  it('ignores earlier months with no variable spending, and falls back to pace without history', () => {
    const withGap = [tx({ month: 9, amount: 300 }), tx({ month: 8, type: 'fixed', amount: 50 }), tx({ month: 10, amount: 210 })];
    expect(forecastMonth(withGap, [], 2026, 10, today).typicalDaily).toBe(10);
    const none = forecastMonth([tx({ month: 10, amount: 210 })], [], 2026, 10, today);
    expect(none.basis).toBe('pace');
    expect(none.projectedSpend).toBe(310); // 210 / 21 × 31
  });
});
