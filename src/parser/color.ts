export interface Hsl {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

/** Accepts "FFD9EAD3" (ARGB) or "D9EAD3" (RGB). Returns null for anything else. */
export function argbToHsl(argb: string | undefined | null): Hsl | null {
  if (!argb) return null;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Tolerant "light green" check used for paid/received cells (Google's #D9EAD3 and similar). */
export function isPaidGreen(argb: string | undefined | null): boolean {
  const hsl = argbToHsl(argb);
  if (!hsl) return false;
  return hsl.h >= 80 && hsl.h <= 160 && hsl.s >= 0.1 && hsl.l >= 0.6 && hsl.l < 0.98;
}

/** Light yellow highlight (Google's #FFF2CC), used for the grocery sub-block. */
export function isLightYellow(argb: string | undefined | null): boolean {
  const hsl = argbToHsl(argb);
  if (!hsl) return false;
  return hsl.h >= 38 && hsl.h <= 65 && hsl.s >= 0.3 && hsl.l >= 0.7 && hsl.l < 0.98;
}

/** White/no colour: ignored as a subgroup marker. */
export function isNeutral(argb: string | undefined | null): boolean {
  const hsl = argbToHsl(argb);
  return !hsl || hsl.l >= 0.98 || hsl.s < 0.05;
}

export const PAID_GREEN = 'FFD9EAD3';
export const GROCERY_YELLOW = 'FFFFF2CC';
