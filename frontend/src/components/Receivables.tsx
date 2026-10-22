import type { Transaction } from '@finance/shared';
import { todayIso } from '../analytics/bills';
import { markReceived, pendingReceivables, receivable } from '../analytics/receivables';
import { saveTransaction } from '../api/repo';
import { categoryIcon } from '../categories';
import { useToday } from '../hooks';
import { eur, MONTH_LABELS } from '../util';
import { useToast } from './layout/Toast';
import { PaidCheck } from './ui';

const shortDate = (t: Transaction) =>
  t.date ? new Date(`${t.date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : MONTH_LABELS[t.month - 1];

/**
 * "A receber · Splitwise": what I paid for others and was not paid back yet. Ticking one marks
 * it received today, which gives the money back to "Livre para gastar" and the month's saldo.
 * `limit` shows only the oldest few (Início); Contas shows them all and what came back this month.
 */
export default function Receivables({ txs, month, limit, onMore }: { txs: Transaction[]; month: number; limit?: number; onMore?: () => void }) {
  const today = useToday();
  const toast = useToast();
  const pending = pendingReceivables(txs);
  const total = pending.reduce((a, t) => a + receivable(t), 0);
  const shown = limit ? pending.slice(0, limit) : pending;
  const received = limit ? [] : txs.filter((t) => t.split?.receivedOn && t.month === month);

  const toggle = async (t: Transaction) => {
    const next = markReceived(t, t.split?.receivedOn ? null : todayIso(today));
    await saveTransaction(next);
    toast(next.split?.receivedOn ? `${eur.format(receivable(t))} de “${t.description}” recebido` : `“${t.description}” voltou para a receber`, () => saveTransaction(t));
  };

  if (!pending.length && !received.length) {
    return limit ? null : (
      <p className="text-sm text-ink-2">
        Nada a receber. Ao lançar um gasto com “Paguei e dividi no Splitwise”, a parte dos outros aparece aqui até você marcar que recebeu.
      </p>
    );
  }

  return (
    <div>
      {pending.length > 0 && (
        <p className="mb-2 text-sm text-ink-2">
          <span className="num font-semibold text-ink">{eur.format(total)}</span> a receber de {pending.length} divisão(ões). Marque quando o dinheiro cair na conta.
        </p>
      )}
      <ul className="divide-y divide-line">
        {[...shown, ...received].map((t) => {
          const done = !!t.split?.receivedOn;
          return (
            <li key={t.id} className="animate-in flex items-center gap-3 py-2.5">
              <PaidCheck checked={done} onChange={() => toggle(t)} label={`${t.description}: recebi`} />
              <span className="text-lg" aria-hidden>{categoryIcon(t.category)}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium transition-colors ${done ? 'text-ink-3 line-through' : ''}`}>{t.description}</p>
                <p className="text-xs text-ink-3">
                  {shortDate(t)} · você pagou {eur.format(t.split!.total)} ÷ {t.split!.people}
                  {done && ` · recebido ${new Date(`${t.split!.receivedOn}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                </p>
              </div>
              <span className={`num text-sm font-semibold ${done ? 'text-ink-3' : 'text-good'}`}>+{eur.format(receivable(t))}</span>
            </li>
          );
        })}
      </ul>
      {limit && pending.length > limit && onMore && (
        <button className="btn-ghost mt-1 px-2 py-1 text-xs" onClick={onMore}>Ver os {pending.length}</button>
      )}
    </div>
  );
}
