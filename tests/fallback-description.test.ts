import { describe, expect, it } from 'vitest';
import { fallbackDescription } from '../src/util';

describe('fallbackDescription', () => {
  it('uses "(sem descrição)" for variable and additional expenses', () => {
    expect(fallbackDescription('variable', 'Outros')).toBe('(sem descrição)');
    expect(fallbackDescription('additional', 'Saúde')).toBe('(sem descrição)');
  });
  it('uses the category as the row label for fixed, income and investment', () => {
    expect(fallbackDescription('fixed', 'Moradia')).toBe('Moradia');
    expect(fallbackDescription('income', 'Receita')).toBe('Receita');
  });
  it('falls back to "(sem descrição)" when there is no category', () => {
    expect(fallbackDescription('fixed', '')).toBe('(sem descrição)');
  });
});
