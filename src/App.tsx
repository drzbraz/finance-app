import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import ImportExportPage from './components/ImportExportPage';
import MonthChecklist from './components/MonthChecklist';
import MonthlyGrid from './components/MonthlyGrid';
import SettingsPage from './components/SettingsPage';
import TransactionsTable from './components/TransactionsTable';
import { useYears } from './hooks';
import { MONTH_NAMES } from './util';

const TABS = [
  { id: 'checklist', label: 'Checklist do mês' },
  { id: 'grid', label: 'Grade mensal' },
  { id: 'transactions', label: 'Lançamentos' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'import', label: 'Importar / Exportar' },
  { id: 'settings', label: 'Configurações' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function App() {
  const years = useYears();
  const now = new Date();
  const [tab, setTab] = useState<Tab>('checklist');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Fall back to the latest imported year when the current one has no data.
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[years.length - 1]);
  }, [years, year]);

  const empty = years.length === 0;
  const active: Tab = empty && tab !== 'settings' ? 'import' : tab;

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-xl font-bold">Finanças</h1>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${active === t.id ? 'bg-emerald-600 text-white' : 'hover:bg-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mês">
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano">
            {[...new Set([...years, year])].sort().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </header>

      {empty && active === 'import' && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nenhum dado ainda. Importe a sua planilha .xlsx para começar. Tudo fica só neste navegador.
        </p>
      )}

      {active === 'checklist' && <MonthChecklist year={year} month={month} />}
      {active === 'grid' && <MonthlyGrid year={year} />}
      {active === 'transactions' && <TransactionsTable year={year} month={month} />}
      {active === 'dashboard' && <Dashboard year={year} month={month} />}
      {active === 'import' && <ImportExportPage year={year} onImported={(y) => { setYear(y); setTab('checklist'); }} />}
      {active === 'settings' && <SettingsPage />}
    </div>
  );
}
