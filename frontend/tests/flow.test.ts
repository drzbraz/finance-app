import { monthPace, moneyFlow } from '../src/analytics/flow';
import { tx } from './helpers';

const OCT_22 = new Date(2026, 9, 22, 12);

describe('monthPace', () => {
  it('accumulates variable + additional spending by day, up to today, against the typical month', () => {
    const txs = [
      tx({ month: 9, amount: 300 }), // September: 300 over 30 days = 10/day
      tx({ month: 10, date: '2026-10-02', amount: 50 }),
      tx({ month: 10, date: '2026-10-10', amount: 100, type: 'additional' }),
      tx({ month: 10, date: '2026-10-05', amount: 700, type: 'fixed' }), // lump bills stay out
      tx({ month: 10, amount: 20 }), // undated: counts from day 1
    ];
    const pace = monthPace(txs, 2026, 10, OCT_22);
    expect(pace.isCurrent).toBe(true);
    expect(pace.days).toHaveLength(31);
    expect(pace.days[0]).toMatchObject({ day: 1, actual: 20, typical: 10, projected: null });
    expect(pace.days[9].actual).toBe(170);
    expect(pace.days[21]).toMatchObject({ actual: 170, typical: 220, projected: 170 });
    expect(pace.days[22].actual).toBeNull();
    expect(pace.days[30].projected).toBe(260);
    expect(pace.aheadBy).toBe(-50);
  });

  it('a past month is complete, and without history there is nothing to compare', () => {
    const pace = monthPace([tx({ month: 3, date: '2026-03-31', amount: 40 })], 2026, 3, OCT_22);
    expect(pace.isCurrent).toBe(false);
    expect(pace.days[30]).toMatchObject({ actual: 40, typical: null, projected: null });
    expect(pace.aheadBy).toBeNull();
  });
});

describe('moneyFlow', () => {
  const link = (f: NonNullable<ReturnType<typeof moneyFlow>>, from: string, to: string) =>
    f.links.find((l) => f.nodes[l.source].name === from && f.nodes[l.target].name === to)?.value;

  it('splits income into types and left over, and each expense type into its largest categories', () => {
    const f = moneyFlow([
      tx({ month: 10, amount: 2000, type: 'income', category: 'Receita' }),
      tx({ month: 10, amount: 700, type: 'fixed', category: 'Casa' }),
      tx({ month: 10, amount: 300, type: 'investment', category: 'ETF' }),
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => tx({ month: 10, amount: 60 - i * 10, category: c })),
    ], 10)!;
    expect(f).toMatchObject({ income: 2000, deficit: 0, leftOver: 790 });
    expect(link(f, 'Receitas', 'Despesas fixas')).toBe(700);
    expect(link(f, 'Receitas', 'Investimentos')).toBe(300);
    expect(link(f, 'Receitas', 'Sobrou')).toBe(790);
    expect(link(f, 'Despesas variáveis', 'A')).toBe(60);
    // Top 4, then the rest folded.
    expect(link(f, 'Despesas variáveis', 'E')).toBeUndefined();
    expect(link(f, 'Despesas variáveis', 'Outras (despesas variáveis)')).toBe(30);
  });

  it('a month spending more than it earned draws the gap from the reserve', () => {
    const f = moneyFlow([tx({ month: 10, amount: 500, type: 'income' }), tx({ month: 10, amount: 800, type: 'fixed', category: 'Casa' })], 10)!;
    expect(f.deficit).toBe(300);
    expect(link(f, 'Receitas', 'Total do mês')).toBe(500);
    expect(link(f, 'Tirado da reserva', 'Total do mês')).toBe(300);
    expect(link(f, 'Total do mês', 'Despesas fixas')).toBe(800);
  });

  it('is null for an empty month', () => {
    expect(moneyFlow([tx({ month: 9 })], 10)).toBeNull();
  });
});
