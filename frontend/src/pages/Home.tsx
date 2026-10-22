import { TYPE_LABELS } from '@finance/shared';
import { useMemo, useState } from 'react';
import { cumulative, saldo, totalsByType } from '../analytics/aggregate';
import { mergeRecurring, upcomingBills } from '../analytics/bills';
import { budgetStatus } from '../analytics/budgets';
import { monthPace, moneyFlow } from '../analytics/flow';
import { freeToSpend } from '../analytics/free';
import { goalStatus } from '../analytics/goals';
import { forecastMonth, insights, type InsightTone } from '../analytics/insights';
import { byCategory, savingsRate, savingsRateYTD, topExpenses } from '../analytics/metrics';
import { categoryIcon } from '../categories';
import { CategoryBars, CumulativeChart, MoneyFlowChart, PaceChart, SavingsRateChart, SpendStackChart, type MonthRow } from '../components/charts';
import type { PageId } from '../components/layout/nav';
import { EmptyState, PaidCheck, ProgressBar } from '../components/ui';
import { useBudgets, useGoals, useSettings, useStoredRecurring, useToday, useYearTransactions } from '../hooks';
import type { ChartColors } from '../theme';
import { brl, eur, MONTH_LABELS, MONTH_NAMES, pct } from '../util';
import { saveTransactions } from '../api/repo';
import { pendingReceivables, receivableTotal } from '../analytics/receivables';
import { unusualCategories } from '../analytics/unusual';
import { FreeBreakdown, Kpi, Section } from '../components/home/parts';
import Receivables from '../components/Receivables';
import SpendCalendar from '../components/SpendCalendar';
import Unusual from '../components/Unusual';

interface Props {
  year: number;
  month: number;
  colors: ChartColors;
  onPage: (p: PageId) => void;
  onAdd: () => void;
  onImport: () => void;
  /** Opens Transações on one category of the month. */
  onCategory?: (category: string) => void;
}

const TONE: Record<InsightTone, string> = {
  good: 'border-good/30 bg-good/5',
  info: 'border-line bg-surface',
  warning: 'border-warn/30 bg-warn/5',
  bad: 'border-bad/30 bg-bad/5',
};

export default function Home({ year, month, colors, onPage, onAdd, onImport, onCategory }: Props) {
  const txs = useYearTransactions(year);
  // January compares with the end of last year.
  const lastYear = useYearTransactions(year - 1);
  const today = useToday();
  // "Próximas contas" is about today, whatever year is selected.
  const todayYear = today.getFullYear();
  const todayTxs = useYearTransactions(todayYear);
  const todayNextYear = useYearTransactions(todayYear + 1);
  const settings = useSettings();
  const budgets = useBudgets();
  const goals = useGoals();
  const stored = useStoredRecurring();
  const [catScope, setCatScope] = useState<'month' | 'year'>('month');
  const [showFree, setShowFree] = useState(false);

  const t = useMemo(() => totalsByType(txs), [txs]);
  const recurring = useMemo(() => mergeRecurring(txs, stored, month), [txs, stored, month]);
  const forecast = forecastMonth(txs, recurring, year, month, today);
  const free = freeToSpend(txs, recurring, budgets, year, month, today);
  const cards = insights({ txs, budgets, recurring, settings, year, month, today }).slice(0, 4);
  const rates = savingsRate(t);
  const ytd = savingsRateYTD(t, month);
  const bal = saldo(t);
  const cum = cumulative(bal);
  // Last month with real amounts: zero-amount placeholders do not extend the lines.
  const lastMonth = Math.max(0, ...txs.filter((x) => x.amount !== 0).map((x) => x.month));
  const budgetRows = budgetStatus(txs, budgets, month).slice(0, 4);
  // Only the upcoming card looks across the year boundary (late December → January).
  const todayRecurring = useMemo(() => mergeRecurring(todayTxs, stored, today.getMonth() + 1), [todayTxs, stored, today]);
  const upcoming = upcomingBills([...todayTxs, ...todayNextYear], todayRecurring, today).slice(0, 5);
  const mainGoal = goals[0] ? goalStatus(goals[0], settings, t, today) : null;
  const cats = byCategory(txs, catScope === 'month' ? month : undefined).slice(0, 8);
  const top = topExpenses(txs, month);
  const pace = monthPace(txs, year, month, today);
  const flow = moneyFlow(txs, month);
  const unusual = useMemo(() => unusualCategories([...lastYear, ...txs], year, month, today), [lastYear, txs, year, month, today]);
  const pending = pendingReceivables(txs);
  // A past month's saldo also waits for what others still owe from it.
  const monthSaldo = bal[month - 1] - receivableTotal(txs, month);
  const recent = [...txs].sort((a, b) => (b.updatedAt ?? b.date ?? '').localeCompare(a.updatedAt ?? a.date ?? '')).slice(0, 5);

  if (txs.length === 0) {
    return (
      <EmptyState
        icon="👋"
        title={`Nada em ${year} ainda`}
        text="Importe a planilha do Google Sheets (ou arraste o arquivo para esta janela), ou comece adicionando um lançamento."
        action={
          <div className="flex gap-2">
            <button className="btn-primary" onClick={onImport}>Importar planilha</button>
            <button className="btn" onClick={onAdd}>+ Novo lançamento</button>
          </div>
        }
      />
    );
  }

  const monthly: MonthRow[] = MONTH_LABELS.map((m, i) => ({
    month: m,
    rate: rates[i] === null ? null : Math.round(rates[i]! * 1000) / 10,
    fixed: t.fixed[i],
    variable: t.variable[i],
    additional: t.additional[i],
    investment: t.investment[i],
    cumulative: i < lastMonth ? cum[i] : null,
  }));
  const target = Math.round(settings.savingsRateTarget * 1000) / 10;
  const rate = rates[month - 1];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{MONTH_NAMES[month - 1]} {year}</h1>
        <p className="text-sm text-ink-2">{forecast.isForecast ? 'Mês em andamento: previsões com base no seu ritmo.' : 'Resumo do mês.'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {free.isCurrent ? (
          <button className="text-left" onClick={() => setShowFree(!showFree)} aria-expanded={showFree} title="Ver a conta">
            <Kpi
              label="Livre para gastar"
              value={eur.format(free.free)}
              sub={
                (free.perDay !== null ? `≈ ${eur.format(free.perDay)}/dia por ${free.daysLeft} dia(s)` : 'Você já passou do que tinha livre') +
                ' · ver a conta'
              }
              tone={free.free < 0 ? 'bad' : 'good'}
            />
          </button>
        ) : (
          <Kpi
            label="Saldo do mês"
            value={eur.format(monthSaldo)}
            sub={`Acumulado no ano: ${eur.format(cum[month - 1])}${monthSaldo !== bal[month - 1] ? ` · ${eur.format(bal[month - 1] - monthSaldo)} a receber` : ''}`}
            tone={monthSaldo < 0 ? 'bad' : 'good'}
          />
        )}
        <Kpi
          label="Gasto até agora"
          value={eur.format(forecast.spentSoFar)}
          sub={forecast.isForecast ? `Previsão para o mês: ${eur.format(forecast.projectedSpend)}` : `Receita: ${eur.format(t.income[month - 1])}`}
        />
        <Kpi
          label="Taxa de poupança"
          value={rate === null ? '—' : pct.format(rate)}
          sub={`No ano: ${ytd === null ? '—' : pct.format(ytd)} · meta ${pct.format(settings.savingsRateTarget)}`}
          tone={rate !== null && rate >= settings.savingsRateTarget ? 'good' : undefined}
        />
        <button className="text-left" onClick={() => onPage('goals')}>
          <Kpi
            label={mainGoal ? `Meta · ${mainGoal.goal.name}` : 'Metas'}
            value={mainGoal ? pct.format(mainGoal.progress) : 'Criar meta'}
            sub={
              mainGoal
                ? `${(mainGoal.goal.currency === 'BRL' ? brl : eur).format(mainGoal.current)} de ${(mainGoal.goal.currency === 'BRL' ? brl : eur).format(mainGoal.goal.target)}`
                : 'Defina um objetivo de poupança'
            }
          />
        </button>
      </div>

      {free.isCurrent && showFree && <FreeBreakdown free={free} />}

      {pending.length > 0 && (
        <Section title="A receber · Splitwise" action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => onPage('bills')}>Ver em Contas</button>}>
          <Receivables txs={txs} month={month} limit={4} onMore={() => onPage('bills')} />
        </Section>
      )}

      {cards.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className={`flex gap-3 rounded-2xl border p-4 ${TONE[c.tone]}`}>
              <span className="text-xl" aria-hidden>{c.icon}</span>
              <div>
                <p className="text-sm font-semibold">{c.title}</p>
                {c.detail && <p className="mt-0.5 text-xs text-ink-2">{c.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Orçamentos" action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => onPage('budgets')}>{budgetRows.length ? 'Ver todos' : 'Definir'}</button>}>
          {budgetRows.length === 0 ? (
            <p className="text-sm text-ink-2">Defina limites por categoria e acompanhe aqui. <button className="font-medium text-accent" onClick={() => onPage('budgets')}>Sugerir pela média →</button></p>
          ) : (
            <ul className="space-y-3">
              {budgetRows.map((b) => (
                <li key={b.category}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{categoryIcon(b.category)} {b.category}{b.state !== 'ok' && <span className={`ml-2 text-xs font-semibold ${b.state === 'over' ? 'text-bad' : 'text-warn'}`}>{b.state === 'over' ? '● estourou' : '● atenção'}</span>}</span>
                    <span className="num text-ink-2">{eur.format(b.spent)} / {eur.format(b.limit)}</span>
                  </div>
                  <ProgressBar value={b.pct} tone={b.state === 'over' ? 'bad' : b.state === 'warning' ? 'warn' : 'accent'} label={b.category} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Próximas contas" action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => onPage('bills')}>Ver contas</button>}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-2">Nada atrasado nem vencendo nos próximos 7 dias. ✓</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((b) => (
                <li key={b.item.key + (b.dueDate ?? '')} className="flex items-center gap-3 py-2">
                  <PaidCheck
                    checked={b.done}
                    label={`${b.item.description} pago`}
                    onChange={() => b.txs.length ? saveTransactions(b.txs.map((x) => ({ ...x, paid: true }))) : onPage('bills')}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{b.item.description}</p>
                    <p className={`text-xs ${b.bucket === 'overdue' ? 'text-bad' : 'text-ink-3'}`}>
                      {b.bucket === 'overdue' ? 'Atrasada' : 'Vence'}{b.dueDate ? ` · ${new Date(`${b.dueDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <span className="num text-sm">{eur.format(b.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Fora do normal · ${MONTH_NAMES[month - 1]}`}>
          <Unusual rows={unusual} isCurrent={free.isCurrent} onCategory={onCategory} />
        </Section>
        <Section title={`Calendário de gastos · ${MONTH_NAMES[month - 1]}`}>
          <SpendCalendar txs={txs} year={year} month={month} today={today} colors={colors} />
        </Section>
      </div>

      <Section title="Ritmo do mês · gastos do dia a dia">
        <p className="-mt-1 mb-2 text-sm text-ink-2">
          {pace.aheadBy === null
            ? 'Variáveis e adicionais acumulados no mês. Com meses anteriores lançados, aparece a comparação com o seu mês típico.'
            : Math.abs(pace.aheadBy) < 1
              ? `No ritmo de sempre ${pace.isCurrent ? 'até hoje' : 'neste mês'}.`
              : pace.aheadBy > 0
                ? `${eur.format(pace.aheadBy)} acima do seu mês típico ${pace.isCurrent ? 'até hoje' : 'no fim do mês'}.`
                : `${eur.format(-pace.aheadBy)} abaixo do seu mês típico ${pace.isCurrent ? 'até hoje' : 'no fim do mês'}.`}
        </p>
        <PaceChart data={pace.days} today={pace.isCurrent ? today.getDate() : null} colors={colors} />
      </Section>

      {flow && (
        <Section title={`Fluxo do dinheiro · ${MONTH_NAMES[month - 1]}`}>
          <p className="-mt-1 mb-2 text-sm text-ink-2">
            {flow.deficit > 0
              ? `Gastos e investimentos passaram a receita em ${eur.format(flow.deficit)}.`
              : `Da receita de ${eur.format(flow.income)}, sobraram ${eur.format(flow.leftOver)}.`}
          </p>
          <MoneyFlowChart flow={flow} colors={colors} />
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Para onde foi o dinheiro">
          <SpendStackChart data={monthly} colors={colors} />
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-ink-3">Ver em tabela</summary>
            <table className="num mt-2 w-full">
              <thead className="text-ink-3"><tr><th className="text-left">Mês</th><th className="text-right">Fixas</th><th className="text-right">Variáveis</th><th className="text-right">Adicionais</th><th className="text-right">Investido</th></tr></thead>
              <tbody>
                {monthly.filter((r) => r.fixed + r.variable + r.additional + r.investment > 0).map((r) => (
                  <tr key={r.month}><td>{r.month}</td><td className="text-right">{eur.format(r.fixed)}</td><td className="text-right">{eur.format(r.variable)}</td><td className="text-right">{eur.format(r.additional)}</td><td className="text-right">{eur.format(r.investment)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </Section>
        <Section
          title={`Gastos por categoria · ${catScope === 'month' ? MONTH_NAMES[month - 1] : year}`}
          action={
            <div className="flex gap-1">
              {(['month', 'year'] as const).map((s) => (
                <button key={s} className={`chip ${catScope === s ? 'chip-on' : ''}`} onClick={() => setCatScope(s)}>{s === 'month' ? 'Mês' : 'Ano'}</button>
              ))}
            </div>
          }
        >
          {cats.length ? <CategoryBars data={cats} colors={colors} /> : <p className="text-sm text-ink-2">Sem despesas neste período.</p>}
        </Section>
        <Section title="Taxa de poupança por mês">
          <SavingsRateChart data={monthly} target={target} colors={colors} />
        </Section>
        <Section title="Saldo acumulado no ano">
          <CumulativeChart data={monthly} colors={colors} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Maiores gastos · ${MONTH_NAMES[month - 1]}`}>
          <ol className="space-y-2">
            {top.map((x) => (
              <li key={x.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-2" aria-hidden>{categoryIcon(x.category)}</span>
                <span className="flex-1 truncate">{x.description}<span className="block text-xs text-ink-3">{x.category}</span></span>
                <span className="num font-medium">{eur.format(x.amount)}</span>
              </li>
            ))}
            {!top.length && <li className="text-sm text-ink-2">Sem despesas neste mês.</li>}
          </ol>
        </Section>
        <Section title="Últimos lançamentos" action={<button className="btn-ghost px-2 py-1 text-xs" onClick={() => onPage('transactions')}>Ver todos</button>}>
          <ul className="space-y-2">
            {recent.map((x) => (
              <li key={x.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-2" aria-hidden>{categoryIcon(x.category)}</span>
                <span className="flex-1 truncate">{x.description}<span className="block text-xs text-ink-3">{TYPE_LABELS[x.type]} · {MONTH_LABELS[x.month - 1]}</span></span>
                <span className={`num font-medium ${x.type === 'income' ? 'text-good' : ''}`}>{x.type === 'income' ? '+' : ''}{eur.format(x.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
