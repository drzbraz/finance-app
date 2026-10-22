import type { ThemePref } from '@finance/shared';
import { saveSettings } from '../../api/repo';

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const ICON: Record<ThemePref, string> = { system: '🌓', light: '☀️', dark: '🌙' };
const LABEL: Record<ThemePref, string> = { system: 'Tema automático', light: 'Tema claro', dark: 'Tema escuro' };

export default function ThemeToggle({ pref }: { pref: ThemePref }) {
  return (
    <button className="btn-ghost px-2" onClick={() => saveSettings({ theme: NEXT[pref] })} title={`${LABEL[pref]} (clique para trocar)`} aria-label={LABEL[pref]}>
      <span aria-hidden>{ICON[pref]}</span>
    </button>
  );
}
