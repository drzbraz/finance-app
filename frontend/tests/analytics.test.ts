import { cumulative, expenseTotals, monthlyGrid, saldo, totalsByType } from '../src/analytics/aggregate';
import { monthChecklist } from '../src/analytics/checklist';
import {
  byCategory,
  goalProgress,
  pending,
  savingsRate,
  savingsRateYTD,
  topExpenses,
} from '../src/analytics/metrics';
import { DEFAULT_SETTINGS } from '@finance/shared';
import { tx } from './helpers';

const zeros = () => new Array<number>(12).fill(0);
const at = (pairs: Record<number, number>) => zeros().map((_, i) => pairs[i + 1] ?? 0);

const year = [
  tx({ type: 'income', month: 1, amount: 3000 }),
  tx({ type: 'income', month: 2, amount: 3000 }),
  tx({ type: 'investment', month: 1, amount: 600 }),
  tx({ type: 'investment', month: 2, amount: 900 }),
  tx({ type: 'fixed', month: 1, amount: 900, category: 'Casa' }),
  tx({ type: 'variable', month: 1, amount: 0.1, category: 'Mercado' }),
  tx({ type: 'variable', month: 1, amount: 0.2, category: 'Mercado' }),
  tx({ type: 'additional', month: 2, amount: 100, category: 'Presentes' }),
];

describe('aggregate', () => {
  const t = totalsByType(year);

  it('sums per type and month, rounding to cents', () => {
    expect(t.income).toEqual(at({ 1: 3000, 2: 3000 }));
    expect(t.variable).toEqual(at({ 1: 0.3 }));
    expect(t.additional).toEqual(at({ 2: 100 }));
  });

  it('computes expenses and saldo like the sheet', () => {
    expect(expenseTotals(t)).toEqual(at({ 1: 900.3, 2: 100 }));
    // income − (expenses + investments)
    expect(saldo(t)).toEqual(at({ 1: 1499.7, 2: 2000 }));
  });

  it('accumulates', () => {
    expect(cumulative([1.1, 2.2, -0.3])).toEqual([1.1, 3.3, 3]);
    expect(cumulative([])).toEqual([]);
  });

  it('groups labeled rows by description, in sheet order', () => {
    const rows = monthlyGrid(
      [
        tx({ type: 'fixed', description: 'MEO', month: 2, source: { sheet: 's', cell: 'C30' } }),
        tx({ type: 'fixed', description: 'Aluguel', month: 1, source: { sheet: 's', cell: 'B29' } }),
        tx({ type: 'fixed', description: 'Aluguel', month: 3, source: { sheet: 's', cell: 'D29' } }),
        tx({ type: 'income', description: 'Salário' }),
      ],
      'fixed',
    );
    expect(rows.map((r) => r.label)).toEqual(['Aluguel', 'MEO']);
    expect(rows[0].cells.map((c) => c.length)).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('stacks variable expenses per month column', () => {
    const rows = monthlyGrid(
      [
        tx({ month: 1, source: { sheet: 's', cell: 'B40' } }),
        tx({ month: 1, source: { sheet: 's', cell: 'B39' } }),
        tx({ month: 2, source: { sheet: 's', cell: 'C39' } }),
      ],
      'variable',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].cells[0][0].source!.cell).toBe('B39');
    expect(rows[1].cells[1]).toEqual([]);
    expect(monthlyGrid([], 'variable')).toEqual([]);
  });
});

describe('metrics', () => {
  const t = totalsByType(year);

  it('savingsRate is investment ÷ income, null without income', () => {
    expect(savingsRate(t).slice(0, 3)).toEqual([0.2, 0.3, null]);
    expect(savingsRateYTD(t, 2)).toBeCloseTo(0.25);
    expect(savingsRateYTD(totalsByType([]), 12)).toBeNull();
  });

  it('byCategory sums expenses only, descending', () => {
    expect(byCategory(year)).toEqual([
      { category: 'Casa', amount: 900 },
      { category: 'Presentes', amount: 100 },
      { category: 'Mercado', amount: 0.3 },
    ]);
    expect(byCategory(year, 2)).toEqual([{ category: 'Presentes', amount: 100 }]);
    expect(byCategory([tx({ category: '' })])).toEqual([{ category: 'Outros', amount: 10 }]);
  });

  it('topExpenses ignores income and other months', () => {
    expect(topExpenses(year, 1, 2).map((x) => x.amount)).toEqual([900, 0.2]);
  });

  it('goalProgress converts EU patrimony and projects months left', () => {
    const s = { ...DEFAULT_SETTINGS, eurBrlRate: 6, goalBRL: 100000, patrimonyBR: 10000, patrimonyEU: 5000 };
    // current = 10000 + 5000×6 = 40000; pace = (600+900)/2 = 750 €/month = 4500 R$/month
    expect(goalProgress(s, t)).toEqual({ currentBRL: 40000, goalBRL: 100000, progress: 0.4, monthlyPaceEUR: 750, monthsLeft: 14 });
    expect(goalProgress({ ...s, goalBRL: 30000 }, t).monthsLeft).toBe(0);
    expect(goalProgress({ ...s, goalBRL: 0 }, t)).toMatchObject({ progress: 0, monthsLeft: null });
    expect(goalProgress(s, totalsByType([])).monthsLeft).toBeNull();
  });

  it('pending lists unpaid items of the month, largest first', () => {
    const txs = [tx({ paid: false, amount: 5 }), tx({ paid: false, amount: 50 }), tx({ paid: true }), tx({ paid: false, month: 2 })];
    expect(pending(txs, 1).map((x) => x.amount)).toEqual([50, 5]);
  });
});

describe('monthChecklist', () => {
  const src = (cell: string) => ({ sheet: 's', cell });
  const txs = [
    tx({ type: 'income', description: 'Salário', month: 1, amount: 3000, paid: true, source: src('B4') }),
    tx({ type: 'income', description: 'Salário', month: 2, amount: 3100, paid: false, source: src('C4') }),
    tx({ type: 'fixed', description: 'Aluguel', month: 1, amount: 900, paid: true, source: src('B29') }),
    tx({ type: 'fixed', description: 'MEO', month: 1, amount: 40, paid: true, source: src('B30') }),
    tx({ type: 'fixed', description: 'MEO', month: 2, amount: 45, paid: true, source: src('C30') }),
    tx({ type: 'investment', description: 'ETF', month: 3, amount: 500, paid: false, source: src('D8') }),
    tx({ type: 'variable', description: 'jantar', month: 2 }),
  ];

  it('lists recurring items grouped by section, in sheet order', () => {
    const c = monthChecklist(txs, 2);
    expect(c.items.map((i) => i.key)).toEqual(['income|Salário', 'investment|ETF', 'fixed|Aluguel', 'fixed|MEO']);
  });

  it('marks done items and uses the latest earlier month as expected', () => {
    const c = monthChecklist(txs, 2);
    const get = (k: string) => c.items.find((i) => i.key === k)!;
    expect(get('fixed|MEO')).toMatchObject({ done: true, expected: undefined });
    expect(get('fixed|Aluguel')).toMatchObject({ done: false, expected: 900, txs: [] });
    // No earlier month: falls back to the latest month that has one.
    expect(get('investment|ETF')).toMatchObject({ done: false, expected: 500 });
    expect(get('income|Salário')).toMatchObject({ done: false });
    expect(c.doneCount).toBe(1);
  });

  it('totals what is left to pay and to receive', () => {
    const c = monthChecklist(txs, 2);
    expect(c.toReceive).toBe(3100);
    expect(c.toPay).toBe(1400); // Aluguel expected 900 + ETF expected 500
  });

  it('is empty without recurring items', () => {
    expect(monthChecklist([tx()], 1)).toEqual({ items: [], doneCount: 0, toPay: 0, toReceive: 0 });
  });
});
