import { db } from '../db/schema';
import { useRules, useSettings } from '../hooks';
import type { Settings } from '../types';

const FIELDS: { key: keyof Omit<Settings, 'id'>; label: string; hint?: string; step?: string }[] = [
  { key: 'eurBrlRate', label: 'Câmbio EUR → BRL', hint: 'Sem internet, o app não busca a cotação: atualize aqui.', step: '0.0001' },
  { key: 'goalBRL', label: 'Meta (R$)' },
  { key: 'patrimonyBR', label: 'Patrimônio no Brasil (R$)' },
  { key: 'patrimonyEU', label: 'Patrimônio na Europa (€)' },
  { key: 'reserveEUR', label: 'Reserva (€)' },
  { key: 'savingsRateTarget', label: 'Meta de taxa de poupança (0–1)', step: '0.01' },
];

export default function SettingsPage() {
  const settings = useSettings();
  const rules = useRules();
  const save = (patch: Partial<Settings>) => db.settings.put({ ...settings, ...patch, id: 'settings' });
  const custom = rules.filter((r) => !r.id.startsWith('seed-'));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="font-semibold">Configurações</h2>
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="text-slate-700">{f.label}</span>
            <input
              key={settings[f.key]}
              type="number"
              step={f.step ?? '1'}
              className="input mt-1 w-full"
              defaultValue={settings[f.key]}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) save({ [f.key]: v });
              }}
            />
            {f.hint && <span className="text-xs text-slate-500">{f.hint}</span>}
          </label>
        ))}
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Regras criadas por você ({custom.length})</h2>
        <ul className="space-y-1 text-sm">
          {custom.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <span>“{r.keyword}” → {r.category}</span>
              <button className="text-slate-400 hover:text-red-600" onClick={() => db.rules.delete(r.id)} title="Remover regra">✕</button>
            </li>
          ))}
          {!custom.length && <li className="text-slate-500">Nenhuma ainda. Ao mudar uma categoria, o app oferece criar uma.</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-500">{rules.length - custom.length} regras padrão (palavras-chave e despesas fixas).</p>
      </section>
    </div>
  );
}
