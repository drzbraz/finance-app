import type { CategoryRule } from '@finance/shared';

/**
 * Merchants as they appear on Portuguese card statements. They only apply when none of the
 * user's rules matches (those always win), so they never change how the sheet is categorised.
 */
const MERCHANTS: Record<string, string[]> = {
  Mercado: ['continente', 'pingo doce', 'lidl', 'aldi', 'auchan', 'minipreco', 'mercadona', 'intermarche', 'celeiro', 'woori market', 'spar', 'froiz'],
  Restaurante: ['llaollao', 'daruma*', 'mcdonalds', 'burger king', 'telepizza', 'pastelaria', 'padaria', 'starbucks', 'h3', 'vitaminas', 'glovo', 'uber eats', 'bolt food'],
  Transporte: ['uber', 'ubr', 'bolt', 'tip', 'andante', 'metro do porto', 'cp', 'comboios', 'rne', 'flixbus', 'galp', 'repsol', 'bp', 'est servico', 'via verde', 'prio'],
  Saúde: ['solinca', 'graciebarra*', 'gracie barra', 'farmacia', 'wells', 'clinic*', 'clinica', 'hospital', 'cuf', 'lusiadas', 'fitness', 'ginasio'],
  Lazer: ['cinemas', 'nos cinemas', 'cinema city', 'ticketline', 'bol', 'blueticket', 'steam', 'playstation'],
  Assinaturas: ['apple.com', 'itunes', 'anthropic', 'openai', 'google', 'netflix', 'spotify', 'disney', 'hbo', 'prime video'],
  Casa: ['ikea', 'leroy merlin', 'aki', 'vodafo*', 'vodafone', 'meo', 'nos comunicacoes', 'edp', 'goldenergy', 'indaqua', 'worten'],
  Compras: ['amazon', 'zara', 'primark', 'decathlon', 'fnac', 'vinted', 'temu', 'shein', 'aliexpress', 'normal', 'tiger', 'el corte ingles'],
  Educação: ['bertrand', 'udemy', 'coursera'],
};

export const MERCHANT_RULES: CategoryRule[] = Object.entries(MERCHANTS).flatMap(([category, keywords]) =>
  keywords.map((keyword) => ({ id: `merchant-${keyword}`, keyword, category, priority: -1 })),
);
