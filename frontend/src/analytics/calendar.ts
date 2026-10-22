import type { Transaction } from '@finance/shared';
import { round2 } from '../util';
import { daysInMonth } from './bills';

export interface CalendarDay {
  day: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  total: number;
  entries: Transaction[];
  isFuture: boolean;
}

export interface SpendCalendar {
  days: CalendarDay[];
  /** Blank cells before day 1, so the grid starts on Monday. */
  offset: number;
  max: number;
  /** Average spend per weekday (Monday first) over the days gone, for the row under the grid. */
  weekdayAverage: number[];
  /** Entries with no real day: the sheet puts them on the 1st when the cell has no dated note. */
  undated: { count: number; total: number };
}

const isFlexible = (t: Transaction) => t.type === 'variable' || t.type === 'additional';

/**
 * A sheet cell's day comes from its note's timestamp ("Ana    (2026-10-13 09:12:00)") when the note
 * was written that month; otherwise the import puts it on the 1st, which is not the day it was spent.
 */
export const hasRealDay = (t: Transaction): boolean =>
  !!t.date && (!t.source || !t.date.endsWith('-01') || !!t.noteHeader?.includes(`(${t.date}`));

/** Day-to-day spending (variable + additional) per day of the month, for the heat map. */
export function spendCalendar(txs: Transaction[], year: number, month: number, today: Date): SpendCalendar {
  const dim = daysInMonth(year, month);
  const inMonth = txs.filter((t) => t.year === year && t.month === month && isFlexible(t) && t.amount > 0);
  const dated = inMonth.filter(hasRealDay);
  const undated = inMonth.filter((t) => !hasRealDay(t));
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const todayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  const days: CalendarDay[] = Array.from({ length: dim }, (_, i) => {
    const day = i + 1;
    const entries = dated.filter((t) => Number(t.date!.slice(8, 10)) === day).sort((a, b) => b.amount - a.amount);
    return {
      day,
      weekday: (firstWeekday + i) % 7,
      total: round2(entries.reduce((a, t) => a + t.amount, 0)),
      entries,
      isFuture: year * 10000 + month * 100 + day > todayKey,
    };
  });

  const weekdayAverage = Array.from({ length: 7 }, (_, w) => {
    const gone = days.filter((d) => d.weekday === w && !d.isFuture);
    return gone.length ? round2(gone.reduce((a, d) => a + d.total, 0) / gone.length) : 0;
  });
  return {
    days,
    offset: firstWeekday,
    max: Math.max(0, ...days.map((d) => d.total)),
    weekdayAverage,
    undated: { count: undated.length, total: round2(undated.reduce((a, t) => a + t.amount, 0)) },
  };
}

/** 0 for no spending, else 1–4 by the share of the month's busiest day (√ so small days still show). */
export function heatLevel(total: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(total / max) * 4))) as 1 | 2 | 3 | 4;
}
