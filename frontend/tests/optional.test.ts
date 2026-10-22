import type { RecurringItem } from '@finance/shared';
import { billsForMonth, isExpected, isOptional, startMonthTxs } from '../src/analytics/bills';
import { freeToSpend } from '../src/analytics/free';
import { tx } from './helpers';

const OCT_22 = new Date(2026, 9, 22, 12);
const rec = (over: Partial<RecurringItem> & { description: string }): RecurringItem => ({
  key: `${over.type ?? 'fixed'}|${over.description}`,
  type: 'fixed',
  active: true,
  ...over,
});

describe('optional recurring lines', () => {
  const savings = rec({ type: 'investment', description: 'Savings', expectedAmount: 400 });
  const income = rec({ type: 'income', description: 'Seguro-desemprego', expectedAmount: 1600 });

  it('investments are optional unless set otherwise; anything can be made optional', () => {
    expect(isOptional(savings)).toBe(true);
    expect(isOptional({ ...savings, optional: false })).toBe(false);
    expect(isOptional(income)).toBe(false);
    expect(isOptional({ ...income, optional: true })).toBe(true);
    expect(isExpected({ ...income, active: false })).toBe(false);
  });

  it('"Livre para gastar" does not reserve an optional investment until it is recorded', () => {
    const free = freeToSpend([], [savings, income], [], 2026, 10, OCT_22);
    expect(free).toMatchObject({ income: 1600, investment: 0, free: 1600 });
    const recorded = freeToSpend([tx({ month: 10, type: 'investment', description: 'Savings', amount: 150 })], [savings, income], [], 2026, 10, OCT_22);
    expect(recorded).toMatchObject({ investment: 150, free: 1450 });
  });

  it('is never overdue and "Iniciar mês" leaves it out', () => {
    const [bill] = billsForMonth([], [{ ...savings, dueDay: 1 }], 2026, 10, OCT_22);
    expect(bill).toMatchObject({ bucket: 'optional', recorded: false });
    expect(startMonthTxs([], [savings, income], 2026, 10).map((t) => t.description)).toEqual(['Seguro-desemprego']);
  });

  it('once recorded, it is a bill like any other', () => {
    const [bill] = billsForMonth([tx({ month: 10, type: 'investment', description: 'Savings', amount: 400, paid: false })], [savings], 2026, 10, OCT_22);
    expect(bill.bucket).not.toBe('optional');
  });
});
