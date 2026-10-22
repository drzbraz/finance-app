import type { ReactNode } from 'react';
import type { FreeToSpend } from '../../analytics/free';
import { eur } from '../../util';

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card h-full transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <p className="label">{label}</p>
      <p className={`num mt-1 text-2xl font-bold tracking-tight ${tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

export function Section({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card animate-in ${className}`} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "Como chegamos em …": the lines that add up to "Livre para gastar". */
export function FreeBreakdown({ free }: { free: FreeToSpend }) {
  return (
    <section className="card animate-in text-sm">
      <h2 className="mb-2 font-semibold">Como chegamos em {eur.format(free.free)}</h2>
      <ul className="num space-y-1">
        <li className="flex justify-between"><span>Receita do mês</span><span className="text-good">+{eur.format(free.income)}</span></li>
        <li className="flex justify-between"><span>Contas fixas</span><span>−{eur.format(free.fixed)}</span></li>
        <li className="flex justify-between"><span>Investimentos</span><span>−{eur.format(free.investment)}</span></li>
        <li className="flex justify-between">
          <span>
            Mercado {free.groceriesSpent >= free.groceryReserve ? '(já gasto)' : free.groceryReserveSource === 'budget' ? '(reservado: seu limite)' : free.groceryReserveSource === 'average' ? '(reservado: sua média)' : ''}
            {free.groceriesSpent > 0 && free.groceriesSpent < free.groceryReserve && <span className="text-ink-3"> · gasto até agora {eur.format(free.groceriesSpent)}</span>}
          </span>
          <span>−{eur.format(free.groceries)}</span>
        </li>
        <li className="flex justify-between"><span>Outros gastos variáveis já feitos</span><span>−{eur.format(free.otherSpent)}</span></li>
        {free.toReceive > 0 && (
          <li className="flex justify-between"><span>Adiantado no Splitwise, ainda a receber</span><span>−{eur.format(free.toReceive)}</span></li>
        )}
        <li className="flex justify-between border-t border-line pt-1 font-semibold">
          <span>Livre para gastar</span><span className={free.free < 0 ? 'text-bad' : 'text-good'}>{eur.format(free.free)}</span>
        </li>
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        Inclui as contas, receitas e investimentos recorrentes que ainda não foram lançados neste mês, pelo valor esperado, menos os marcados como opcionais (veja em Contas).
        {free.groceryReserveSource !== 'budget' && ' Para reservar um valor fixo de mercado, defina um limite para Mercado em Contas → Limites de gasto.'}
        {free.toReceive > 0 && ' O que você adiantou no Splitwise volta para cá quando você marca “recebi”.'}
      </p>
    </section>
  );
}
