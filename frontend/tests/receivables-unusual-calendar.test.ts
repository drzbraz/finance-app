import { heatLevel, hasRealDay, spendCalendar } from '../src/analytics/calendar';
import { freeToSpend } from '../src/analytics/free';
import { markReceived, pendingReceivables, receivable, receivableTotal } from '../src/analytics/receivables';
import { unusualCategories } from '../src/analytics/unusual';
import { tx } from './helpers';

const day = (iso: string) => new Date(`${iso}T12:00:00`);

describe('Splitwise a receber', () => {
  const dinner = tx({ id: 'd', month: 10, date: '2026-10-05', amount: 20, split: { people: 3, total: 60 } });
  const paidBack = tx({ id: 'p', month: 10, amount: 10, split: { people: 2, total: 20, receivedOn: '2026-10-07' } });
  const older = tx({ id: 'o', month: 9, date: '2026-09-20', amount: 15, split: { people: 2, total: 30 } });

  it('what the others owe is the total minus my share, until it is marked received', () => {
    expect(receivable(dinner)).toBe(40);
    expect(receivable(tx())).toBe(0);
    expect(pendingReceivables([dinner, paidBack, older, tx()]).map((t) => t.id)).toEqual(['o', 'd']);
    expect(receivableTotal([dinner, paidBack, older])).toBe(55);
    expect(receivableTotal([dinner, paidBack, older], 10)).toBe(40);
  });

  it('marking received stamps the day; unmarking takes it back', () => {
    const received = markReceived(dinner, '2026-10-22');
    expect(received.split).toEqual({ people: 3, total: 60, receivedOn: '2026-10-22' });
    expect(markReceived(received, null).split).toEqual({ people: 3, total: 60 });
    expect(markReceived(tx({ id: 'plain' }), '2026-10-22').split).toBeUndefined();
  });

  it('"Livre para gastar" waits for the money; once received it comes back', () => {
    const income = tx({ month: 10, type: 'income', amount: 1000, category: 'Receita' });
    const before = freeToSpend([income, dinner], [], [], 2026, 10, day('2026-10-22'));
    expect(before).toMatchObject({ toReceive: 40, free: 1000 - 20 - 40 });
    const after = freeToSpend([income, markReceived(dinner, '2026-10-22')], [], [], 2026, 10, day('2026-10-22'));
    expect(after).toMatchObject({ toReceive: 0, free: 980 });
  });
});

describe('Fora do normal', () => {
  const months = (category: string, amounts: [number, number][]) => amounts.map(([month, amount]) => tx({ month, amount, category }));

  it('flags a category above its usual pace by now, by ratio and by euros', () => {
    const txs = [
      ...months('Restaurante', [[7, 100], [8, 100], [9, 100]]),
      ...months('Mercado', [[7, 300], [8, 300], [9, 300]]),
      ...months('Café', [[7, 10], [8, 10], [9, 10]]),
      tx({ month: 10, amount: 120, category: 'Restaurante' }), // usual by the 15th ≈ 48
      tx({ month: 10, amount: 160, category: 'Mercado' }), // usual by now ≈ 145: within normal
      tx({ month: 10, amount: 15, category: 'Café' }), // +200% but only ~10 € more: not worth a ping
    ];
    const rows = unusualCategories(txs, 2026, 10, day('2026-10-15'));
    expect(rows.map((r) => r.category)).toEqual(['Restaurante']);
    expect(rows[0]).toMatchObject({ spent: 120, usual: 100, expected: 48.39 });
    expect(rows[0].above).toBeCloseTo(120 / 48.39 - 1, 3);
  });

  it('a closed month compares with the whole usual month; a new category with real money shows up', () => {
    const txs = [...months('Lazer', [[7, 50], [8, 50], [9, 50]]), tx({ month: 10, amount: 90, category: 'Lazer' }), tx({ month: 10, amount: 80, category: 'Viagem' })];
    const rows = unusualCategories(txs, 2026, 10, day('2026-12-01'));
    expect(rows.map((r) => [r.category, r.above === null ? null : Math.round(r.above * 100)])).toEqual([['Viagem', null], ['Lazer', 80]]);
  });

  it('January looks back into last year; months with nothing logged and fixed bills do not count', () => {
    const txs = [
      tx({ year: 2025, month: 12, amount: 100, category: 'Lazer' }),
      tx({ year: 2025, month: 11, amount: 100, category: 'Lazer' }),
      tx({ year: 2026, month: 1, amount: 900, category: 'Casa', type: 'fixed' }),
      tx({ year: 2026, month: 1, amount: 180, category: 'Lazer' }),
    ];
    expect(unusualCategories(txs, 2026, 1, day('2026-02-10'))).toMatchObject([{ category: 'Lazer', usual: 100 }]);
    expect(unusualCategories([tx({ month: 1, amount: 500, category: 'Lazer' })], 2026, 1, day('2026-02-01'))).toEqual([]);
  });
});

describe('Calendário de gastos', () => {
  it('sums day-to-day spending per day, Monday-first grid, future days marked', () => {
    const txs = [
      tx({ month: 10, date: '2026-10-03', amount: 10, category: 'Lazer' }),
      tx({ month: 10, date: '2026-10-03', amount: 5, category: 'Mercado' }),
      tx({ month: 10, date: '2026-10-10', amount: 40, category: 'Mercado' }),
      tx({ month: 10, date: '2026-10-05', amount: 700, type: 'fixed', category: 'Casa' }),
      tx({ month: 9, date: '2026-09-03', amount: 99 }),
    ];
    const cal = spendCalendar(txs, 2026, 10, day('2026-10-22'));
    expect(cal.offset).toBe(3); // 1 Oct 2026 is a Thursday
    expect(cal.days).toHaveLength(31);
    expect(cal.days[2]).toMatchObject({ day: 3, weekday: 5, total: 15 });
    expect(cal.days[2].entries.map((t) => t.amount)).toEqual([10, 5]);
    expect(cal.days[4].total).toBe(0); // fixed bills stay out
    expect(cal.max).toBe(40);
    expect(cal.days[21].isFuture).toBe(false);
    expect(cal.days[22].isFuture).toBe(true);
    expect(cal.weekdayAverage[5]).toBe(round(55 / 3)); // Saturdays gone: 3, 10, 17
  });

  it('sheet cells without a dated note are not put on the 1st', () => {
    const undated = tx({ month: 10, date: '2026-10-01', amount: 30, source: { sheet: 'S', cell: 'F20' } });
    const noted = tx({ month: 10, date: '2026-10-01', amount: 7, source: { sheet: 'S', cell: 'F21' }, noteHeader: 'Ana (2026-10-01 10:00:00)' });
    // A note written in another month does not date the cell either.
    const oldNote = tx({ month: 10, date: '2026-10-01', amount: 3, source: { sheet: 'S', cell: 'F22' }, noteHeader: 'Ana (2026-08-30 10:00:00)' });
    expect(hasRealDay(oldNote)).toBe(false);
    expect(hasRealDay(undated)).toBe(false);
    expect(hasRealDay(noted)).toBe(true);
    expect(hasRealDay(tx({ date: undefined }))).toBe(false);
    const cal = spendCalendar([undated, noted, oldNote], 2026, 10, day('2026-10-22'));
    expect(cal.days[0].total).toBe(7);
    expect(cal.undated).toEqual({ count: 2, total: 33 });
  });

  it('shades by the square root of the share of the busiest day', () => {
    expect([0, 1, 10, 25, 60, 100].map((v) => heatLevel(v, 100))).toEqual([0, 1, 2, 2, 4, 4]);
    expect(heatLevel(5, 0)).toBe(0);
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
