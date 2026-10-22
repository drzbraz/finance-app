import { parseRoute, routeHash } from '../src/route';

const fallback = { page: 'home' as const, year: 2026, month: 10 };

describe('route in the URL hash', () => {
  it('reads page, year, month and category, and writes them back the same', () => {
    const route = parseRoute('#/transactions/2025/3?categoria=Sa%C3%BAde', fallback);
    expect(route).toEqual({ page: 'transactions', year: 2025, month: 3, category: 'Saúde' });
    expect(routeHash(route)).toBe('#/transactions/2025/3?categoria=Sa%C3%BAde');
    expect(routeHash(fallback)).toBe('#/home/2026/10');
  });

  it('falls back on anything missing or invalid', () => {
    expect(parseRoute('', fallback)).toEqual(fallback);
    expect(parseRoute('#/nope/1800/13', fallback)).toEqual(fallback);
    expect(parseRoute('#/bills', fallback)).toEqual({ ...fallback, page: 'bills' });
  });
});
