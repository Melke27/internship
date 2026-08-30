import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export function MetricCard({
  label,
  value,
  hint,
  to,
  tone = 'default',
  icon,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  tone?: MetricTone;
  icon?: ReactNode;
  delta?: { up?: boolean; flat?: boolean; label: string };
}) {
  const body = (
    <>
      <div className="metric-card-heading">
        <span>{label}</span>
        {icon ? <i aria-hidden="true">{icon}</i> : null}
      </div>
      <strong>{value}</strong>
      <div className="metric-card-footer">
        <small>{hint || 'View details'} {hint ? null : <span aria-hidden="true">→</span>}</small>
        {delta ? (
          <span className={`trend ${delta.flat ? 'flat' : delta.up ? 'up' : 'down'}`}>
            {delta.flat ? <Minus size={12} /> : delta.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {delta.label}
          </span>
        ) : null}
      </div>
    </>
  );
  return to ? (
    <Link to={to} className={`metric-card ${tone}`}>
      {body}
    </Link>
  ) : (
    <article className={`metric-card ${tone}`}>{body}</article>
  );
}