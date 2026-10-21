import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ChartColors } from '../theme';
import { TYPE_LABELS } from '../types';
import { eur } from '../util';

const euroTick = (v: number) => `€${Math.round(v)}`;

function axis(c: ChartColors) {
  return { stroke: c.grid, tick: { fill: c.ink2, fontSize: 11 }, tickLine: false };
}

function tooltip(c: ChartColors) {
  return {
    contentStyle: { background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, color: c.ink, fontSize: 12 },
    labelStyle: { color: c.ink, fontWeight: 600 },
    itemStyle: { color: c.ink },
    cursor: { fill: c.cursor, stroke: c.grid },
  };
}

export interface MonthRow {
  month: string;
  rate: number | null;
  fixed: number;
  variable: number;
  additional: number;
  investment: number;
  cumulative: number | null;
}

export function SavingsRateChart({ data, target, colors }: { data: MonthRow[]; target: number; colors: ChartColors }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis dataKey="month" {...axis(colors)} />
        <YAxis {...axis(colors)} unit="%" width={44} />
        <Tooltip {...tooltip(colors)} formatter={(v: number) => [`${v}%`, 'Taxa de poupança']} />
        <ReferenceLine y={target} stroke={colors.muted} strokeDasharray="4 4" label={{ value: `Meta ${target}%`, fill: colors.ink2, fontSize: 11, position: 'insideTopRight' }} />
        <Line type="linear" dataKey="rate" stroke={colors.series[0]} strokeWidth={2} dot={{ r: 4, fill: colors.surface, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SpendStackChart({ data, colors }: { data: MonthRow[]; colors: ChartColors }) {
  const seg = { stackId: 'a', stroke: colors.surface, strokeWidth: 2 };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis dataKey="month" {...axis(colors)} />
        <YAxis {...axis(colors)} tickFormatter={euroTick} width={56} />
        <Tooltip {...tooltip(colors)} formatter={(v: number, name: string) => [eur.format(v), name]} />
        <Legend wrapperStyle={{ fontSize: 12, color: colors.ink2 }} />
        <Bar dataKey="fixed" name={TYPE_LABELS.fixed} fill={colors.series[0]} {...seg} />
        <Bar dataKey="variable" name={TYPE_LABELS.variable} fill={colors.series[1]} {...seg} />
        <Bar dataKey="additional" name={TYPE_LABELS.additional} fill={colors.series[2]} {...seg} />
        <Bar dataKey="investment" name={TYPE_LABELS.investment} fill={colors.series[3]} {...seg} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CumulativeChart({ data, colors }: { data: MonthRow[]; colors: ChartColors }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis dataKey="month" {...axis(colors)} />
        <YAxis {...axis(colors)} tickFormatter={euroTick} width={56} />
        <Tooltip {...tooltip(colors)} formatter={(v: number) => [eur.format(v), 'Saldo acumulado']} />
        <ReferenceLine y={0} stroke={colors.muted} />
        <Line type="linear" dataKey="cumulative" stroke={colors.series[0]} strokeWidth={2} dot={{ r: 4, fill: colors.surface, strokeWidth: 2 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ data, colors }: { data: { category: string; amount: number }[]; colors: ChartColors }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
        <XAxis type="number" {...axis(colors)} tickFormatter={euroTick} />
        <YAxis type="category" dataKey="category" {...axis(colors)} width={96} />
        <Tooltip {...tooltip(colors)} formatter={(v: number) => [eur.format(v), 'Gasto']} />
        <Bar dataKey="amount" fill={colors.series[0]} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two years side by side per month (palette slots 1–2). */
export function YoyBars({ data, labels, colors }: { data: { month: string; a: number; b: number }[]; labels: [string, string]; colors: ChartColors }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis dataKey="month" {...axis(colors)} />
        <YAxis {...axis(colors)} tickFormatter={euroTick} width={56} />
        <Tooltip {...tooltip(colors)} formatter={(v: number, name: string) => [eur.format(v), name]} />
        <Legend wrapperStyle={{ fontSize: 12, color: colors.ink2 }} />
        <Bar dataKey="a" name={labels[0]} fill={colors.series[0]} radius={[4, 4, 0, 0]} />
        <Bar dataKey="b" name={labels[1]} fill={colors.series[1]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
