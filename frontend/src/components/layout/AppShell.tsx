import type { ThemePref } from '@finance/shared';
import type { ReactNode } from 'react';
import ExportMenu from '../ExportMenu';
import MonthSwitcher from './MonthSwitcher';
import { PAGES, type PageId } from './nav';
import ThemeToggle from './ThemeToggle';

interface Props {
  page: PageId;
  onPage: (p: PageId) => void;
  year: number;
  month: number;
  years: number[];
  onMonth: (year: number, month: number) => void;
  theme: ThemePref;
  onAdd: () => void;
  onImport: () => void;
  children: ReactNode;
}

export default function AppShell({ page, onPage, year, month, years, onMonth, theme, onAdd, onImport, children }: Props) {
  return (
    <div className="min-h-screen lg:pl-60">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-ink">€</span>
          <span className="text-lg font-bold">Finanças</span>
        </div>
        <button className="btn-primary mb-4 w-full py-2.5" onClick={onAdd} title="Atalho: ⌥N (ou N fora de um campo)">
          + Novo lançamento
        </button>
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => onPage(p.id)}
              aria-current={page === p.id ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${page === p.id ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
            >
              <span aria-hidden>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-3 text-xs text-ink-3">🔒 Seus dados ficam só no seu computador.</p>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <span className="mr-1 flex h-8 w-8 items-center justify-center rounded-xl bg-accent font-bold text-accent-ink lg:hidden" aria-hidden>€</span>
          <MonthSwitcher year={year} month={month} years={years} onChange={onMonth} />
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle pref={theme} />
            {/* Import/export live with the data settings; Comparar and the empty Início have their own import. */}
            {page === 'settings' && (
              <>
                <button className="btn" onClick={onImport} aria-label="Importar" title="Importar (ou arraste o arquivo para qualquer lugar da tela)">
                  <span aria-hidden>⬆︎</span>
                  <span className="hidden sm:inline">Importar</span>
                </button>
                <div className="hidden sm:block"><ExportMenu year={year} /></div>
                <div className="sm:hidden"><ExportMenu year={year} compact /></div>
              </>
            )}
            <button className="btn-primary hidden sm:inline-flex lg:hidden" onClick={onAdd}>+ Novo</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>

      {/* Floating add + bottom tabs (phone) */}
      <button
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl text-accent-ink shadow-lg sm:hidden"
        onClick={onAdd}
        aria-label="Novo lançamento"
      >
        +
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface lg:hidden" aria-label="Principal">
        {PAGES.filter((p) => p.mobile).map((p) => (
          <button
            key={p.id}
            onClick={() => onPage(p.id)}
            aria-current={page === p.id ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${page === p.id ? 'text-accent' : 'text-ink-3'}`}
          >
            <span className="text-lg" aria-hidden>{p.icon}</span>
            {p.label}
          </button>
        ))}
        <MoreMenu page={page} onPage={onPage} />
      </nav>
    </div>
  );
}

function MoreMenu({ page, onPage }: { page: PageId; onPage: (p: PageId) => void }) {
  const extra = PAGES.filter((p) => !p.mobile);
  const active = extra.some((p) => p.id === page);
  return (
    <details className="group relative">
      <summary className={`flex cursor-pointer list-none flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-accent' : 'text-ink-3'}`}>
        <span className="text-lg" aria-hidden>•••</span>
        Mais
      </summary>
      <div className="absolute bottom-full right-2 mb-2 w-48 rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
        {extra.map((p) => (
          <button
            key={p.id}
            onClick={(e) => {
              onPage(p.id);
              (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
          >
            <span aria-hidden>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>
    </details>
  );
}
