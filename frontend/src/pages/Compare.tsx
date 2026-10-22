import { useState } from 'react';
import { yearOverYear } from '../analytics/yoy';
import { categoryIcon } from '../categories';
import { YoyBars } from '../components/charts';
import { EmptyState, PageHeader, Segmented } from '../components/ui';
import { useYearTransactions, useYears } from '../hooks';
import type { ChartColors } from '../theme';
import { eur, MONTH_LABELS, MONTH_NAMES, pct } from '../util';

function Delta({ delta, deltaPct, inverse = false }: { delta: number; deltaPct: number | null; inverse?: boolean }) {
  // For expenses, going up is bad; for income/investment it is good.
  const good = inverse ? delta > 0 : delta < 0;
  const cls = delta === 0 ? 'text-ink-3' : good ? 'text-good' : 'text-bad';
  return (
    <span className={`num text-xs font-semibold ${cls}`}>
      {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {eur.format(Math.abs(delta))}{deltaPct !== null ? ` (${pct.format(Math.abs(deltaPct))})` : ''}
    </span>
  );
}

export default function Compare({ year, month, colors, onImport }: { year: number; month: number; colors: ChartColors; onImport: () => void }) {
  const years = useYears() ?? [];
  const older = years.filter((y) => y < year);
  const [base, setBase] = useState<number | null>(null);
  const a = base && older.includes(base) ? base : older[older.length - 1];
  const txA = useYearTransactions(a ?? 0);
  const txB = useYearTransactions(year);
  // For the current year, "same period" stops at today's month (pending entries for later months don't count).
  const now = new Date();
  const lastData = Math.max(0, ...txB.filter((t) => t.amount !== 0).map((t) => t.month));
  const lastB = year === now.getFullYear() ? Math.min(lastData, now.getMonth() + 1) : lastData;
  const [scope, setScope] = useState<'same' | 'full'>('same');

  if (!a) {
    return (
      <EmptyState
        icon="📊"
        title="Importe outro ano para comparar"
        text={`Você está vendo ${year}. Importe a planilha de um ano anterior (ex.: ${year - 1}) para ver a comparação.`}
        action={<button className="btn-primary" onClick={onImport}>⬆︎ Importar outro ano</button>}
      />
    );
  }

  const upTo = scope === 'same' ? Math.max(1, lastB || month) : 12;
  const y = yearOverYear(txA, txB, upTo);
  const period = scope === 'same' ? `Jan–${MONTH_LABELS[upTo - 1]}` : 'ano todo';

  return (
    <div>
      <PageHeader
        title={`${a} vs ${year}`}
        subtitle={`Comparando ${period}${scope === 'same' && upTo < 12 ? ` (${year} tem dados até ${MONTH_NAMES[upTo - 1]})` : ''}.`}
        actions={
          <div className="flex items-center gap-2">
            {older.length > 1 && (
              <select className="input w-auto" value={a} onChange={(e) => setBase(Number(e.target.value))} aria-label="Ano base">
                {older.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <Segmented label="Período" value={scope} onChange={setScope} options={[{ value: 'same', label: 'Mesmo período' }, { value: 'full', label: 'Ano todo' }]} />
            <button className="btn" onClick={onImport} title="Importar a planilha de outro ano">⬆︎ Importar ano</button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {([['expenses', 'Despesas', false], ['income', 'Receitas', true], ['investment', 'Investido', true]] as const).map(([k, label, inverse]) => (
          <div key={k} className="card">
            <p className="label">{label}</p>
            <p className="num mt-1 text-xl font-bold">{eur.format(y.totals[k].b)}</p>
            <p className="text-xs text-ink-3">{a}: {eur.format(y.totals[k].a)}</p>
            <Delta delta={y.totals[k].delta} deltaPct={y.totals[k].deltaPct} inverse={inverse} />
          </div>
        ))}
      </div>

      <section className="card mb-4">
        <h2 className="mb-3 text-sm font-semibold">Despesas por mês</h2>
        <YoyBars data={y.monthly.map((m) => ({ month: MONTH_LABELS[m.month - 1], a: m.a, b: m.b }))} labels={[String(a), String(year)]} colors={colors} />
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Categorias com maior mudança</h2>
        <table className="w-full text-sm">
          <thead className="label text-left">
            <tr><th className="pb-2">Categoria</th><th className="pb-2 text-right">{a}</th><th className="pb-2 text-right">{year}</th><th className="pb-2 text-right">Variação</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {y.categories.map((c) => (
              <tr key={c.category}>
                <td className="py-2">{categoryIcon(c.category)} {c.category}</td>
                <td className="num py-2 text-right text-ink-2">{eur.format(c.a)}</td>
                <td className="num py-2 text-right">{eur.format(c.b)}</td>
                <td className="py-2 text-right">{c.deltaPct === null && c.a === 0 ? <span className="text-xs text-ink-3">novo</span> : <Delta delta={c.delta} deltaPct={c.deltaPct} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
