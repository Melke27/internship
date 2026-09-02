import { useId, useMemo } from 'react';

export interface Segment {
  label: string;
  value: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: '#16a34a',
  WARNING: '#d97706',
  DEGRADED: '#eab308',
  FAULT: '#e11d48',
  OFFLINE: '#64748b',
  CRITICAL: '#dc2626',
  MAINTENANCE: '#2563eb',
  UNDER_REPAIR: '#7c3aed',
  available: '#0ea5e9',
  healthy: '#16a34a',
  unstable: '#f59e0b',
  error: '#e11d48',
};

export function statusColor(status?: string | null) {
  if (!status) return '#94a3b8';
  return STATUS_COLORS[status] || STATUS_COLORS[status.toUpperCase()] || '#94a3b8';
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 3) return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const d = [`M${points[0].x},${points[0].y}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
  }
  return d.join(' ');
}

export function Sparkline({
  values,
  color = 'var(--brand)',
  height = 40,
  fill = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const id = useId();
  const width = 200;
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - 4 - ((v - min) / range) * (height - 10),
  }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z`;
  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend"
    >
      <line x1={0} x2={width} y1={height - 4} y2={height - 4} stroke="#e5e9f2" strokeWidth={1} />
      {fill ? <path d={area} fill={color} opacity={0.12} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill="#fff" stroke={color} strokeWidth={2.2} />
    </svg>
  );
}

export function DonutChart({
  segments,
  size = 176,
  thickness = 20,
  centerLabel,
  centerValue,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const id = useId();
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="chart donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status distribution">
        <defs>
          {segments.map((s, i) => (
            <linearGradient key={i} id={`${id}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.65} />
            </linearGradient>
          ))}
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#edf0f6"
          strokeWidth={thickness}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s, i) => {
            const dash = (s.value / total) * circumference;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={`url(#${id}-${i})`}
                strokeWidth={thickness}
                strokeLinecap={s.value === total ? 'round' : 'butt'}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
      </svg>
      {centerValue != null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            alignContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <strong style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>
            {centerValue}
          </strong>
          {centerLabel ? (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{centerLabel}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ChartLegend({
  segments,
  total,
  limit = 6,
}: {
  segments: Segment[];
  total?: number;
  limit?: number;
}) {
  const shown = segments.filter((s) => s.value > 0).slice(0, limit);
  if (!shown.length) return null;
  const sum = total ?? (shown.reduce((acc, s) => acc + s.value, 0) || 1);
  return (
    <div className="chart-legend">
      {shown.map((s) => (
        <div className="legend-row" key={s.label}>
          <i style={{ background: s.color }} aria-hidden />
          <span>{s.label}</span>
          <b>{s.value}</b>
          <small className="muted" style={{ width: 44, textAlign: 'right' }}>
            {Math.round((s.value / sum) * 100)}%
          </small>
        </div>
      ))}
    </div>
  );
}

export function BarList({
  rows,
  color = 'var(--brand)',
}: {
  rows: { label: string; value: number; color?: string }[];
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              fontSize: 12.5,
            }}
          >
            <span style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-2)' }}>
              {row.label.replaceAll('_', ' ')}
            </span>
            <b style={{ fontWeight: 700, color: 'var(--ink)' }}>{row.value}</b>
          </div>
          <div className="bar-track">
            <i
              aria-hidden
              style={{
                width: `${(row.value / max) * 100}%`,
                background: row.color || color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  series,
  height = 180,
  color = '#3b4fd8',
  label,
}: {
  series: { date: string; value: number; label?: string }[];
  height?: number;
  color?: string;
  label?: string;
}) {
  const id = useId();
  const width = 1000;
  const pad = height * 0.15;
  const max = Math.max(...series.map((s) => s.value), 1);

  const points = useMemo(() => {
    if (!series.length) return [];
    const step = series.length > 1 ? (width - 60) / (series.length - 1) : 0;
    return series.map((s, i) => ({
      x: 30 + i * step,
      y: height - pad - (s.value / max) * (height - pad * 2),
      value: s.value,
      date: s.date,
      label: s.label || s.date.slice(5),
    }));
  }, [series, height, max]);

  if (points.length < 2) {
    return <div className="chart" style={{ height }} />;
  }

  const line = smoothPath(points);
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;
  const ySteps = [1, 0.5, 0];

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height + 26}`}
        preserveAspectRatio="none"
        style={{ height, width: '100%' }}
        role="img"
        aria-label={label || 'Trend chart'}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.26} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ySteps.map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={height - (height - pad * 2) * f}
            y2={height - (height - pad * 2) * f}
            stroke="#e5e9f2"
            strokeDasharray="3 6"
          />
        ))}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i % Math.ceil(points.length / 8) === 0 ? 3.5 : 2}
            fill="#fff"
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </svg>
      {ySteps.map(
        (f) =>
          f > 0 && (
            <span
              key={f}
              style={{
                position: 'absolute',
                right: 0,
                top: `calc(${((height - (height - pad * 2) * f) / (height + 26)) * 100}% - 7px)`,
                fontSize: 10,
                color: 'var(--text-3)',
                background: 'var(--surface)',
                padding: '0 4px',
              }}
            >
              {Math.round(max * f)}
            </span>
          ),
      )}
      {points.map(
        (p, i) =>
          i % Math.ceil(points.length / 8) === 0 && (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${(p.x / width) * 100}%`,
                top: height + 6,
                transform: 'translateX(-50%)',
                fontSize: 10.5,
                color: 'var(--text-3)',
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </span>
          ),
      )}
    </div>
  );
}