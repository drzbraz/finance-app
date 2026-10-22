import { argbToHsl, isLightYellow, isNeutral, isPaidGreen } from '../src/text/color.js';
import { normalize } from '../src/text/normalize.js';
import { parseLooseNumber } from '../src/text/numbers.js';
import { extractTags } from '../src/text/tags.js';
import { newId } from '../src/ids.js';

describe('normalize', () => {
  it('strips accents, lowercases and collapses whitespace', () => {
    expect(normalize('  Despesas   Variáveis ')).toBe('despesas variaveis');
    expect(normalize('Açoes')).toBe(normalize('Ações'.replace('õ', 'o')));
    expect(normalize('MARÇO')).toBe('marco');
  });
});

describe('parseLooseNumber', () => {
  it.each([
    ['10,50', 10.5],
    ['1.032,00', 1032],
    ['1.032', 1032],
    ['1,032.50', 1032.5],
    ['12.5', 12.5],
    ['€ 30', 30],
    ['R$ 30', 30],
    ['R$ 1.200,90', 1200.9],
    ['-10,5', -10.5],
    ['1 200', 1200],
  ])('parseLooseNumber(%j) = %d', (raw, n) => expect(parseLooseNumber(raw)).toBe(n));

  it.each([' ', '', 'abc', '10,50,3', '#DIV/0!', '1.2.3'])('parseLooseNumber(%j) = null', (raw) =>
    expect(parseLooseNumber(raw)).toBeNull(),
  );

});

describe('color', () => {
  it('converts ARGB and RGB to HSL', () => {
    expect(argbToHsl('FFFFFFFF')).toEqual({ h: 0, s: 0, l: 1 });
    const g = argbToHsl('D9EAD3')!;
    expect(g.h).toBeCloseTo(104.3, 0);
    expect(argbToHsl('nope')).toBeNull();
    expect(argbToHsl(undefined)).toBeNull();
  });

  it.each(['FFD9EAD3', 'FFB6D7A8', 'FFD9F2D0'])('%s is paid green', (c) => expect(isPaidGreen(c)).toBe(true));
  it.each(['FF0B5394', 'FF351C75', 'FFFFF2CC', 'FFFFFFFF', 'FF00FF00', undefined])('%s is not paid green', (c) =>
    expect(isPaidGreen(c)).toBe(false),
  );

  it('detects the grocery yellow only', () => {
    expect(isLightYellow('FFFFF2CC')).toBe(true);
    expect(isLightYellow('FFFFE599')).toBe(true);
    expect(isLightYellow('FFD9EAD3')).toBe(false);
    expect(isLightYellow('FF0B5394')).toBe(false);
  });

  it('treats white, greys and no fill as neutral', () => {
    expect([undefined, 'FFFFFFFF', 'FFEFEFEF', 'FF000000'].every(isNeutral)).toBe(true);
    expect(isNeutral('FFFFF2CC')).toBe(false);
  });
});

describe('extractTags', () => {
  it('extracts unique lowercase hashtags, including accents', () => {
    expect(extractTags('Jantar #Amigos #viagem-2026 #amigos #São_João')).toEqual(['amigos', 'viagem-2026', 'são_joão']);
    expect(extractTags('sem tags')).toEqual([]);
  });
});

describe('newId', () => {
  it('is prefixed and unique', () => {
    const a = newId('rule');
    expect(a).toMatch(/^rule-[a-z0-9]+-[a-z0-9]+$/);
    expect(newId()).toMatch(/^tx-/);
    expect(newId()).not.toBe(newId());
  });
});
