import { MONTH_NAMES } from '../../util';

interface Props {
  year: number;
  month: number;
  years: number[];
  onChange: (year: number, month: number) => void;
}

/** ‹ Outubro 2026 › with arrows that roll over years, plus selects for jumping. */
export default function MonthSwitcher({ year, month, years, onChange }: Props) {
  const step = (d: number) => {
    let m = month + d;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    onChange(y, m);
  };
  const allYears = [...new Set([...years, year, new Date().getFullYear()])].sort();
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5">
      <button className="btn-ghost px-2 py-1.5" onClick={() => step(-1)} aria-label="Mês anterior">‹</button>
      <label className="relative">
        <span className="sr-only">Mês</span>
        <select
          className="cursor-pointer appearance-none bg-transparent py-1 pl-1 text-sm font-semibold focus:outline-none"
          value={month}
          onChange={(e) => onChange(year, Number(e.target.value))}
        >
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Ano</span>
        <select
          className="cursor-pointer appearance-none bg-transparent py-1 pr-1 text-sm font-semibold focus:outline-none"
          value={year}
          onChange={(e) => onChange(Number(e.target.value), month)}
        >
          {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <button className="btn-ghost px-2 py-1.5" onClick={() => step(1)} aria-label="Próximo mês">›</button>
    </div>
  );
}
