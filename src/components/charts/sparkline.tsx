import { area, curveMonotoneX, line } from 'd3-shape';
import { cn } from '@/lib/cn';

/**
 * Sparkline, rendered on the server as plain SVG.
 *
 * d3-shape only computes the path string, so nothing about this reaches the
 * browser as JavaScript. Four of these appear above the fold on the Overview;
 * doing them with a charting library would ship a runtime to draw sixty
 * pixels of line.
 */
export function Sparkline({
  values,
  className,
  width = 120,
  height = 28,
  tone = 'accent',
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  tone?: 'accent' | 'positive' | 'negative' | 'muted';
}) {
  if (values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn('h-7 w-full', className)}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          className="stroke-line"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A perfectly flat series would divide by zero; give it a band so the line
  // renders through the middle instead of collapsing onto an edge.
  const span = max - min || Math.abs(max) || 1;
  const pad = 2;

  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);

  const linePath =
    line<number>()
      .x((_, index) => x(index))
      .y((value) => y(value))
      .curve(curveMonotoneX)(values) ?? '';

  const areaPath =
    area<number>()
      .x((_, index) => x(index))
      .y0(height)
      .y1((value) => y(value))
      .curve(curveMonotoneX)(values) ?? '';

  const stroke = {
    accent: 'stroke-accent',
    positive: 'stroke-positive',
    negative: 'stroke-negative',
    muted: 'stroke-line-strong',
  }[tone];

  const fill = {
    accent: 'text-accent',
    positive: 'text-positive',
    negative: 'text-negative',
    muted: 'text-ink-4',
  }[tone];

  const gradientId = `spark-${tone}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-7 w-full', fill, className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.20" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        className={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
