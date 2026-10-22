import type { Unusual as UnusualRow } from '../analytics/unusual';
import { categoryIcon } from '../categories';
import { eur, pct } from '../util';

/**
 * "Fora do normal": each category spending clearly more than usual, with a bar of what was
 * spent against the mark of a usual month by now.
 */
export default function Unusual({ rows, isCurrent, onCategory }: { rows: UnusualRow[]; isCurrent: boolean; onCategory?: (category: string) => void }) {
  if (!rows.length) {
    return <p className="text-sm text-ink-2">Tudo dentro do seu normal {isCurrent ? 'até hoje' : 'neste mês'}. ✓</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const scale = Math.max(r.spent, r.expected) || 1;
        return (
          <li key={r.category} className="animate-in">
            <button className="w-full rounded-lg text-left transition hover:bg-surface-2/60" onClick={() => onCategory?.(r.category)} title="Ver os lançamentos">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {categoryIcon(r.category)} {r.category}
                  <span className="ml-2 text-xs font-semibold text-warn">
                    ▲ {r.above === null ? 'novo este mês' : `${pct.format(r.above)} acima`}
                  </span>
                </span>
                <span className="num text-ink-2">{eur.format(r.spent)}</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-warn transition-[width] duration-700 ease-out" style={{ width: `${(r.spent / scale) * 100}%` }} />
                {r.expected > 0 && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(r.expected / scale) * 100}%` }} />}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {r.above === null
                  ? 'Sem gastos nesta categoria nos meses anteriores.'
                  : `Normal ${isCurrent ? 'até hoje' : 'no mês'}: ~${eur.format(r.expected)} (média de ${eur.format(r.usual)}/mês) · ${eur.format(r.spent - r.expected)} a mais`}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
