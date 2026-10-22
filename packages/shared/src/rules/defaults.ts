import type { CategoryRule } from '../types.js';

export const CATEGORIES = [
  'Mercado', 'Restaurante', 'Viagem', 'Transporte', 'Presentes', 'Saúde', 'Lazer',
  'Assinaturas', 'Casa', 'Educação', 'Família', 'Compras', 'Receita', 'Investimento', 'Outros',
];

/** Fallbacks when no rule matches. */
export const TYPE_DEFAULT_CATEGORY = {
  income: 'Receita',
  investment: 'Investimento',
  fixed: 'Outros',
  variable: 'Outros',
  additional: 'Outros',
} as const;

// Fixed-expense row labels: exact match, high priority.
const EXACT: Record<string, string> = {
  Aluguel: 'Casa',
  'Energia + Gas': 'Casa',
  VODA: 'Casa',
  MEO: 'Casa',
  Indaqua: 'Casa',
  Mercado: 'Mercado',
  Mãe: 'Família',
  Pai: 'Família',
  'Passe Metro': 'Transporte',
  Academia: 'Saúde',
  'Jiu Jitsu': 'Saúde',
  Psicóloga: 'Saúde',
  Dentista: 'Saúde',
  English: 'Educação',
  Claude: 'Assinaturas',
  chatgpt: 'Assinaturas',
  Cursor: 'Assinaturas',
  Youtube: 'Assinaturas',
  Netflix: 'Assinaturas',
  Spotify: 'Assinaturas',
  'Globo Play': 'Assinaturas',
  iCloud: 'Assinaturas',
  'Boas ações': 'Presentes',
};

// Keywords for free-text (variable expense) descriptions.
// Whole words by default; a trailing "*" matches a stem (see ruleMatches).
const KEYWORDS: Record<string, string[]> = {
  Mercado: ['mercado', 'super', 'supermercado', 'continente', 'pingo doce', 'lidl', 'aldi', 'auchan', 'minipreco'],
  Restaurante: ['jantar*', 'almoco*', 'cafe', 'sushi', 'pizza*', 'brunch', 'burger', 'restaurante', 'sandes', 'brej*', 'feijoada', 'picanha', 'sobremesa*', 'bk', 'comida*', 'burguer', 'bar'],
  Viagem: ['passage*', 'viage*', 'hostel', 'hotel', 'airbnb', 'voo', 'aviao', 'eurotrip', 'euro trip', 'trip', 'malaga', 'sevilha', 'madri', 'dublin', 'vienna', 'budapest'],
  Transporte: ['uber', 'bolt', 'metro', 'bus', 'comboio', 'gasolina', 'bike'],
  Presentes: ['presente*', 'flores', 'dia das maes', 'dias das maes', 'natal'],
  Saúde: ['consulta*', 'medic*', 'dentista', 'tratamento*', 'exame*', 'farmacia', 'finasterida', 'suplemento*', 'pomada', 'curativo*', 'psicolog*', 'gym', 'jiu jitsu', 'academia'],
  Lazer: ['role*', 'festa*', 'cinema', 'show', 'jogo*', 'surf', 'date', 'datezin*', 'kung fu', 'whiskey'],
  Assinaturas: ['netflix', 'spotify', 'youtube', 'icloud', 'chatgpt', 'claude', 'cursor', 'globo', 'linkedin'],
  Casa: ['ikea', 'aluguel', 'renda', 'energia', 'agua', 'internet', 'panela*', 'espelho', 'casa'],
  Educação: ['curso*', 'livro*', 'english', 'ingles', 'escola'],
  Compras: ['roupa*', 'tenis', 'jaqueta*', 'jacket', 'calca*', 'sapato*', 'vinted', 'temu', 'perfume*', 'macbook', 'cabo', 'plug', 'oculos', 'aliancas', 'barbe*', 'cabelo'],
};

export function defaultRules(): CategoryRule[] {
  const rules: CategoryRule[] = [];
  for (const [keyword, category] of Object.entries(EXACT)) {
    rules.push({ id: `seed-exact-${keyword}`, keyword, category, exact: true, priority: 100 });
  }
  for (const [category, words] of Object.entries(KEYWORDS)) {
    for (const keyword of words) {
      rules.push({ id: `seed-${category}-${keyword}`, keyword, category, priority: 10 });
    }
  }
  return rules;
}
