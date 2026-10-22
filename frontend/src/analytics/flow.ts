import { TYPE_LABELS, type Transaction, type TxType } from '@finance/shared';
import { round2 } from '../util';
import { daysInMonth } from './bills';
import { typicalDailyFlexible } from './insights';

export interface PaceDay {
  day: number;
  /** Variable + additional spent up to this day; null after today. */
  actual: number | null;
  /** The typical month's pace (earlier months, spread evenly over their days). */
  typical: number | null;
  /** Where this month lands at the typical pace from today on; null before today. */
  projected: number | null;
}

export interface MonthPace {
  days: PaceDay[];
  isCurrent: boolean;
  /** Spent so far minus the typical amount by today (positive = ahead of the usual pace). */
  aheadBy: number | null;
}

/**
 * "Ritmo do mês": day-to-day spending (variable + additional; fixed bills land in a lump and
 * would hide the pace) accumulated over the month, against the typical month. Entries without
 * a date count from day 1.
 */
export function monthPace(txs: Transaction[], year: number, month: number, today: Date): MonthPace {
  const dim = daysInMonth(year, month);
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;
  const lastDay = isCurrent ? today.getDate() : dim;
  const perDay = new Array<number>(dim + 1).fill(0);
  for (const t of txs) {
    if (t.month !== month || (t.type !== 'variable' && t.type !== 'additional')) continue;
    const day = t.date ? Math.min(dim, Math.max(1, Number(t.date.slice(8, 10)) || 1)) : 1;
    perDay[day] += t.amount;
  }
  const typicalDaily = typicalDailyFlexible(txs, year, month);
  const days: PaceDay[] = [];
  let running = 0;
  let atToday = 0;
  for (let day = 1; day <= dim; day++) {
    running += perDay[day];
    if (day === lastDay) atToday = running;
    days.push({
      day,
      actual: day <= lastDay ? round2(running) : null,
      typical: typicalDaily === null ? null : round2(typicalDaily * day),
      projected: null,
    });
  }
  if (isCurrent && typicalDaily !== null) {
    for (const d of days) if (d.day >= lastDay) d.projected = round2(atToday + typicalDaily * (d.day - lastDay));
  }
  const aheadBy = typicalDaily === null ? null : round2(atToday - typicalDaily * lastDay);
  return { days, isCurrent, aheadBy };
}

export interface FlowNode {
  name: string;
  /** Expense/investment type the node belongs to (drives its colour); null = income, reserve, left over. */
  kind: TxType | 'source' | 'left';
}

export interface MoneyFlow {
  nodes: FlowNode[];
  links: { source: number; target: number; value: number }[];
  income: number;
  /** Spent + invested above the month's income (taken from savings). */
  deficit: number;
  leftOver: number;
}

const FLOW_TYPES: TxType[] = ['fixed', 'variable', 'additional', 'investment'];

/**
 * "Fluxo do dinheiro" (a Sankey): the month's income splits into fixed, variable, additional,
 * invested and left over; each expense type then splits into its largest categories (the rest
 * folds into "Outras"). When spending beats income, the gap enters as "Tirado da reserva".
 */
export function moneyFlow(txs: Transaction[], month: number, perType = 4): MoneyFlow | null {
  const inMonth = txs.filter((t) => t.month === month && t.amount > 0);
  const income = round2(inMonth.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0));
  const byType = new Map<TxType, Map<string, number>>();
  for (const t of inMonth) {
    if (t.type === 'income') continue;
    const cats = byType.get(t.type) ?? new Map<string, number>();
    const category = t.category || 'Sem categoria';
    cats.set(category, (cats.get(category) ?? 0) + t.amount);
    byType.set(t.type, cats);
  }
  const typeTotal = (type: TxType) => round2([...(byType.get(type)?.values() ?? [])].reduce((a, b) => a + b, 0));
  const out = round2(FLOW_TYPES.reduce((a, type) => a + typeTotal(type), 0));
  if (income === 0 && out === 0) return null;

  const nodes: FlowNode[] = [];
  const links: MoneyFlow['links'] = [];
  const node = (name: string, kind: FlowNode['kind']) => nodes.push({ name, kind }) - 1;
  const deficit = round2(Math.max(0, out - income));
  const leftOver = round2(Math.max(0, income - out));

  // One source feeds the types directly; with a deficit both sources meet in "Total do mês".
  const incomeNode = income > 0 ? node(TYPE_LABELS.income, 'source') : -1;
  let hub = incomeNode;
  if (deficit > 0) {
    const reserve = node('Tirado da reserva', 'source');
    if (incomeNode >= 0) {
      hub = node('Total do mês', 'source');
      links.push({ source: incomeNode, target: hub, value: income });
      links.push({ source: reserve, target: hub, value: deficit });
    } else hub = reserve;
  }

  for (const type of FLOW_TYPES) {
    const total = typeTotal(type);
    if (total <= 0) continue;
    const typeNode = node(TYPE_LABELS[type], type);
    links.push({ source: hub, target: typeNode, value: total });
    if (type === 'investment') continue;
    const cats = [...byType.get(type)!.entries()].sort((a, b) => b[1] - a[1]);
    const shown = cats.length > perType + 1 ? cats.slice(0, perType) : cats;
    const rest = round2(cats.slice(shown.length).reduce((a, [, v]) => a + v, 0));
    for (const [category, value] of shown) links.push({ source: typeNode, target: node(category, type), value: round2(value) });
    if (rest > 0) links.push({ source: typeNode, target: node(`Outras (${TYPE_LABELS[type].toLowerCase()})`, type), value: rest });
  }
  if (leftOver > 0) links.push({ source: hub, target: node('Sobrou', 'left'), value: leftOver });
  return { nodes, links, income, deficit, leftOver };
}
