import { splitShare } from '@finance/shared';
import { eur } from '../util';

/**
 * "Paguei e dividi no Splitwise": the amount typed is what I paid, and only my equal share
 * (total ÷ people) counts. `people` is null when the entry is not split.
 */
export default function SplitFields({ people, total, onChange }: { people: number | null; total: number | null; onChange: (people: number | null) => void }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={people !== null} onChange={(e) => onChange(e.target.checked ? 2 : null)} />
        Paguei e dividi no Splitwise
      </label>
      {people !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-2">Pessoas (com você)</span>
            <span className="flex items-center rounded-xl border border-line">
              <button type="button" className="px-3 py-1.5 text-ink-2 disabled:opacity-40" onClick={() => onChange(people - 1)} disabled={people <= 2} aria-label="Menos uma pessoa">−</button>
              <input
                type="number"
                min={2}
                max={100}
                className="num w-12 bg-transparent text-center outline-none"
                value={people}
                onChange={(e) => onChange(Math.min(100, Math.max(2, Math.round(Number(e.target.value)) || 2)))}
                aria-label="Pessoas"
              />
              <button type="button" className="px-3 py-1.5 text-ink-2 disabled:opacity-40" onClick={() => onChange(people + 1)} disabled={people >= 100} aria-label="Mais uma pessoa">+</button>
            </span>
          </label>
          {total !== null && total > 0 && (
            <p className="text-sm">
              Sua parte: <strong className="num">{eur.format(splitShare(total, people))}</strong>
              <span className="text-ink-3"> de {eur.format(total)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
