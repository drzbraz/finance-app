import { useEffect, useRef, useState } from 'react';
import { downloadBlob, XLSX_MIME } from '../download';
import { useUnexported } from '../hooks';
import { useClearToasts, useToast } from './layout/Toast';
import { exportBackup, exportYearXlsx } from '../api/repo';

/** "Exportar" button: xlsx in the original layout, or a JSON backup. Shows unexported changes. */
export default function ExportMenu({ year, compact = false }: { year: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useUnexported(year);
  const toast = useToast();
  const clearToasts = useClearToasts();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const xlsx = async () => {
    setOpen(false);
    setBusy(true);
    try {
      const out = await exportYearXlsx(year);
      // The export re-points entries to new ids/cells, so earlier undos would restore stale rows.
      clearToasts();
      downloadBlob(out.data, out.fileName, XLSX_MIME);
      toast(out.warnings.length ? `Planilha exportada com ${out.warnings.length} aviso(s): ${out.warnings[0]}` : 'Planilha exportada');
    } catch (e) {
      toast(`Erro ao exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const json = async () => {
    setOpen(false);
    downloadBlob(JSON.stringify(await exportBackup()), `financas-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    toast('Backup salvo');
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn relative" onClick={() => setOpen(!open)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>
        <span aria-hidden>⬇︎</span>
        {!compact && <span>{busy ? 'Exportando…' : 'Exportar'}</span>}
        {pending > 0 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-ink" title={`${pending} alteração(ões) não exportada(s)`}>
            {pending}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
          {pending > 0 && <p className="px-3 py-2 text-xs text-ink-2">{pending} alteração(ões) em {year} ainda não estão na planilha.</p>}
          <button role="menuitem" className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2" onClick={xlsx}>
            <div className="text-sm font-medium">📊 Planilha {year} (.xlsx)</div>
            <div className="text-xs text-ink-3">Mesmo layout do Google Sheets, com verde de pago e comentários</div>
          </button>
          <button role="menuitem" className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-2" onClick={json}>
            <div className="text-sm font-medium">💾 Backup completo (.json)</div>
            <div className="text-xs text-ink-3">Todos os anos, orçamentos, metas e regras</div>
          </button>
        </div>
      )}
    </div>
  );
}
