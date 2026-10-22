/** "10,50" -> 10.5, "1.032,00" -> 1032, "1,032.50" -> 1032.5, "€ 30" / "R$ 30" -> 30. Null when not numeric. */
export function parseLooseNumber(raw: string): number | null {
  let s = raw.replace(/R\$|[€\s ]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
