import type { Transaction, TxType } from '../types';
import { round2 } from '../util';

export type MonthlyTotals = Record<TxType, number[]>;

const zeros = () => new Array<number>(12).fill(0);

export function totalsByType(txs: Transaction[]): MonthlyTotals {
  const out: MonthlyTotals = { income: zeros(), investment: zeros(), fixed: zeros(), variable: zeros(), additional: zeros() };
  for (const t of txs) out[t.type][t.month - 1] += t.amount;
  for (const k of Object.keys(out) as TxType[]) out[k] = out[k].map(round2);
  return out;
}

export function expenseTotals(t: MonthlyTotals): number[] {
  return t.fixed.map((v, i) => round2(v + t.variable[i] + t.additional[i]));
}

/** Same as the sheet: Receita − (Despesa Total + Investimentos). */
export function saldo(t: MonthlyTotals): number[] {
  const exp = expenseTotals(t);
  return t.income.map((v, i) => round2(v - (exp[i] + t.investment[i])));
}

export function cumulative(values: number[]): number[] {
  let acc = 0;
  return values.map((v) => (acc = round2(acc + v)));
}

export interface GridRow {
  key: string;
  label: string;
  type: TxType;
  /** per month: the transactions in that cell */
  cells: Transaction[][];
}

/**
 * Rows for the spreadsheet-like grid. Labeled sections get one row per description
 * (in first-seen order); variable expenses get one row per position in the month column.
 */
export function monthlyGrid(txs: Transaction[], type: TxType): GridRow[] {
  const ofType = txs.filter((t) => t.type === type);
  if (type === 'variable') {
    const byMonth = Array.from({ length: 12 }, (_, m) =>
      ofType.filter((t) => t.month === m + 1).sort(byRow),
    );
    const height = Math.max(0, ...byMonth.map((c) => c.length));
    return Array.from({ length: height }, (_, i) => ({
      key: `variable-${i}`,
      label: '',
      type,
      cells: byMonth.map((c) => (c[i] ? [c[i]] : [])),
    }));
  }
  const rows = new Map<string, GridRow>();
  for (const t of [...ofType].sort(byRow)) {
    let row = rows.get(t.description);
    if (!row) {
      row = { key: `${type}-${t.description}`, label: t.description, type, cells: Array.from({ length: 12 }, () => []) };
      rows.set(t.description, row);
    }
    row.cells[t.month - 1].push(t);
  }
  return [...rows.values()];
}

function rowOf(t: Transaction): number {
  const m = t.source ? /\d+$/.exec(t.source.cell) : null;
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

function byRow(a: Transaction, b: Transaction): number {
  return rowOf(a) - rowOf(b) || a.id.localeCompare(b.id);
}
