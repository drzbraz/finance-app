import { TYPE_LABELS } from '@finance/shared';
import {
  Bar, BarChart, CartesianGrid, Layer, Legend, Line, LineChart, Rectangle, ReferenceLine, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { FlowNode, MoneyFlow, PaceDay } from '../analytics/flow';
import type { ChartColors } from '../theme';
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

/** This month's day-to-day spending against the typical month; the dotted tail is the projection. */
export function PaceChart({ data, today, colors }: { data: PaceDay[]; today: number | null; colors: ChartColors }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis dataKey="day" {...axis(colors)} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axis(colors)} tickFormatter={euroTick} width={56} />
        <Tooltip {...tooltip(colors)} labelFormatter={(d) => `Dia ${d}`} formatter={(v: number, name: string) => [eur.format(v), name]} />
        <Legend wrapperStyle={{ fontSize: 12, color: colors.ink2 }} />
        {today !== null && <ReferenceLine x={today} stroke={colors.muted} strokeDasharray="2 4" label={{ value: 'hoje', fill: colors.ink2, fontSize: 11, position: 'insideTopLeft' }} />}
        <Line type="linear" dataKey="typical" name="Mês típico" stroke={colors.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
        <Line type="linear" dataKey="actual" name="Este mês" stroke={colors.series[0]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
        <Line type="linear" dataKey="projected" name="Previsão" stroke={colors.series[0]} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" dot={false} activeDot={{ r: 4 }} legendType="none" />
      </LineChart>
    </ResponsiveContainer>
  );
}

const FLOW_SLOT: Partial<Record<FlowNode['kind'], number>> = { fixed: 0, variable: 1, additional: 2, investment: 3 };

/** Money flow Sankey: income → types → categories, coloured by type (same slots as the stacked bars). */
export function MoneyFlowChart({ flow, colors }: { flow: MoneyFlow; colors: ChartColors }) {
  const fill = (kind: FlowNode['kind']) => (FLOW_SLOT[kind] !== undefined ? colors.series[FLOW_SLOT[kind]!] : colors.muted);
  const leaves = flow.nodes.filter((_, i) => !flow.links.some((l) => l.source === i)).length;
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, leaves * 26)}>
      <FlowSankey flow={flow} colors={colors} fill={fill} />
    </ResponsiveContainer>
  );
}

// ResponsiveContainer hands its width to its child; labels flip to the left of the last column.
function FlowSankey({ flow, colors, fill, width = 0, height = 0 }: { flow: MoneyFlow; colors: ChartColors; fill: (k: FlowNode['kind']) => string; width?: number; height?: number }) {
  type NodeProps = { x: number; y: number; width: number; height: number; index: number; payload: { value: number } };
  type LinkProps = { sourceX: number; targetX: number; sourceY: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; index: number };
  const renderNode = ({ x, y, width: w, height: h, index, payload }: NodeProps) => {
    const node = flow.nodes[index];
    const right = x + w + 6 < width * 0.75;
    return (
      <Layer key={`n${index}`}>
        <Rectangle x={x} y={y} width={w} height={Math.max(h, 1)} fill={fill(node.kind)} radius={2} />
        <text x={right ? x + w + 6 : x - 6} y={y + h / 2} textAnchor={right ? 'start' : 'end'} dominantBaseline="middle" fontSize={11} fill={colors.ink}>
          {node.name} <tspan fill={colors.ink2}>{eur.format(payload.value)}</tspan>
        </text>
      </Layer>
    );
  };
  const renderLink = ({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index }: LinkProps) => (
    <path
      key={`l${index}`}
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={fill(flow.nodes[flow.links[index].target].kind)}
      strokeOpacity={0.28}
      strokeWidth={Math.max(linkWidth, 1)}
    />
  );
  return (
    <Sankey
      width={width}
      height={height}
      data={{ nodes: flow.nodes.map((n) => ({ name: n.name })), links: flow.links }}
      node={renderNode as never}
      link={renderLink as never}
      nodePadding={14}
      nodeWidth={8}
      margin={{ top: 6, right: 8, bottom: 6, left: 8 }}
      iterations={32}
    >
      <Tooltip {...tooltip(colors)} formatter={(v: number) => eur.format(v)} />
    </Sankey>
  );
}
