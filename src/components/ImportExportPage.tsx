import { useState } from 'react';
import { totalsByType } from '../analytics/aggregate';
import { db } from '../db/schema';
import { appOnlyCount, exportBackup, hasYear, importBackup, replaceYear, type Backup } from '../db/repo';
import { downloadBlob, XLSX_MIME } from '../download';
import { writeLedgerOnly, writeWorkbook } from '../export/writeWorkbook';
import { parseWorkbook } from '../parser/parseWorkbook';
import { applyRules } from '../rules/engine';
import { TX_TYPES, TYPE_LABELS, type ImportResult } from '../types';
import { eur, MONTH_LABELS, round2 } from '../util';

interface Props {
  year: number;
  onImported: (year: number) => void;
}

interface Pending {
  file: File;
  data: ArrayBuffer;
  result: ImportResult;
  year: number | '';
}

export default function ImportExportPage({ year, onImported }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);
  // Inline two-step confirmations instead of window.confirm.
  const [replaceAsked, setReplaceAsked] = useState(false);
  const [appOnly, setAppOnly] = useState(0);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const onFile = async (file: File) => {
    setError('');
    setPending(null);
    setReplaceAsked(false);
    try {
      const data = await file.arrayBuffer();
      const result = await parseWorkbook(data, { fileName: file.name });
      const rules = await db.rules.toArray();
      result.transactions = applyRules(result.transactions, rules);
      setPending({ file, data, result, year: result.year ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirm = async () => {
    if (!pending || pending.year === '') return;
    const y = pending.year;
    if (!replaceAsked && (await hasYear(y))) {
      setAppOnly(await appOnlyCount(y));
      setReplaceAsked(true);
      return;
    }
    setReplaceAsked(false);
    setBusy(true);
    try {
      // Re-parse when the year was typed in, so ids and dates use it.
      const result = y === pending.result.year ? pending.result : await parseWorkbook(pending.data, { year: y });
      await replaceYear(y, result.transactions, { fileName: pending.file.name, importedAt: new Date().toISOString(), data: pending.data }, result.settings);
      setPending(null);
      onImported(y);
    } finally {
      setBusy(false);
    }
  };

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const txs = await db.transactions.where('year').equals(year).toArray();
      const stored = await db.workbooks.get(year);
      const out = stored ? await writeWorkbook(stored.data, txs) : await writeLedgerOnly(txs);
      setExportWarnings(out.warnings);
      downloadBlob(out.data, `Controle financeiro ${year}.xlsx`, XLSX_MIME);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async () => {
    const backup = await exportBackup();
    downloadBlob(JSON.stringify(backup), `financas-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const importJson = async (file: File) => {
    setRestoreFile(null);
    try {
      await importBackup(JSON.parse(await file.text()) as Backup);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="mb-2 font-semibold">Importar planilha (.xlsx)</h2>
        <p className="mb-3 text-sm text-slate-600">O arquivo é lido só neste navegador. Nada é enviado para a internet.</p>
        <input type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        {pending && (
          <Preview
            pending={pending}
            setYear={(y) => { setPending({ ...pending, year: y }); setReplaceAsked(false); }}
            onConfirm={confirm}
            onCancel={() => setPending(null)}
            busy={busy}
            replaceAsked={replaceAsked}
            appOnly={appOnly}
          />
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Exportar {year}</h2>
        <p className="mb-3 text-sm text-slate-600">
          Gera a planilha no mesmo layout do arquivo importado (valores, comentários e verde de pago), mais a aba “Lançamentos”.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportXlsx} disabled={busy}>Baixar .xlsx</button>
          <button className="btn" onClick={exportJson}>Backup .json</button>
          <label className="btn cursor-pointer">
            Restaurar backup…
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && setRestoreFile(e.target.files[0])} />
          </label>
        </div>
        {restoreFile && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-900">
            Restaurar “{restoreFile.name}” substitui TODOS os dados deste navegador.
            <button className="btn" onClick={() => importJson(restoreFile)}>Restaurar</button>
            <button className="btn" onClick={() => setRestoreFile(null)}>Cancelar</button>
          </div>
        )}
        {exportWarnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{exportWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
      </section>
    </div>
  );
}

function Preview({ pending, setYear, onConfirm, onCancel, busy, replaceAsked, appOnly }: {
  pending: Pending;
  setYear: (y: number | '') => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  replaceAsked: boolean;
  appOnly: number;
}) {
  const { result } = pending;
  const counts = TX_TYPES.map((t) => ({ t, n: result.transactions.filter((x) => x.type === t).length }));
  const uncategorized = result.transactions.filter((t) => t.category === 'Outros');
  const mine = totalsByType(result.transactions);
  const diffs = TX_TYPES.flatMap((type) =>
    (result.sheetTotals[type] ?? []).map((sheet, i) => ({ type, month: i, sheet, app: mine[type][i], diff: round2(mine[type][i] - sheet) })),
  ).filter((d) => Math.abs(d.diff) >= 0.01);

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>Ano:</span>
        <input className="input w-24" type="number" value={pending.year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')} />
        <span className="text-slate-500">
          {result.yearSource === 'A1' ? '(lido da célula A1)' : result.yearSource === 'filename' ? '(lido do nome do arquivo)' : '(não encontrado: informe)'}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {counts.map(({ t, n }) => <li key={t} className="chip">{TYPE_LABELS[t]}: {n}</li>)}
        <li className="chip">Sem categoria (Outros): {uncategorized.length}</li>
      </ul>
      {diffs.length > 0 && (
        <details>
          <summary className="cursor-pointer">Diferenças em relação aos Totais da planilha ({diffs.length})</summary>
          <p className="mt-1 text-slate-600">
            Normal: o app conta o bloco amarelo de mercado uma vez só (a planilha soma em variáveis e em fixas) e lê números salvos como texto.
          </p>
          <table className="mt-1">
            <tbody>
              {diffs.map((d) => (
                <tr key={`${d.type}-${d.month}`}>
                  <td className="pr-3">{TYPE_LABELS[d.type]} · {MONTH_LABELS[d.month]}</td>
                  <td className="pr-3 text-right tabular-nums">planilha {eur.format(d.sheet)}</td>
                  <td className="pr-3 text-right tabular-nums">app {eur.format(d.app)}</td>
                  <td className="text-right tabular-nums">{d.diff > 0 ? '+' : ''}{eur.format(d.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {result.warnings.length > 0 && (
        <details>
          <summary className="cursor-pointer">Avisos ({result.warnings.length})</summary>
          <ul className="mt-1 list-disc pl-5 text-amber-800">
            {result.warnings.map((w, i) => <li key={i}>{w.cell && <b>{w.cell}: </b>}{w.message}</li>)}
          </ul>
        </details>
      )}
      {replaceAsked && (
        <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
          Já existem dados de {pending.year}. Os valores vindos da planilha serão substituídos pelos deste arquivo
          (categorias escolhidas à mão nas mesmas células são mantidas).
          {appOnly > 0 && ` ${appOnly} lançamento(s) criado(s) no app continuam.`}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending.year === '' || busy} onClick={onConfirm}>
          {replaceAsked ? `Substituir ${pending.year}` : `Salvar ${pending.year}`}
        </button>
        <button className="btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
