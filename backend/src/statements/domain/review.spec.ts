import { defaultRules, type CategoryRule } from '@finance/shared';
import { tx } from '../../testing/factories.js';
import type { ParsedStatement, StatementEntry } from './activobank.js';
import { reviewStatement } from './review.js';

const entry = (raw: string, amount: number, overrides: Partial<StatementEntry> = {}): StatementEntry => ({
  date: '2026-09-15',
  raw,
  amount,
  direction: 'debit',
  balanceOk: true,
  ...overrides,
});

const statement = (...entries: StatementEntry[]): ParsedStatement => ({
  bank: 'ActivoBank',
  holder: 'ANA TESTE SILVA',
  from: '2026-09-01',
  to: '2026-09-30',
  entries,
});

const review = (entries: StatementEntry[], existing = [tx({ year: 1999 })], rules: CategoryRule[] = defaultRules()) =>
  reviewStatement(statement(...entries), rules, existing);

describe('reviewStatement', () => {
  it('records a purchase with a known category right away, dated and in its month', () => {
    const [row] = review([entry('COMPRA 1254 CONTINENTE 4435-665 BAG CONTACTLESS', 29.23)]);
    expect(row.doubts).toEqual([]);
    expect(row.transaction).toMatchObject({
      year: 2026, month: 9, date: '2026-09-15', description: 'Continente Bag', amount: 29.23,
      type: 'variable', category: 'Mercado', categorySource: 'auto', paid: true,
    });
    expect(row).toMatchObject({ raw: 'COMPRA 1254 CONTINENTE 4435-665 BAG CONTACTLESS', direction: 'debit', alreadyImported: false });
    expect(row.match).toBeUndefined();
  });

  it("uses the user's rules before the built-in merchants, and the merchant's name before the city", () => {
    const rules = [...defaultRules(), { id: 'r', keyword: 'continente', category: 'Casa', tags: ['ikea?'], priority: 50 }];
    expect(review([entry('COMPRA 1254 CONTINENTE BAG', 5)], undefined, rules)[0].transaction).toMatchObject({ category: 'Casa', tags: ['ikea?'] });
    // "dublin" is a Viagem keyword; "Anthropic" comes first.
    expect(review([entry('COMPRA 1254 ANTHROPIC CLAUDE SUB DUBLIN 4 IE', 22.14)])[0].transaction).toMatchObject({ description: 'Claude (Anthropic)', category: 'Assinaturas' });
    expect(review([entry('COMPRA 1254 WOORI MARKET PORTO PORT CONTACTLESS', 10.66)])[0].transaction.category).toBe('Mercado');
  });

  it('bank fees are spending without a doubt, categorised as Outros', () => {
    const [row] = review([entry('COM.CONTA PLANO AB PLUS 082026', 3.99)]);
    expect(row).toMatchObject({ doubts: [], transaction: { description: 'Comissão da conta', category: 'Outros', type: 'variable' } });
  });

  it('asks about lines without a category, transfers, money in and wrong balances', () => {
    const rows = review([
      entry('COMPRA 1254 SINFONIA AMARELA TEL 22 CONTACTLESS', 4.2),
      entry('TRF MB WAY P/ JOAO EXEMPLO', 57.08),
      entry('LEVANTAMENTO 1254', 20),
      entry('Mangopay', 8.8, { direction: 'credit' }),
      entry('COMPRA 1254 LIDL', 3, { balanceOk: false }),
    ]);
    expect(rows.map((r) => r.doubts)).toEqual([['no-category'], ['transfer'], ['transfer'], ['credit'], ['balance']]);
    expect(rows[3].transaction).toMatchObject({ type: 'income', category: 'Receita' });
  });

  it('money moved to my own account is a likely investment; money from it is income to check', () => {
    const [out, back] = review([entry('TRF P/ Ana Maria Teste Silva', 2500), entry('TRF. P/O Ana Maria Teste Silva', 1540, { direction: 'credit' })]);
    expect(out).toMatchObject({ doubts: ['own-transfer'], transaction: { type: 'investment', category: 'Investimento' } });
    expect(back).toMatchObject({ doubts: ['own-transfer'], transaction: { type: 'income', category: 'Receita' } });
  });

  describe('already in the app', () => {
    it('same month and amount is a duplicate to confirm; each entry matches one line, the closest date first', () => {
      const existing = [
        tx({ id: 'far', month: 9, date: '2026-09-20', amount: 18.87, category: 'Mercado', description: 'super' }),
        tx({ id: 'near', month: 9, date: '2026-09-16', amount: 18.87, category: 'Mercado', description: 'super' }),
      ];
      const rows = review([entry('COMPRA 1254 CONTINENTE BAG', 18.87), entry('COMPRA 1254 CONTINENTE BAG', 18.87), entry('COMPRA 1254 CONTINENTE BAG', 18.87)], existing);
      expect(rows.map((r) => r.match?.id)).toEqual(['near', 'far', undefined]);
      expect(rows[0]).toMatchObject({ doubts: ['duplicate'], match: { description: 'super', amount: 18.87, date: '2026-09-16', type: 'variable' } });
      expect(rows[2].doubts).toEqual([]);
    });

    it('prefers the entry with the same category, matches the total of a split, and ignores other months', () => {
      const existing = [
        tx({ id: 'groceries', month: 9, date: '2026-09-01', amount: 15, category: 'Mercado' }),
        tx({ id: 'phone', month: 9, date: '2026-09-01', amount: 15, category: 'Casa', type: 'fixed' }),
        tx({ id: 'split', month: 9, amount: 25, split: { people: 2, total: 50 }, category: 'Restaurante' }),
        tx({ id: 'august', month: 8, amount: 7, category: 'Mercado' }),
      ];
      const rows = review([entry('COMPRA 1254 CARREGAMENTOS VODAFO1988-017 LISBOA', 15), entry('COMPRA 1254 BAR S DOS REIS', 50), entry('COMPRA 1254 LIDL', 7)], existing);
      expect(rows.map((r) => r.match?.id)).toEqual(['phone', 'split', undefined]);
    });

    it('a categorised line needs the same category; an uncategorised purchase never matches a fixed bill', () => {
      const existing = [
        tx({ id: 'youtube', month: 9, amount: 2, type: 'fixed', category: 'Assinaturas' }),
        tx({ id: 'cinema', month: 9, amount: 4.75, category: 'Lazer' }),
        tx({ id: 'rent', month: 9, amount: 380, type: 'fixed', category: 'Casa' }),
      ];
      const rows = review([entry('COMPRA 1254 NYX ARRAIAL', 2), entry('COMPRA 1254 LLAOLLAO', 4.75), entry('TRF MB WAY P/ JOAO EXEMPLO', 380)], existing);
      expect(rows.map((r) => r.match?.id)).toEqual([undefined, undefined, 'rent']);
      expect(rows[2].doubts).toEqual(['duplicate', 'transfer']);
    });

    it('money in only matches income, and a dated entry more than a week away is another one', () => {
      const existing = [
        tx({ id: 'spent', month: 9, amount: 8.8 }),
        tx({ id: 'salary', month: 9, amount: 1540, type: 'income', category: 'Receita' }),
        tx({ id: 'later', month: 9, date: '2026-09-28', amount: 29.23, category: 'Mercado' }),
      ];
      const rows = review([entry('Mangopay', 8.8, { direction: 'credit' }), entry('TRF. P/O X', 1540, { direction: 'credit' }), entry('COMPRA 1254 CONTINENTE', 29.23)], existing);
      expect(rows.map((r) => r.match?.id)).toEqual([undefined, 'salary', undefined]);
    });

    it('a direct debit in a category that already has a fixed bill asks, pointing at that bill', () => {
      const existing = [tx({ id: 'gym', month: 9, amount: 59, type: 'fixed', category: 'Saúde', description: 'Academia' })];
      const [row] = review([entry('DD Solinca Classi 00057419885 PT40100188', 29.98)], existing);
      expect(row).toMatchObject({ doubts: ['bill'], match: { id: 'gym', description: 'Academia' } });
    });

    it('the same statement imported again is recognised by id, and deleted entries do not count', () => {
      const lines = [entry('COMPRA 1254 LIDL', 3), entry('COMPRA 1254 LIDL', 3), entry('COMPRA 1254 LIDL', 3, { direction: 'credit' })];
      const first = review(lines);
      expect(new Set(first.map((r) => r.transaction.id)).size).toBe(3);
      expect(first[0].transaction.id).toMatch(/^stm-2026-09-15-300d-\w+-1$/);

      const again = review(lines, [{ ...first[0].transaction }, tx({ id: 'gone', month: 9, amount: 3, category: 'Mercado', deleted: true })]);
      expect(again.map((r) => r.alreadyImported)).toEqual([true, false, false]);
      expect(again.every((r) => r.match === undefined)).toBe(true);
    });
  });
});
