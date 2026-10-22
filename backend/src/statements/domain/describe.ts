import { normalize } from '@finance/shared';

export type MovementKind = 'purchase' | 'direct-debit' | 'fee' | 'transfer-out' | 'transfer-in' | 'cash' | 'other';

export interface Movement {
  kind: MovementKind;
  /** A readable description for the entry: "Continente Bag Monte", "Transferência para Ana Lima". */
  description: string;
  /** Who the money went to or came from, for transfers. */
  counterparty?: string;
}

const FEES: [RegExp, string][] = [
  [/^COM\.? ?CONTA\b/i, 'Comissão da conta'],
  [/^IMPOSTO (DO )?SELO\b/i, 'Imposto do selo'],
  [/^CUSTO DE SERVICO INTERNACIONAL\b/i, 'Custo de serviço internacional'],
];

/** Merchants whose statement name reads badly. */
const NAMES: [RegExp, string][] = [
  [/^UBR\b|UBER\.COM/i, 'Uber'],
  [/^APPLE\.COM\b/i, 'Apple'],
  [/^ANTHROPIC\b/i, 'Claude (Anthropic)'],
  [/^WWW\.AMAZON\b|^AMAZON\b/i, 'Amazon'],
  [/^GRACIEBARRA/i, 'Gracie Barra'],
  [/^CARREGAMENTOS VODAFO/i, 'Carregamento Vodafone'],
  [/^TIP PORTO\b/i, 'Andante (TIP Porto)'],
];

const COUNTRIES = new Set(['PT', 'PORT', 'IE', 'NL', 'LU', 'ES', 'FR', 'DE', 'GB', 'UK', 'US', 'BE', 'IT']);

/** What kind of movement a line of the statement is, and how to name it. */
export function describeMovement(raw: string, direction: 'debit' | 'credit'): Movement {
  const text = raw.replace(/\s+/g, ' ').trim();
  const fee = FEES.find(([pattern]) => pattern.test(text));
  if (fee) return { kind: 'fee', description: fee[1] };

  const purchase = /^COMPRA \d{4} (.+)$/.exec(text);
  if (purchase) return { kind: 'purchase', description: merchantName(purchase[1]) };

  const debit = /^DD (.+)$/.exec(text);
  if (debit) return { kind: 'direct-debit', description: merchantName(debit[1]) };

  const incoming = /^TRF\.? P\/O (.+)$/.exec(text);
  if (incoming) return { kind: 'transfer-in', description: `Transferência de ${person(incoming[1])}`, counterparty: person(incoming[1]) };

  const outgoing = /^TRF(?: MB WAY)? P\/ (.+)$/.exec(text);
  if (outgoing) {
    const via = /MB WAY/.test(text) ? ' (MB WAY)' : '';
    return { kind: 'transfer-out', description: `Transferência para ${person(outgoing[1])}${via}`, counterparty: person(outgoing[1]) };
  }
  if (/^TRANSFERENCIA\b/i.test(text)) {
    const kind = direction === 'credit' ? 'transfer-in' : 'transfer-out';
    return { kind, description: titleCase(text.replace(/:\S*$/, '').replace(/^TRANSFERENCIA/i, 'Transferência')) };
  }
  if (/^LEVANTAMENTO\b/.test(text)) return { kind: 'cash', description: 'Levantamento' };
  return { kind: 'other', description: merchantName(text) };
}

/** "CONTINENTE 4435-665 BAG MONTE" → "Continente Bag Monte": postal codes, references, countries and the exchange rate go. */
function merchantName(text: string): string {
  const named = NAMES.find(([pattern]) => pattern.test(text));
  if (named) return named[1];
  const words = text
    .replace(/\s[A-Z]{3} TC\s+[\d.,]+$/, '')
    .replace(/\bCONTACTLESS\b/g, '')
    .replace(/^MB ?WAY\s*-\s*/, '')
    .replace(/\b\d{4}-\d{3}\b/g, '')
    .split(' ')
    .filter((w) => w && !COUNTRIES.has(w) && !/^\d{6,}$/.test(w) && !/^PT\d{6,}$/.test(w));
  return titleCase(words.join(' ')) || text;
}

/** "LEONARDO CARVALHO TEREZA" → "Leonardo Carvalho Tereza"; "ATTICA CLINIC SERVICOS MEDICOS,LDA" keeps its words. */
function person(name: string): string {
  return titleCase(name.replace(/\s+/g, ' ').trim());
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** The holder's names are all in the counterparty ("Daniel Dos Reis Braz" for "DANIEL REIS BRAZ"). */
export function isHolder(counterparty: string | undefined, holder: string | null): boolean {
  if (!counterparty || !holder) return false;
  const names = new Set(normalize(counterparty).split(' '));
  const wanted = normalize(holder).split(' ').filter((w) => !SMALL.has(w));
  return wanted.length >= 2 && wanted.every((w) => names.has(w));
}
