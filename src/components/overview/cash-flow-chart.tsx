'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompact, formatMoney } from '@/lib/money';

/**
 * Weekly money in and out, with the closing balance riding over the top.
 *
 * Everything stock about Recharts is replaced: no default grid, no default
 * tooltip, no default axis styling. Colours come from the chart tokens so the
 * chart follows the theme, and the axis is deliberately sparse. A dense grid
 * makes twelve bars look like a spreadsheet.
 */

export type CashFlowPoint = {
  date: string;
  inCents: number;
  outCents: number;
  balanceCents: number;
};

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const points = data.map((point) => ({
    ...point,
    label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    // Outflow renders below the axis, so the two directions read as opposites
    // rather than as two similar bars side by side.
    outNegative: -point.outCents,
  }));

  return (
    <div className="h-[220px] w-full px-1 pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--nx-chart-grid)" strokeDasharray="2 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fill: 'var(--nx-chart-axis)', fontSize: 10 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => formatCompact(value)}
            tick={{
              fill: 'var(--nx-chart-axis)',
              fontSize: 10,
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          />
          <Tooltip cursor={{ fill: 'var(--nx-bg-hover)' }} content={<ChartTooltip />} />
          <Bar
            dataKey="inCents"
            fill="var(--nx-chart-4)"
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="outNegative"
            fill="var(--nx-negative)"
            fillOpacity={0.65}
            radius={[0, 0, 2, 2]}
            maxBarSize={22}
          />
          <Line
            type="monotone"
            dataKey="balanceCents"
            stroke="var(--nx-chart-3)"
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--nx-chart-3)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipPayload = { payload?: CashFlowPoint & { label: string } };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-control border border-line bg-overlay px-2.5 py-2 shadow-overlay">
      <p className="mb-1.5 text-[11px] text-ink-3">Week of {point.label}</p>
      <dl className="space-y-0.5">
        <TooltipRow label="In" value={formatMoney(point.inCents)} tone="text-positive" />
        <TooltipRow label="Out" value={formatMoney(point.outCents)} tone="text-negative" />
        <TooltipRow label="Balance" value={formatMoney(point.balanceCents)} tone="text-ink" />
      </dl>
    </div>
  );
}

function TooltipRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[11px] text-ink-4">{label}</dt>
      <dd className={`tabular text-[12px] ${tone}`}>{value}</dd>
    </div>
  );
}
