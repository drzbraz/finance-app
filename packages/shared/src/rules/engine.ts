import { isLightYellow } from '../text/color.js';
import { normalize } from '../text/normalize.js';
import type { CategoryRule, Transaction } from '../types.js';
import { newId } from '../ids.js';
import { TYPE_DEFAULT_CATEGORY } from './defaults.js';

/**
 * Whole-word match, so "bus" does not hit "business". A trailing "*" makes it a stem:
 * "psicolog*" hits "psicologa" and "psicologo". Case and accents are ignored.
 */
export function ruleMatches(rule: CategoryRule, description: string): boolean {
  const text = normalize(description);
  const prefix = rule.keyword.trim().endsWith('*');
  const kw = normalize(rule.keyword.replace(/\*\s*$/, ''));
  if (!kw) return false;
  if (rule.exact) return text === kw;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = prefix ? '' : '(?=$|[^\\p{L}\\p{N}])';
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}${end}`, 'u').test(text);
}

/** Highest priority wins; among equal priority, the longest keyword (most specific). */
export function findRule(rules: CategoryRule[], description: string): CategoryRule | undefined {
  let best: CategoryRule | undefined;
  for (const r of rules) {
    if (!ruleMatches(r, description)) continue;
    if (!best || r.priority > best.priority || (r.priority === best.priority && r.keyword.length > best.keyword.length)) {
      best = r;
    }
  }
  return best;
}

export function categorize(tx: Transaction, rules: CategoryRule[]): Transaction {
  if (tx.categorySource === 'manual') return tx;
  if (tx.type === 'income' || tx.type === 'investment') {
    return { ...tx, category: TYPE_DEFAULT_CATEGORY[tx.type] };
  }
  const rule = findRule(rules, tx.description);
  const tags = rule?.tags?.length ? [...new Set([...tx.tags, ...rule.tags])] : tx.tags;
  // The yellow sub-block is groceries unless a keyword says otherwise.
  const fallback = tx.subgroup && isLightYellow(tx.subgroup) ? 'Mercado' : TYPE_DEFAULT_CATEGORY[tx.type];
  return { ...tx, category: rule?.category ?? fallback, tags };
}

/** Re-runs rules on every automatically categorised transaction; manual choices are kept. */
export function applyRules(txs: Transaction[], rules: CategoryRule[]): Transaction[] {
  return txs.map((t) => categorize(t, rules));
}

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'para', 'com', 'e', 'a', 'o', 'the', 'sem', 'descricao']);

/** Keyword suggested in the "Create rule?" prompt: the longest meaningful word. */
export function suggestKeyword(description: string): string {
  const words = normalize(description)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return words.sort((a, b) => b.length - a.length)[0] ?? '';
}

export function makeRule(keyword: string, category: string): CategoryRule {
  return { id: newId('rule'), keyword: keyword.trim(), category, priority: 50 };
}
