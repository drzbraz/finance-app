import { useState } from 'react';
import { heatLevel, spendCalendar } from '../analytics/calendar';
import { categoryIcon } from '../categories';
import type { Transaction } from '@finance/shared';
import type { ChartColors } from '../theme';
import { eur, MONTH_NAMES } from '../util';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/**
 * "Calendário de gastos": each day of the month shaded by its day-to-day spending (one blue,
 * light → dark), so busy days and weekly habits stand out. A day opens its entries below.
 */
export default function SpendCalendar({ txs, year, month, today, colors }: { txs: Transaction[]; year: number; month: number; today: Date; colors: ChartColors }) {
  const cal = spendCalendar(txs, year, month, today);
  const [selected, setSelected] = useState<number | null>(null);
  const day = selected ? cal.days[selected - 1] : null;
  const busiest = cal.weekdayAverage.indexOf(Math.max(...cal.weekdayAverage));
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  return (
    <div>
      <p className="-mt-1 mb-3 text-sm text-ink-2">
        {cal.max > 0
          ? `Dia mais pesado: ${eur.format(cal.max)}. Na média, ${WEEKDAY_NAMES[busiest]} é o dia em que você mais gasta (${eur.format(cal.weekdayAverage[busiest])}).`
          : 'Nenhum gasto do dia a dia com data neste mês.'}
      </p>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Gastos por dia em ${MONTH_NAMES[month - 1]}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-medium text-ink-3" role="columnheader">{w}</div>
        ))}
        {Array.from({ length: cal.offset }, (_, i) => <div key={`blank-${i}`} aria-hidden />)}
        {cal.days.map((d) => {
          const level = d.isFuture ? 0 : heatLevel(d.total, cal.max);
          const label = `${d.day} de ${MONTH_NAMES[month - 1].toLowerCase()}: ${d.total > 0 ? `${eur.format(d.total)} em ${d.entries.length} lançamento(s)` : 'sem gastos'}`;
          return (
            <button
              key={d.day}
              type="button"
              role="gridcell"
              aria-label={label}
              aria-pressed={selected === d.day}
              title={label}
              disabled={d.isFuture}
              onClick={() => setSelected(selected === d.day ? null : d.day)}
              className={`group relative flex aspect-square min-h-9 flex-col items-start justify-between rounded-lg p-1 text-left transition duration-200 ease-out hover:scale-[1.06] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none sm:p-1.5 ${selected === d.day ? 'ring-2 ring-ink' : ''} ${isToday(d.day) ? 'outline outline-1 outline-offset-1 outline-accent' : ''}`}
              style={{ background: colors.heat[level], color: colors.heatInk[level] }}
            >
              <span className="text-[11px] font-semibold leading-none">{d.day}</span>
              {d.total > 0 && <span className="num hidden text-[10px] leading-none opacity-90 sm:block">{Math.round(d.total)}€</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span className="flex items-center gap-1" aria-hidden>
          Menos
          {colors.heat.map((c, i) => <span key={i} className="h-3 w-3 rounded-sm" style={{ background: c }} />)}
          Mais
        </span>
        {cal.undated.count > 0 && <span>{cal.undated.count} lançamento(s) sem dia ({eur.format(cal.undated.total)}) ficam fora do calendário.</span>}
      </div>

      {day && (
        <div key={day.day} className="animate-in mt-3 rounded-xl border border-line p-3">
          <p className="mb-1.5 text-sm font-semibold">
            {day.day} de {MONTH_NAMES[month - 1].toLowerCase()} · {eur.format(day.total)}
          </p>
          {day.entries.length ? (
            <ul className="space-y-1 text-sm">
              {day.entries.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span aria-hidden>{categoryIcon(t.category)}</span>
                  <span className="min-w-0 flex-1 truncate">{t.description}<span className="text-ink-3"> · {t.category}</span></span>
                  <span className="num">{eur.format(t.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Nenhum gasto neste dia.</p>
          )}
        </div>
      )}
    </div>
  );
}
