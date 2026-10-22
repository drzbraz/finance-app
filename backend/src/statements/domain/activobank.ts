import type { PdfItem, PdfLine } from './pdf-lines.js';

/** One movement as printed: what the bank wrote, and which column the amount is in. */
export interface StatementEntry {
  date: string; // ISO yyyy-mm-dd (the "DATA LANC." column)
  raw: string;
  amount: number;
  direction: 'debit' | 'credit';
  /** The printed balance matches the previous balance ± this amount. */
  balanceOk: boolean;
}

export interface ParsedStatement {
  bank: string;
  /** The account holder, as in the address block; used to spot transfers between my own accounts. */
  holder: string | null;
  from: string;
  to: string;
  entries: StatementEntry[];
}

export class UnknownStatementError extends Error {}

const DATE = /^(\d{1,2})\.(\d{2})$/;
const MONEY = /^-?\d{1,3}(?: \d{3})*\.\d{2}-?$/;
const PERIOD = /EXTRATO DE (\d{4})\/(\d{2})\/(\d{2}) A (\d{4})\/(\d{2})\/(\d{2})/;
const HOLDER = /^#S#\s+([\p{L} ]+?)\s+#E#$/u;

export const isActivoBank = (lines: PdfLine[]): boolean => lines.some((l) => /ActivoBank|ACTVPTPL/.test(l.text));

interface Columns {
  debit: number;
  credit: number;
  balance: number;
}

interface Amount {
  value: number;
  x: number;
  right: number;
}

/**
 * ActivoBank's "Extrato Combinado": a table with DATA LANC. / DATA VALOR (as M.DD), DESCRITIVO,
 * DEBITO, CREDITO and SALDO. The column comes from where the amount sits under the headers, and
 * each line is checked against the running balance. Thousands are separated by a space ("2 500.00").
 */
export function parseActivoBank(lines: PdfLine[]): ParsedStatement {
  const period = lines.map((l) => PERIOD.exec(l.text)).find(Boolean);
  if (!period) throw new UnknownStatementError('Statement period ("EXTRATO DE … A …") not found');
  const [, fy, fm, fd, ty, tm, td] = period;
  const from = `${fy}-${fm}-${fd}`;
  const to = `${ty}-${tm}-${td}`;
  const holder = lines.map((l) => HOLDER.exec(l.text)?.[1]).find((name) => name && name.split(' ').length >= 2) ?? null;

  const entries: StatementEntry[] = [];
  let columns: Columns | null = null;
  let balance: number | null = null;
  for (const line of lines) {
    const header = headerColumns(line);
    if (header) {
      columns = header;
      continue;
    }
    if (!columns) continue;
    const amounts = amountsOf(line.items, columns);
    if (/^SALDO INICIAL\b/.test(line.text)) {
      balance = amounts.find((a) => column(a, columns!) === 'balance')?.value ?? balance;
      continue;
    }
    const [first, second] = line.items;
    const launched = first && DATE.exec(first.text);
    if (!launched || !second || !DATE.test(second.text)) continue;
    const moved = amounts.find((a) => column(a, columns!) !== 'balance');
    if (!moved) continue;
    const direction = column(moved, columns) === 'credit' ? 'credit' : 'debit';
    const printed = amounts.find((a) => a !== moved && column(a, columns!) === 'balance')?.value ?? null;
    const expected = balance === null ? null : round2(balance + (direction === 'credit' ? moved.value : -moved.value));
    const balanceOk = printed === null || expected === null || Math.abs(printed - expected) < 0.005;
    balance = printed ?? expected;
    const description = line.items.slice(2).filter((i) => i.right <= moved.x && !amounts.some((a) => a.x <= i.x && i.right <= a.right));
    entries.push({
      date: isoDate(Number(launched[1]), Number(launched[2]), from, to),
      raw: description.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim(),
      amount: moved.value,
      direction,
      balanceOk,
    });
  }
  if (!columns) throw new UnknownStatementError('Movements table (DEBITO / CREDITO / SALDO) not found');
  return { bank: 'ActivoBank', holder, from, to, entries };
}

function headerColumns(line: PdfLine): Columns | null {
  const at = (label: string) => line.items.find((i) => i.text === label)?.right;
  const debit = at('DEBITO');
  const credit = at('CREDITO');
  const balance = at('SALDO');
  return debit !== undefined && credit !== undefined && balance !== undefined ? { debit, credit, balance } : null;
}

/** Amounts are right-aligned under their header: the closest header's right edge wins. */
function column(amount: Amount, columns: Columns): keyof Columns {
  const distance = (key: keyof Columns) => Math.abs(columns[key] - amount.right);
  return (['debit', 'credit', 'balance'] as const).reduce((best, key) => (distance(key) < distance(best) ? key : best));
}

/**
 * Money in the amount columns. A thousands group comes as its own piece ("2", "500.00"), so
 * a 1–3 digit piece joins the next one; anything left of the debit column is description.
 */
function amountsOf(items: PdfItem[], columns: Columns): Amount[] {
  const left = columns.debit - 60;
  const amounts: Amount[] = [];
  let pending: PdfItem[] = [];
  const flush = () => {
    const text = pending.map((i) => i.text).join(' ');
    if (pending.length && MONEY.test(text)) {
      const negative = text.includes('-');
      const value = Number(text.replace(/[ -]/g, ''));
      amounts.push({ value: negative ? -value : value, x: pending[0].x, right: pending[pending.length - 1].right });
    }
    pending = [];
  };
  for (const item of items) {
    if (item.x < left || !/^-?[\d .]+-?$/.test(item.text)) {
      flush();
      continue;
    }
    const previous = pending[pending.length - 1];
    if (previous && (item.x - previous.right > 12 || !/^-?\d{1,3}$/.test(previous.text))) flush();
    pending.push(item);
  }
  flush();
  return amounts;
}

/** "9.01" in a statement from 2026/09/01 to 2026/09/30. A December–January statement spans two years. */
function isoDate(month: number, day: number, from: string, to: string): string {
  const fromYear = Number(from.slice(0, 4));
  const year = month < Number(from.slice(5, 7)) && Number(to.slice(0, 4)) > fromYear ? fromYear + 1 : fromYear;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
