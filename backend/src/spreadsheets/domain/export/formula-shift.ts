/**
 * Shifts A1 row references in a formula after inserting `count` rows at `atRow`
 * (refs to rows >= atRow move down). Like Excel, absolute rows ($5) move too.
 * Text inside double quotes and function names (LOG10( ...) are left alone.
 *
 * `extendEndingAt`: ranges whose end row equals this row are stretched to include the
 * inserted rows (used when inserting right before a section's Total row).
 */
export function shiftFormulaRows(formula: string, atRow: number, count = 1, extendEndingAt?: number): string {
  let out = '';
  let i = 0;
  while (i < formula.length) {
    if (formula[i] === '"') {
      const end = findStringEnd(formula, i);
      out += formula.slice(i, end);
      i = end;
      continue;
    }
    const rest = formula.slice(i);
    const prev = i > 0 ? formula[i - 1] : '';
    const range = /^(\$?[A-Z]{1,3})(\$?)(\d+):(\$?[A-Z]{1,3})(\$?)(\d+)/.exec(rest);
    if (range && !/[A-Za-z0-9_.]/.test(prev) && !isFunctionCall(rest, range[0].length)) {
      const r1 = Number(range[3]);
      const r2 = Number(range[6]);
      const n1 = r1 >= atRow ? r1 + count : r1;
      const n2 = r2 >= atRow || (extendEndingAt !== undefined && r2 === extendEndingAt && r1 <= r2) ? r2 + count : r2;
      out += `${range[1]}${range[2]}${n1}:${range[4]}${range[5]}${n2}`;
      i += range[0].length;
      continue;
    }
    const ref = /^(\$?[A-Z]{1,3})(\$?)(\d+)/.exec(rest);
    if (ref && !/[A-Za-z0-9_.]/.test(prev) && !isFunctionCall(rest, ref[0].length)) {
      const r = Number(ref[3]);
      out += `${ref[1]}${ref[2]}${r >= atRow ? r + count : r}`;
      i += ref[0].length;
      continue;
    }
    // Skip a whole identifier so "LOG10" is not read as a cell ref.
    const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (word) {
      out += word[0];
      i += word[0].length;
      continue;
    }
    out += formula[i++];
  }
  return out;
}

function findStringEnd(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '"') {
      if (s[i + 1] === '"') i += 2;
      else return i + 1;
    } else i++;
  }
  return s.length;
}

function isFunctionCall(s: string, len: number): boolean {
  return /^[A-Za-z0-9_.]/.test(s.slice(len)) || s[len] === '(';
}
