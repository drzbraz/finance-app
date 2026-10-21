import { useState } from 'react';
import { budgetStatus, suggestBudgets } from '../analytics/budgets';
import { byCategory } from '../analytics/metrics';
import { categoryIcon } from '../categories';
import { useToast } from '../components/layout/Toast';
import { PageHeader, ProgressBar } from '../components/ui';
import { db } from '../db/schema';
import { saveBudget } from '../db/repo';
import { useBudgets, useCategories, useRules, useYearTransactions } from '../hooks';
import { eur, MONTH_NAMES } from '../util';

const STATE_LABEL = { ok: 'Dentro do limite', warning: 'Atenção: 80% usado', over: 'Estourou' } as const;

export default function Budgets({ year, month }: { year: number; month: number }) {
  const txs = useYearTransactions(year);
  const budgets = useBudgets();
  const rules = useRules();
  const categories = useCategories(rules, txs).filter((c) => c !== 'Receita' && c !== 'Investimento');
  const toast = useToast();
  const [adding, setAdding] = useState('');

  const status = budgetStatus(txs, budgets, month);
  const spentNoBudget = byCategory(txs, month).filter((c) => !budgets.some((b) => b.category === c.category));
  const totalLimit = status.reduce((a, b) => a + b.limit, 0);
  const totalSpent = status.reduce((a, b) => a + b.spent, 0);

  const suggest = async () => {
    const before = await db.budgets.toArray();
    const suggestions = suggestBudgets(txs, month).filter((s) => !budgets.some((b) => b.category === s.category));
    await db.budgets.bulkPut(suggestions);
    toast(`${suggestions.length} orçamento(s) sugerido(s) pela sua média`, async () => {
      await db.budgets.clear();
      await db.budgets.bulkPut(before);
    });
  };

  const setLimit = (category: string, value: string) => {
    const v = Number(value.replace(',', '.'));
    if (value.trim() === '' || !Number.isFinite(v)) return;
    saveBudget({ category, monthlyLimit: v });
  };

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        subtitle={status.length ? `${MONTH_NAMES[month - 1]}: ${eur.format(totalSpent)} de ${eur.format(totalLimit)} orçados` : 'Defina quanto quer gastar por categoria a cada mês.'}
        actions={<button className="btn-primary" onClick={suggest}>✨ Sugerir pela média</button>}
      />

      {status.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {status.map((b) => (
            <div key={b.category} className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">{categoryIcon(b.category)} {b.category}</span>
                <label className="flex items-center gap-1 text-xs text-ink-3">
                  Limite €
                  <input
                    key={b.limit}
                    inputMode="decimal"
                    className="input num w-20 py-1 text-right"
                    defaultValue={b.limit}
                    onBlur={(e) => setLimit(b.category, e.target.value)}
                    aria-label={`Limite de ${b.category}`}
                  />
                </label>
              </div>
              <ProgressBar value={b.pct} tone={b.state === 'over' ? 'bad' : b.state === 'warning' ? 'warn' : 'accent'} label={b.category} />
              <div className="mt-2 flex justify-between text-xs">
                <span className={b.state === 'over' ? 'font-semibold text-bad' : b.state === 'warning' ? 'font-semibold text-warn' : 'text-ink-2'}>
                  {b.state === 'ok' ? '✓' : b.state === 'warning' ? '⚠' : '✕'} {STATE_LABEL[b.state]}
                </span>
                <span className="num text-ink-2">
                  {eur.format(b.spent)} · {b.remaining >= 0 ? `sobram ${eur.format(b.remaining)}` : `${eur.format(-b.remaining)} acima`}
                </span>
              </div>
              <button className="mt-2 text-xs text-ink-3 hover:text-bad" onClick={() => saveBudget({ category: b.category, monthlyLimit: 0 })}>Remover orçamento</button>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Adicionar orçamento</h2>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Categoria">
            <option value="">Escolha a categoria…</option>
            {categories.filter((c) => !budgets.some((b) => b.category === c)).map((c) => <option key={c} value={c}>{categoryIcon(c)} {c}</option>)}
          </select>
          <input
            className="input num w-32"
            inputMode="decimal"
            placeholder="Limite €"
            disabled={!adding}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && adding) {
                setLimit(adding, (e.target as HTMLInputElement).value);
                setAdding('');
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
          <span className="self-center text-xs text-ink-3">Enter para salvar</span>
        </div>
        {spentNoBudget.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs text-ink-3">Gastos de {MONTH_NAMES[month - 1]} sem orçamento:</p>
            <div className="flex flex-wrap gap-1.5">
              {spentNoBudget.map((c) => (
                <button key={c.category} className="chip" onClick={() => setAdding(c.category)}>
                  {categoryIcon(c.category)} {c.category} · {eur.format(c.amount)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
