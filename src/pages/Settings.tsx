import { useState } from 'react';
import { useToast } from '../components/layout/Toast';
import { PageHeader, Segmented } from '../components/ui';
import { db } from '../db/schema';
import { deleteYear, saveSettings } from '../db/repo';
import { useRules, useSettings, useYears } from '../hooks';
import type { Settings, ThemePref } from '../types';

const FIELDS: { key: 'eurBrlRate' | 'patrimonyBR' | 'patrimonyEU' | 'reserveEUR' | 'savingsRateTarget'; label: string; hint?: string; step?: string; percent?: boolean }[] = [
  { key: 'eurBrlRate', label: 'Câmbio: 1 € em R$', hint: 'O app não acessa a internet; atualize a cotação aqui.', step: '0.0001' },
  { key: 'patrimonyBR', label: 'Patrimônio no Brasil (R$)' },
  { key: 'patrimonyEU', label: 'Patrimônio na Europa (€)' },
  { key: 'reserveEUR', label: 'Reserva de emergência (€)' },
  { key: 'savingsRateTarget', label: 'Meta de taxa de poupança (%)', percent: true },
];

export default function SettingsPage() {
  const settings = useSettings();
  const rules = useRules();
  const years = useYears() ?? [];
  const toast = useToast();
  const [confirmYear, setConfirmYear] = useState<number | null>(null);
  const custom = rules.filter((r) => !r.id.startsWith('seed-'));

  const save = (key: (typeof FIELDS)[number]['key'], raw: string, percent?: boolean) => {
    // Empty input is ignored (never saved as 0).
    if (raw.trim() === '') return;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return;
    saveSettings({ [key]: percent ? v / 100 : v } as Partial<Settings>);
    toast('Configuração salva');
  };

  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-4">
          <h2 className="text-sm font-semibold">Valores</h2>
          {FIELDS.map((f) => {
            const value = f.percent ? Math.round(settings[f.key] * 1000) / 10 : settings[f.key];
            return (
              <label key={f.key} className="block">
                <span className="text-sm text-ink-2">{f.label}</span>
                <input
                  key={value}
                  type="number"
                  step={f.step ?? 'any'}
                  className="input num mt-1"
                  defaultValue={value}
                  onBlur={(e) => e.target.value !== String(value) && save(f.key, e.target.value, f.percent)}
                />
                {f.hint && <span className="mt-1 block text-xs text-ink-3">{f.hint}</span>}
              </label>
            );
          })}
        </section>

        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-3 text-sm font-semibold">Aparência</h2>
            <Segmented<ThemePref>
              label="Tema"
              value={settings.theme}
              onChange={(theme) => saveSettings({ theme })}
              options={[{ value: 'system', label: '🌓 Automático' }, { value: 'light', label: '☀️ Claro' }, { value: 'dark', label: '🌙 Escuro' }]}
            />
          </section>

          <section className="card">
            <h2 className="mb-1 text-sm font-semibold">Suas regras de categoria</h2>
            <p className="mb-3 text-xs text-ink-3">Criadas quando você muda uma categoria. Mais {rules.length - custom.length} regras padrão.</p>
            <ul className="divide-y divide-line text-sm">
              {custom.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span>“{r.keyword}” → {r.category}</span>
                  <button className="btn-ghost px-2 text-ink-3 hover:text-bad" onClick={() => db.rules.delete(r.id)} aria-label={`Remover regra ${r.keyword}`}>✕</button>
                </li>
              ))}
              {!custom.length && <li className="py-2 text-ink-3">Nenhuma ainda.</li>}
            </ul>
          </section>

          <section className="card">
            <h2 className="mb-3 text-sm font-semibold">Dados</h2>
            <p className="mb-3 text-xs text-ink-3">🔒 Tudo fica no armazenamento deste navegador. Use Exportar → Backup .json para guardar uma cópia; restaure arrastando o .json para a janela.</p>
            <ul className="divide-y divide-line text-sm">
              {years.map((y) => (
                <li key={y} className="flex items-center justify-between gap-2 py-2">
                  <span>{y}</span>
                  {confirmYear === y ? (
                    <span className="flex gap-2">
                      <button className="btn" onClick={() => setConfirmYear(null)}>Cancelar</button>
                      <button
                        className="btn text-bad"
                        onClick={async () => {
                          await deleteYear(y);
                          setConfirmYear(null);
                          toast(`${y} removido deste navegador`);
                        }}
                      >
                        Apagar {y}
                      </button>
                    </span>
                  ) : (
                    <button className="btn-ghost text-ink-3 hover:text-bad" onClick={() => setConfirmYear(y)}>Apagar ano…</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
