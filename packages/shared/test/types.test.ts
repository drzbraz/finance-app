import { DEFAULT_SETTINGS, TX_TYPES, TYPE_LABELS } from '../src/types.js';

describe('types', () => {
  it('lists every TxType exactly once', () => {
    expect(new Set(TX_TYPES).size).toBe(TX_TYPES.length);
    expect([...TX_TYPES].sort()).toEqual(Object.keys(TYPE_LABELS).sort());
  });

  it('has a non-empty Portuguese label for every type', () => {
    for (const t of TX_TYPES) expect(TYPE_LABELS[t].trim()).not.toBe('');
  });

  it('ships sane default settings', () => {
    expect(DEFAULT_SETTINGS.id).toBe('settings');
    expect(DEFAULT_SETTINGS.eurBrlRate).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.savingsRateTarget).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.savingsRateTarget).toBeLessThanOrEqual(1);
    for (const k of ['goalBRL', 'reserveEUR', 'patrimonyBR', 'patrimonyEU'] as const) {
      expect(DEFAULT_SETTINGS[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
