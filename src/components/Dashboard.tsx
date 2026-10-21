import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cumulative, saldo, totalsByType } from '../analytics/aggregate';
import { byCategory, categoryDeviation, goalProgress, pending, savingsRate, savingsRateYTD, topExpenses } from '../analytics/metrics';
import { useSettings, useYearTransactions } from '../hooks';
import { TYPE_LABELS } from '../types';
import { brl, eur, MONTH_LABELS, MONTH_NAMES, pct } from '../util';

// Reference categorical palette, fixed order (dataviz skill): blue, orange, aqua, yellow.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#8a8984', grid: '#e7e6e2' };
const AXIS = { stroke: INK.grid, tick: { fill: INK.secondary, fontSize: 11 } };
const euroTick = (v: number) => `€${Math.round(v)}`;

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ year, month }: { year: number; month: number }) {
  const txs = useYearTransactions(year);
  const settings = useSettings();
  const [catScope, setCatScope] = useState<'month' | 'year'>('month');

  const t = useMemo(() => totalsByType(txs), [txs]);
  const rates = savingsRate(t);
  const ytd = savingsRateYTD(t, month);
  const bal = saldo(t);
  const cum = cumulative(bal);
  const goal = goalProgress(settings, t);
  const cats = byCategory(txs, catScope === 'month' ? month : undefined);
  const top = topExpenses(txs, month);
  // Categories with nothing spent yet this month are not "−100%": leave them out.
  const dev = categoryDeviation(txs, month).filter((d) => d.current > 0);
  const open = pending(txs, month);

  // The cumulative line stops at the last month with any data instead of running flat into the future.
  const lastMonth = Math.max(0, ...txs.map((x) => x.month));
  const monthly = MONTH_LABELS.map((m, i) => ({
    month: m,
    rate: rates[i] === null ? null : Math.round(rates[i]! * 1000) / 10,
    fixed: t.fixed[i],
    variable: t.variable[i],
    additional: t.additional[i],
    investment: t.investment[i],
    cumulative: i < lastMonth ? cum[i] : null,
  }));
  const target = Math.round(settings.savingsRateTarget * 1000) / 10;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Taxa de poupança · ${MONTH_LABELS[month - 1]}`} value={rates[month - 1] === null ? '—' : pct.format(rates[month - 1]!)} sub={`Acumulado no ano: ${ytd === null ? '—' : pct.format(ytd)} · meta ${pct.format(settings.savingsRateTarget)}`} />
        <Stat label={`Saldo · ${MONTH_LABELS[month - 1]}`} value={eur.format(bal[month - 1])} sub={`Acumulado: ${eur.format(cum[month - 1])}`} />
        <Stat label="Meta de patrimônio" value={goal.goalBRL ? pct.format(goal.progress) : '—'} sub={`${brl.format(goal.currentBRL)} de ${brl.format(goal.goalBRL)}`} />
        <Stat
          label="Tempo até a meta"
          value={goal.monthsLeft === null ? '—' : goal.monthsLeft === 0 ? 'Atingida' : `${goal.monthsLeft} meses`}
          sub={`Ritmo: ${eur.format(goal.monthlyPaceEUR)}/mês investido · 1 € = ${settings.eurBrlRate.toFixed(2)} R$`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Taxa de poupança por mês (investimentos ÷ receita)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="month" {...AXIS} />
              <YAxis {...AXIS} unit="%" width={44} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Taxa']} />
              <ReferenceLine y={target} stroke={INK.muted} strokeDasharray="4 4" label={{ value: `Meta ${target}%`, fill: INK.secondary, fontSize: 11, position: 'insideTopRight' }} />
              <Line type="linear" dataKey="rate" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Para onde foi o dinheiro, por mês">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="month" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={euroTick} width={56} />
              <Tooltip formatter={(v: number, name: string) => [eur.format(v), name]} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
              <Bar dataKey="fixed" name={TYPE_LABELS.fixed} stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={2} />
              <Bar dataKey="variable" name={TYPE_LABELS.variable} stackId="a" fill={SERIES[1]} stroke="#fff" strokeWidth={2} />
              <Bar dataKey="additional" name={TYPE_LABELS.additional} stackId="a" fill={SERIES[2]} stroke="#fff" strokeWidth={2} />
              <Bar dataKey="investment" name={TYPE_LABELS.investment} stackId="a" fill={SERIES[3]} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Saldo acumulado no ano">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="month" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={euroTick} width={56} />
              <Tooltip formatter={(v: number) => [eur.format(v), 'Saldo acumulado']} />
              <ReferenceLine y={0} stroke={INK.muted} />
              <Line type="linear" dataKey="cumulative" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title={`Gastos por categoria · ${catScope === 'month' ? MONTH_NAMES[month - 1] : year}`}>
          <div className="mb-2 flex gap-1">
            {(['month', 'year'] as const).map((s) => (
              <button key={s} className={`chip ${catScope === s ? 'bg-emerald-600 text-white' : ''}`} onClick={() => setCatScope(s)}>
                {s === 'month' ? 'Mês' : 'Ano'}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(160, cats.length * 28)}>
            <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
              <XAxis type="number" {...AXIS} tickFormatter={euroTick} />
              <YAxis type="category" dataKey="category" {...AXIS} width={96} />
              <Tooltip formatter={(v: number) => [eur.format(v), 'Gasto']} cursor={{ fill: '#f1f0ec' }} />
              <Bar dataKey="amount" fill={SERIES[0]} radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Top 5 despesas · ${MONTH_NAMES[month - 1]}`}>
          <ol className="space-y-1 text-sm">
            {top.map((x) => (
              <li key={x.id} className="flex justify-between gap-2">
                <span className="truncate">{x.description} <span className="chip">{x.category}</span></span>
                <span className="tabular-nums">{eur.format(x.amount)}</span>
              </li>
            ))}
            {!top.length && <li className="text-slate-500">Sem despesas.</li>}
          </ol>
        </Card>

        <Card title="Categorias vs média dos meses anteriores">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr><th className="text-left">Categoria</th><th className="text-right">Mês</th><th className="text-right">Média</th><th className="text-right">Δ</th></tr>
            </thead>
            <tbody>
              {dev.map((d) => (
                <tr key={d.category} className={d.flagged ? 'font-medium' : ''}>
                  <td>{d.flagged && <span title="Desvio acima de 30%" aria-label="Desvio acima de 30%">⚠️ </span>}{d.category}</td>
                  <td className="text-right tabular-nums">{eur.format(d.current)}</td>
                  <td className="text-right tabular-nums text-slate-500">{eur.format(d.average)}</td>
                  <td className={`text-right tabular-nums ${d.flagged ? (d.deviation! > 0 ? 'text-red-700' : 'text-emerald-700') : 'text-slate-500'}`}>
                    {d.deviation === null ? 'novo' : `${d.deviation > 0 ? '+' : ''}${pct.format(d.deviation)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={`Pendentes · ${MONTH_NAMES[month - 1]}`}>
          <ul className="space-y-1 text-sm">
            {open.map((x) => (
              <li key={x.id} className="flex justify-between gap-2">
                <span>{x.description} <span className="text-xs text-slate-500">{TYPE_LABELS[x.type]}</span></span>
                <span className="tabular-nums">{eur.format(x.amount)}</span>
              </li>
            ))}
            {!open.length && <li className="text-slate-500">Tudo pago ✓</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
