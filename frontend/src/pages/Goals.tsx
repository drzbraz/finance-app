import { newId, parseLooseNumber, type Goal } from '@finance/shared';
import { useMemo, useState } from 'react';
import { totalsByType } from '../analytics/aggregate';
import { goalStatus } from '../analytics/goals';
import { useToast } from '../components/layout/Toast';
import { EmptyState, Modal, PageHeader, ProgressBar } from '../components/ui';
import { useGoals, useSettings, useToday, useYearTransactions } from '../hooks';
import { brl, eur, pct } from '../util';
import { deleteGoal, saveGoal } from '../api/repo';

const fmt = (g: Goal) => (g.currency === 'BRL' ? brl : eur);

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function Goals({ year }: { year: number }) {
  const goals = useGoals();
  const settings = useSettings();
  const txs = useYearTransactions(year);
  const today = useToday();
  const toast = useToast();
  const totals = useMemo(() => totalsByType(txs), [txs]);
  const [form, setForm] = useState<Goal | null>(null);
  const [contrib, setContrib] = useState<Goal | null>(null);

  const blank = (): Goal => ({ id: newId('goal'), name: '', target: 0, currency: 'EUR', source: 'manual', contributions: [], createdAt: new Date().toISOString() });

  return (
    <div>
      <PageHeader title="Metas" subtitle="Objetivos de poupança e quanto falta por mês." actions={<button className="btn-primary" onClick={() => setForm(blank())}>+ Nova meta</button>} />
      {goals.length === 0 ? (
        <EmptyState icon="🏁" title="Nenhuma meta ainda" text="Crie uma meta (reserva, viagem, apartamento…) e acompanhe o progresso." action={<button className="btn-primary" onClick={() => setForm(blank())}>Criar meta</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const s = goalStatus(g, settings, totals, today);
            const f = fmt(g);
            return (
              <article key={g.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{g.name}</h2>
                    <p className="text-xs text-ink-3">
                      {g.source === 'patrimony' ? 'Patrimônio Brasil + Europa (Configurações)' : 'Aportes manuais'}
                      {g.targetDate && ` · até ${new Date(`${g.targetDate}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                  <span className="num text-xl font-bold">{pct.format(s.progress)}</span>
                </div>
                <div className="my-3"><ProgressBar value={s.progress} label={g.name} /></div>
                <p className="num text-sm">
                  <b>{f.format(s.current)}</b> <span className="text-ink-3">de {f.format(g.target)} · faltam {f.format(s.remaining)}</span>
                </p>
                <ul className="mt-3 space-y-1 text-sm text-ink-2">
                  {s.monthlyNeeded !== null && s.remaining > 0 && <li>📅 Para chegar no prazo: <b className="text-ink">{f.format(s.monthlyNeeded)}/mês</b> por {s.monthsToTarget} mês(es)</li>}
                  {s.monthlyPace > 0 && <li>🚶 Ritmo atual: {f.format(s.monthlyPace)}/mês{s.projectedDate && s.remaining > 0 ? ` → chega em ${monthLabel(s.projectedDate)}` : ''}</li>}
                  {s.remaining === 0 && <li className="font-semibold text-good">🎉 Meta atingida!</li>}
                  {s.monthlyPace === 0 && s.remaining > 0 && <li>Sem ritmo ainda: {g.source === 'manual' ? 'adicione um aporte' : 'registre investimentos'}.</li>}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {g.source === 'manual' && <button className="btn-primary" onClick={() => setContrib(g)}>+ Aporte</button>}
                  <button className="btn" onClick={() => setForm(g)}>Editar</button>
                  <button
                    className="btn-ghost text-bad"
                    onClick={async () => {
                      await deleteGoal(g.id);
                      toast(`Meta ${g.name} excluída`, () => saveGoal(g));
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {form && <GoalForm goal={form} onClose={() => setForm(null)} />}
      {contrib && <ContributionForm goal={contrib} onClose={() => setContrib(null)} />}
    </div>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [draft, setDraft] = useState(goal);
  const [target, setTarget] = useState(goal.target ? String(goal.target) : '');
  const value = parseLooseNumber(target);
  const ok = draft.name.trim() && value && value > 0;
  return (
    <Modal title={goal.name ? 'Editar meta' : 'Nova meta'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          await saveGoal({ ...draft, name: draft.name.trim(), target: value! });
          onClose();
        }}
      >
        <label className="block"><span className="label">Nome</span><input autoFocus className="input mt-1" placeholder="ex.: Reserva de emergência" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block"><span className="label">Valor alvo</span><input className="input num mt-1" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <label className="block"><span className="label">Moeda</span>
            <select className="input mt-1" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as Goal['currency'] })}>
              <option value="EUR">€ EUR</option><option value="BRL">R$ BRL</option>
            </select>
          </label>
        </div>
        <label className="block"><span className="label">Prazo (opcional)</span><input type="date" className="input mt-1" value={draft.targetDate ?? ''} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value || undefined })} /></label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!ok}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function ContributionForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const value = parseLooseNumber(amount);
  return (
    <Modal title={`Aporte · ${goal.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value) return;
          await saveGoal({ ...goal, contributions: [...goal.contributions, { date, amount: value }] });
          onClose();
        }}
      >
        <label className="block"><span className="label">Valor ({goal.currency === 'BRL' ? 'R$' : '€'})</span><input autoFocus className="input num mt-1 text-xl" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex.: −50 para uma retirada" /></label>
        <label className="block"><span className="label">Data</span><input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {goal.contributions.length > 0 && (
          <details className="text-xs text-ink-2"><summary className="cursor-pointer">Histórico ({goal.contributions.length})</summary>
            <ul className="num mt-1">{[...goal.contributions].reverse().map((c, i) => <li key={i}>{c.date}: {fmt(goal).format(c.amount)}</li>)}</ul>
          </details>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!value}>Adicionar</button>
        </div>
      </form>
    </Modal>
  );
}
