import type { Budget, RecurringItem, Settings, Transaction } from '../types';
import { eur, pct, round2 } from '../util';
import { totalsByType } from './aggregate';
import { billsForMonth, daysInMonth } from './bills';
import { budgetStatus } from './budgets';
import { categoryDeviation, isExpense, savingsRate } from './metrics';

export interface MonthForecast {
  /** True only for the current month; past/future months report actuals. */
  isForecast: boolean;
  spentSoFar: number; // all expenses recorded
  projectedSpend: number;
  projectedIncome: number;
  projectedInvestment: number;
  projectedSaldo: number;
  /** Recurring amounts expected but not recorded yet, included in the projection. */
  expectedRecurring: number;
}

/**
 * Month-end projection. Variable and additional spending is extrapolated at the pace so far
 * (spent ÷ days elapsed × days in month); fixed bills, income and investments use what is
 * recorded plus the expected amount of active recurring items not recorded yet.
 */
export function forecastMonth(
  txs: Transaction[],
  recurring: RecurringItem[],
  year: number,
  month: number,
  today: Date,
): MonthForecast {
  const inMonth = txs.filter((t) => t.month === month);
  const sum = (f: (t: Transaction) => boolean) => inMonth.filter(f).reduce((a, t) => a + t.amount, 0);
  const spentSoFar = round2(sum(isExpense));
  const income = sum((t) => t.type === 'income');
  const investment = sum((t) => t.type === 'investment');
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;
  if (!isCurrent) {
    return {
      isForecast: false,
      spentSoFar,
      projectedSpend: spentSoFar,
      projectedIncome: round2(income),
      projectedInvestment: round2(investment),
      projectedSaldo: round2(income - spentSoFar - investment),
      expectedRecurring: 0,
    };
  }

  const elapsed = today.getDate();
  const dim = daysInMonth(year, month);
  const flexible = sum((t) => t.type === 'variable' || t.type === 'additional');
  const fixed = sum((t) => t.type === 'fixed');
  const missing = recurring.filter(
    (r) => r.active && !inMonth.some((t) => t.type === r.type && t.description === r.description),
  );
  const expected = (type: string) => missing.filter((r) => r.type === type).reduce((a, r) => a + (r.expectedAmount ?? 0), 0);

  const projectedSpend = round2(fixed + expected('fixed') + (flexible / elapsed) * dim);
  const projectedIncome = round2(income + expected('income'));
  const projectedInvestment = round2(investment + expected('investment'));
  return {
    isForecast: true,
    spentSoFar,
    projectedSpend,
    projectedIncome,
    projectedInvestment,
    projectedSaldo: round2(projectedIncome - projectedSpend - projectedInvestment),
    expectedRecurring: round2(expected('fixed') + expected('income') + expected('investment')),
  };
}

export type InsightTone = 'good' | 'info' | 'warning' | 'bad';

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: string;
  title: string;
  detail?: string;
  /** Higher = shown first. */
  weight: number;
}

export interface InsightInput {
  txs: Transaction[];
  budgets: Budget[];
  recurring: RecurringItem[];
  settings: Settings;
  year: number;
  month: number;
  today: Date;
}

/** Plain-language cards for the home page, most important first. */
export function insights({ txs, budgets, recurring, settings, year, month, today }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const forecast = forecastMonth(txs, recurring, year, month, today);

  if (forecast.isForecast) {
    const negative = forecast.projectedSaldo < 0;
    out.push({
      id: 'forecast',
      tone: negative ? 'warning' : 'good',
      icon: negative ? '📉' : '📈',
      title: negative
        ? `No ritmo atual, o mês fecha em ${eur.format(forecast.projectedSaldo)}`
        : `No ritmo atual, sobram ${eur.format(forecast.projectedSaldo)} no fim do mês`,
      detail: `Previsão de gastos: ${eur.format(forecast.projectedSpend)} (até agora ${eur.format(forecast.spentSoFar)}).`,
      weight: negative ? 90 : 40,
    });
  }

  const overdue = billsForMonth(txs, recurring, year, month, today).filter((b) => b.bucket === 'overdue');
  if (overdue.length) {
    out.push({
      id: 'overdue',
      tone: 'bad',
      icon: '⏰',
      title: overdue.length === 1 ? `${overdue[0].item.description} está atrasada` : `${overdue.length} contas atrasadas`,
      detail: overdue.slice(0, 3).map((b) => `${b.item.description} ${eur.format(b.amount)}`).join(' · '),
      weight: 100,
    });
  }

  for (const b of budgetStatus(txs, budgets, month)) {
    if (b.state === 'ok') continue;
    out.push({
      id: `budget-${b.category}`,
      tone: b.state === 'over' ? 'bad' : 'warning',
      icon: b.state === 'over' ? '🚨' : '⚠️',
      title:
        b.state === 'over'
          ? `${b.category} passou do orçamento em ${eur.format(-b.remaining)}`
          : `${b.category} já usou ${pct.format(b.pct)} do orçamento`,
      detail: `${eur.format(b.spent)} de ${eur.format(b.limit)}`,
      weight: b.state === 'over' ? 80 : 60,
    });
  }

  for (const d of categoryDeviation(txs, month)) {
    if (!d.flagged || d.deviation === null || d.current <= 0 || d.average < 20) continue;
    const up = d.deviation > 0;
    out.push({
      id: `dev-${d.category}`,
      tone: up ? 'warning' : 'good',
      icon: up ? '🔺' : '🔻',
      title: `${d.category} está ${pct.format(Math.abs(d.deviation))} ${up ? 'acima' : 'abaixo'} da sua média`,
      detail: `${eur.format(d.current)} este mês vs média de ${eur.format(d.average)}.`,
      weight: up ? 50 + Math.min(20, d.deviation * 10) : 20,
    });
  }

  const rate = savingsRate(totalsByType(txs))[month - 1];
  if (rate !== null && rate !== undefined) {
    const hit = rate >= settings.savingsRateTarget;
    out.push({
      id: 'savings',
      tone: hit ? 'good' : 'info',
      icon: hit ? '🎯' : '💡',
      title: hit
        ? `Você investiu ${pct.format(rate)} da receita, acima da meta de ${pct.format(settings.savingsRateTarget)}`
        : `Taxa de poupança em ${pct.format(rate)}; a meta é ${pct.format(settings.savingsRateTarget)}`,
      weight: hit ? 30 : 45,
    });
  }

  const biggest = txs.filter((t) => isExpense(t) && t.month === month).sort((a, b) => b.amount - a.amount)[0];
  if (biggest) {
    out.push({
      id: 'biggest',
      tone: 'info',
      icon: '🧾',
      title: `Maior gasto do mês: ${biggest.description}`,
      detail: `${eur.format(biggest.amount)} · ${biggest.category}`,
      weight: 10,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
