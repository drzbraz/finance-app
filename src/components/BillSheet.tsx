import { useState } from 'react';
import { daysInMonth, isoDate, recurringKey, renameRecurringTxs, type Bill } from '../analytics/bills';
import { deleteTransaction, removeRecurring, restoreTransaction, saveRecurring, saveTransaction, updateRecurring } from '../db/repo';
import { useRules } from '../hooks';
import { parseLooseNumber } from '../parser/cells';
import { categorize } from '../rules/engine';
import type { RecurringItem, Transaction, TxType } from '../types';
import { eur, MONTH_NAMES, newId } from '../util';
import { useToast } from './layout/Toast';
import { Segmented, Sheet } from './ui';

const TYPES: { value: TxType; label: string }[] = [
  { value: 'fixed', label: 'Despesa fixa' },
  { value: 'income', label: 'Receita' },
  { value: 'investment', label: 'Investimento' },
];

interface Props {
  /** null = new bill */
  bill: Bill | null;
  year: number;
  month: number;
  /** All transactions of the year (for renames). */
  txs: Transaction[];
  /** Names already used, to block duplicates. */
  existingKeys: string[];
  onClose: () => void;
}

/** Add, edit (name, type, amount, due day) or delete a recurring bill/income line. */
export default function BillSheet({ bill, year, month, txs, existingKeys, onClose }: Props) {
  const rules = useRules();
  const toast = useToast();
  const item = bill?.item ?? null;
  const [name, setName] = useState(item?.description ?? '');
  const [type, setType] = useState<TxType>(item?.type ?? 'fixed');
  const [amount, setAmount] = useState(item?.expectedAmount != null ? String(item.expectedAmount).replace('.', ',') : '');
  const [dueDay, setDueDay] = useState(item?.dueDay ? String(item.dueDay) : '');
  const [active, setActive] = useState(item?.active ?? true);
  // Amount of this month's recorded entry, when there is exactly one.
  const monthTx = bill?.txs.length === 1 ? bill.txs[0] : null;
  const [monthAmount, setMonthAmount] = useState(monthTx ? String(monthTx.amount).replace('.', ',') : '');
  const [addNow, setAddNow] = useState(!item);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pendingThisMonth = bill?.txs.filter((t) => !t.paid) ?? [];
  const [deletePending, setDeletePending] = useState(true);
  const [error, setError] = useState('');

  const value = parseLooseNumber(amount);
  const day = dueDay ? Number(dueDay) : undefined;
  const monthName = MONTH_NAMES[month - 1].toLowerCase();

  const save = async () => {
    const description = name.trim();
    if (!description) return setError('Dê um nome à conta.');
    if (value === null || value <= 0) return setError('Informe o valor (maior que zero).');
    if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) return setError('Dia de vencimento entre 1 e 31.');
    const key = recurringKey(type, description);
    if (key !== item?.key && existingKeys.includes(key)) return setError('Já existe uma conta com esse nome.');

    const next: RecurringItem = { key, type, description, dueDay: day, expectedAmount: value, active, removed: false };
    const renamed = item && key !== item.key ? renameRecurringTxs(txs, item, { type, description }) : [];
    await updateRecurring(item, next, renamed);

    // This month's entry: new amount, or create it now for a new bill.
    if (monthTx) {
      const m = parseLooseNumber(monthAmount);
      const current = renamed.find((t) => t.id === monthTx.id) ?? monthTx;
      if (m !== null && m > 0 && m !== monthTx.amount) await saveTransaction({ ...current, amount: m });
    } else if (addNow && active) {
      await saveTransaction(
        categorize(
          {
            id: newId(),
            year,
            month,
            date: isoDate(year, month, Math.min(day ?? 1, daysInMonth(year, month))),
            description,
            amount: value,
            type,
            category: '',
            categorySource: 'auto',
            tags: [],
            paid: false,
          },
          rules,
        ),
      );
    }
    toast(item ? `${description} atualizada` : `${description} adicionada às contas`);
    onClose();
  };

  const remove = async () => {
    if (!item) return;
    const dropped = deletePending ? pendingThisMonth : [];
    await removeRecurring(item);
    // deleteTransaction soft-deletes imported rows, so the export clears their cell.
    await Promise.all(dropped.map((t) => deleteTransaction(t)));
    toast(`${item.description} removida das contas`, async () => {
      await saveRecurring({ ...item, removed: false });
      await Promise.all(dropped.map((t) => restoreTransaction(t)));
    });
    onClose();
  };

  return (
    <Sheet title={item ? 'Editar conta' : 'Nova conta'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="label">Nome</span>
          <input className="input mt-1" placeholder="ex.: Aluguel, Netflix, Salário" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
        </label>

        <div>
          <span className="label">Tipo</span>
          <div className="mt-1"><Segmented label="Tipo" value={type} options={TYPES} onChange={setType} /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Valor por mês (€)</span>
            <input className="input num mt-1" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} />
          </label>
          <label className="block">
            <span className="label">Dia de vencimento</span>
            <input className="input num mt-1" type="number" min={1} max={31} placeholder="opcional" value={dueDay} onChange={(e) => { setDueDay(e.target.value); setError(''); }} />
          </label>
        </div>

        {monthTx && (
          <label className="block">
            <span className="label">Valor lançado em {monthName}</span>
            <input className="input num mt-1" inputMode="decimal" value={monthAmount} onChange={(e) => setMonthAmount(e.target.value)} />
            <span className="mt-1 block text-xs text-ink-3">Mude aqui se a conta deste mês veio diferente (ex.: energia).</span>
          </label>
        )}
        {!item && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={addNow} onChange={(e) => setAddNow(e.target.checked)} />
            Lançar já em {monthName} como pendente
          </label>
        )}
        {item && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa (aparece todo mês e entra no “Iniciar mês”)
          </label>
        )}
        {item && name.trim() && recurringKey(type, name.trim()) !== item.key && (
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
            Os lançamentos de {year} com o nome “{item.description}” passam a se chamar “{name.trim()}”.
          </p>
        )}

        {error && <p className="text-sm text-bad" role="alert">{error}</p>}

        <div className="flex justify-between gap-2 pt-1">
          {item ? (
            <button type="button" className="btn text-bad" onClick={() => setConfirmDelete(true)}>Excluir</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn-primary">{item ? 'Salvar' : 'Adicionar conta'}</button>
          </div>
        </div>

        {confirmDelete && item && (
          <div className="space-y-3 rounded-2xl border border-bad/30 bg-bad/5 p-4 text-sm">
            <p className="font-semibold">Remover “{item.description}” das contas?</p>
            <p className="text-ink-2">Ela deixa de aparecer aqui e no “Iniciar mês”. Os lançamentos dos meses anteriores continuam no histórico.</p>
            {pendingThisMonth.length > 0 && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={deletePending} onChange={(e) => setDeletePending(e.target.checked)} />
                Apagar também o lançamento pendente de {monthName} ({eur.format(pendingThisMonth.reduce((a, t) => a + t.amount, 0))})
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Manter</button>
              <button type="button" className="btn text-bad" onClick={remove}>Remover conta</button>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
