import { CATEGORIES, defaultRules } from '../src/rules/defaults.js';
import { applyRules, categorize, findRule, makeRule, ruleMatches, suggestKeyword } from '../src/rules/engine.js';
import type { CategoryRule } from '../src/types.js';
import { tx } from './helpers.js';

const rule = (over: Partial<CategoryRule>): CategoryRule => ({ id: 'r', keyword: 'x', category: 'Outros', priority: 10, ...over });

describe('ruleMatches', () => {
  it('matches whole words, accent- and case-insensitively', () => {
    expect(ruleMatches(rule({ keyword: 'cafe' }), 'Café da manhã')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'role' }), 'controle')).toBe(false);
    expect(ruleMatches(rule({ keyword: 'pingo doce' }), 'compras no Pingo  Doce')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'uber' }), 'uber, aeroporto')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'bus' }), 'business class')).toBe(false);
    expect(ruleMatches(rule({ keyword: 'trip' }), 'tripé')).toBe(false);
    expect(ruleMatches(rule({ keyword: 'psicolog' }), 'Psicóloga')).toBe(false);
  });

  it('treats a trailing * as a stem', () => {
    expect(ruleMatches(rule({ keyword: 'psicolog*' }), 'Psicóloga')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'role*' }), 'rolezin')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'role*' }), 'controle')).toBe(false);
    expect(ruleMatches(rule({ keyword: '*' }), 'qualquer')).toBe(false);
  });

  it('escapes regex characters in keywords', () => {
    expect(ruleMatches(rule({ keyword: 'c++' }), 'curso c++')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'a.b' }), 'axb')).toBe(false);
  });

  it('requires the whole label for exact rules', () => {
    expect(ruleMatches(rule({ keyword: 'Mãe', exact: true }), ' mae ')).toBe(true);
    expect(ruleMatches(rule({ keyword: 'Mãe', exact: true }), 'presente mãe')).toBe(false);
  });

  it('never matches an empty keyword', () => {
    expect(ruleMatches(rule({ keyword: '  ' }), 'qualquer')).toBe(false);
  });
});

describe('findRule', () => {
  it('prefers higher priority, then the longer keyword', () => {
    const rules = [
      rule({ id: 'low', keyword: 'jantar', priority: 10 }),
      rule({ id: 'high', keyword: 'sushi', priority: 50 }),
      rule({ id: 'long', keyword: 'jantar fora', priority: 10 }),
    ];
    expect(findRule(rules, 'jantar fora sushi')!.id).toBe('high');
    expect(findRule(rules.slice(0, 1).concat(rules[2]), 'jantar fora')!.id).toBe('long');
    expect(findRule(rules, 'nada')).toBeUndefined();
  });
});

describe('categorize', () => {
  const rules = defaultRules();

  it('categorises fixed labels and variable descriptions with the seed rules', () => {
    expect(categorize(tx({ type: 'fixed', description: 'Aluguel' }), rules).category).toBe('Casa');
    expect(categorize(tx({ type: 'fixed', description: 'Passe Metro' }), rules).category).toBe('Transporte');
    expect(categorize(tx({ description: 'jantar com amigos' }), rules).category).toBe('Restaurante');
    expect(categorize(tx({ description: 'Uber aeroporto' }), rules).category).toBe('Transporte');
    expect(categorize(tx({ description: 'Mercado', subgroup: 'FFFFF2CC' }), rules).category).toBe('Mercado');
    expect(categorize(tx({ type: 'fixed', description: 'Psicóloga' }), rules).category).toBe('Saúde');
    expect(categorize(tx({ description: 'business class' }), rules).category).not.toBe('Transporte');
  });

  it('puts unmatched yellow-block groceries in Mercado', () => {
    expect(categorize(tx({ description: 'pão', subgroup: 'FFFFF2CC' }), rules).category).toBe('Mercado');
    // A keyword match still wins over the yellow fallback.
    expect(categorize(tx({ description: 'jantar', subgroup: 'FFFFF2CC' }), rules).category).toBe('Restaurante');
    expect(categorize(tx({ description: 'pão' }), rules).category).toBe('Outros');
  });

  it('falls back to the type default', () => {
    expect(categorize(tx({ description: 'zzz' }), rules).category).toBe('Outros');
    expect(categorize(tx({ type: 'income', description: 'Aluguel' }), rules).category).toBe('Receita');
    expect(categorize(tx({ type: 'investment', description: 'ETF' }), rules).category).toBe('Investimento');
  });

  it('never overwrites a manual category', () => {
    const t = tx({ description: 'uber', category: 'Lazer', categorySource: 'manual' });
    expect(categorize(t, rules)).toBe(t);
  });

  it('merges rule tags without duplicates', () => {
    const r = [rule({ keyword: 'uber', category: 'Transporte', tags: ['trabalho', 'app'] })];
    expect(categorize(tx({ description: 'uber', tags: ['app'] }), r).tags).toEqual(['app', 'trabalho']);
  });

  it('does not mutate its input', () => {
    const t = tx({ description: 'uber' });
    categorize(t, rules);
    expect(t.category).toBe('');
  });

  it('applyRules re-categorises auto entries only', () => {
    const out = applyRules(
      [tx({ description: 'uber', category: 'Outros' }), tx({ description: 'uber', category: 'Lazer', categorySource: 'manual' })],
      [rule({ keyword: 'uber', category: 'Transporte' })],
    );
    expect(out.map((t) => t.category)).toEqual(['Transporte', 'Lazer']);
  });
});

describe('defaultRules', () => {
  const rules = defaultRules();

  it('only targets known categories', () => {
    for (const r of rules) expect(CATEGORIES).toContain(r.category);
  });

  it('has unique ids', () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('ranks exact labels above keywords', () => {
    expect(rules.filter((r) => r.exact).every((r) => r.priority > 10)).toBe(true);
  });
});

describe('suggestKeyword / makeRule', () => {
  it('suggests the longest meaningful word', () => {
    expect(suggestKeyword('Jantar no Restaurante 2026')).toBe('restaurante');
    expect(suggestKeyword('(sem descrição)')).toBe('');
    expect(suggestKeyword('de da 12')).toBe('');
  });

  it('builds a mid-priority rule from a trimmed keyword', () => {
    expect(makeRule('  sushi ', 'Restaurante')).toMatchObject({ keyword: 'sushi', category: 'Restaurante', priority: 50 });
    expect(makeRule('a', 'b').id).not.toBe(makeRule('a', 'b').id);
  });
});
