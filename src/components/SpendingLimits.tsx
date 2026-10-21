import { useState } from 'react';
import { daysInMonth } from '../analytics/bills';
import { budgetStatus } from '../analytics/budgets';
import { categoryIcon } from '../categories';
import { saveBudget } from '../db/repo';
import { useBudgets, useCategories, useRules, useToday } from '../hooks';
import { parseLooseNumber } from '../parser/cells';
import type { Transaction } from '../types';
import { eur, MONTH_NAMES } from '../util';
import { useToast } from './layout/Toast';
import { ProgressBar } from './ui';

interface Props {
  txs: Transaction[];
  year: number;
  month: number;
  /** Category offered first when adding a limit. */
  suggested?: string;
}

/**
 * "How much can I still spend on X this month?" A monthly limit per category (same data as
 * Orçamentos), shown as what is left, with a per-day amount for the rest of the current month.
 */
export default function SpendingLimits({ txs, year, month, suggested = 'Lazer' }: Props) {
  const budgets = useBudgets();
  const rules = useRules();
  const toast = useToast();
  const today = useToday();
  const categories = useCategories(rules, txs).filter((c) => !['Receita', 'Investimento'].includes(c));
  const free = categories.filter((c) => !budgets.some((b) => b.category === c));
  const [category, setCategory] = useState(free.includes(suggested) ? suggested : '');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const status = budgetStatus(txs, budgets, month);
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;
  const daysLeft = isCurrent ? daysInMonth(year, month) - today.getDate() + 1 : 0;
  const chosen = category || (free.includes(suggested) ? suggested : free[0] ?? '');

  const add = async () => {
    const v = parseLooseNumber(amount);
    if (!chosen || v === null || v <= 0) return;
    await saveBudget({ category: chosen, monthlyLimit: v });
    toast(`Limite de ${chosen}: ${eur.format(v)} por mês`);
    setAmount('');
    setCategory('');
  };

  const saveEdit = async (cat: string) => {
    const v = parseLooseNumber(editValue);
    setEditing(null);
    if (v === null || v < 0) return;
    await saveBudget({ category: cat, monthlyLimit: v });
    if (v === 0) toast(`Limite de ${cat} removido`, () => saveBudget({ category: cat, monthlyLimit: status.find((s) => s.category === cat)?.limit ?? 0 }));
  };

  return (
    <section className="card">
      <div className="mb-3">
        <h2 className="font-semibold">Limites de gasto</h2>
        <p className="text-xs text-ink-3">Defina quanto quer gastar por mês numa categoria e veja quanto ainda sobra em {MONTH_NAMES[month - 1].toLowerCase()}.</p>
      </div>

      {status.length > 0 && (
        <ul className="mb-4 grid gap-3 sm:grid-cols-2">
          {status.map((b) => {
            const over = b.remaining < 0;
            return (
              <li key={b.category} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{categoryIcon(b.category)} {b.category}</span>
                  {editing === b.category ? (
                    <input
                      autoFocus
                      className="input num w-24 py-1 text-right"
                      inputMode="decimal"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEdit(b.category)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(b.category)}
                      aria-label={`Limite de ${b.category}`}
                    />
                  ) : (
                    <button
                      className="text-xs text-ink-3 hover:text-ink"
                      onClick={() => { setEditing(b.category); setEditValue(String(b.limit).replace('.', ',')); }}
                      title="Mudar o limite (0 remove)"
                    >
                      limite {eur.format(b.limit)} ✎
                    </button>
                  )}
                </div>
                <p className={`num mt-2 text-2xl font-bold ${over ? 'text-bad' : ''}`}>
                  {over ? `−${eur.format(-b.remaining)}` : eur.format(b.remaining)}
                </p>
                <p className="mb-2 text-xs text-ink-2">
                  {over ? 'acima do limite' : 'ainda pode gastar'} · gasto {eur.format(b.spent)}
                  {isCurrent && !over && daysLeft > 0 && ` · ≈ ${eur.format(b.remaining / daysLeft)}/dia por ${daysLeft} dia(s)`}
                </p>
                <ProgressBar value={b.pct} tone={b.state === 'over' ? 'bad' : b.state === 'warning' ? 'warn' : 'accent'} label={b.category} />
                {b.state !== 'ok' && (
                  <p className={`mt-1.5 text-xs font-semibold ${over ? 'text-bad' : 'text-warn'}`}>{over ? '✕ Estourou o limite' : '⚠ Já usou mais de 80%'}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {free.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <select className="input w-auto" value={chosen} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
            {free.map((c) => <option key={c} value={c}>{categoryIcon(c)} {c}</option>)}
          </select>
          <input className="input num w-32" inputMode="decimal" placeholder="€ por mês" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Limite por mês" />
          <button className="btn-primary" disabled={!parseLooseNumber(amount)}>Definir limite</button>
        </form>
      )}
    </section>
  );
}
