import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Cpu, MapPin, ShieldCheck, Wifi, Zap } from 'lucide-react';

import { DualStatus, StatusBadge } from '../ui/StatusBadge';
import type { ATM } from '../../types/api';

function signalTone(value?: string) {
  const s = (value || '').toLowerCase();
  if (['online', 'normal', 'operational', 'active', 'available'].includes(s)) return 'var(--success)';
  if (['offline', 'fault', 'critical', 'error'].includes(s)) return 'var(--danger)';
  if (['warning', 'degraded', 'maintenance'].includes(s)) return 'var(--warning)';
  return 'var(--text-3)';
}

/**
 * Shared ATM fleet card used across the branch and district monitoring views.
 * Shows technical status, sub-system signals and any linked incident.
 */
export default function ATMFleetCard({
  atm,
  to,
  actions,
}: {
  atm: ATM;
  to: string;
  actions?: ReactNode;
}) {
  return (
    <article className="atm-fleet-card">
      <Link className="atm-fleet-main" to={to}>
        <div className="atm-fleet-head">
          <div>
            <strong className="atm-fleet-ref">{atm.reference}</strong>
            {atm.name && atm.name !== atm.reference ? (
              <span className="atm-fleet-name">{atm.name}</span>
            ) : null}
          </div>
          <DualStatus active={atm.is_active !== false} technical={atm.status} />
        </div>

        <div className="atm-fleet-location">
          <MapPin size={12} />
          <span>{atm.location || atm.branch_name || 'Branch ATM'}</span>
        </div>

        <div className="atm-signal-strip">
          <span className="atm-signal">
            <Wifi size={12} style={{ color: signalTone(atm.network_status) }} />
            Network
          </span>
          <span className="atm-signal">
            <Zap size={12} style={{ color: signalTone(atm.power_status) }} />
            Power
          </span>
          <span className="atm-signal">
            <Cpu size={12} style={{ color: signalTone(atm.hardware_status) }} />
            Hardware
          </span>
        </div>

        <div className="atm-fleet-meta">
          <div className="meta-row">
            <span>Health</span>
            <StatusBadge value={atm.health} />
          </div>
          <div className="meta-row">
            <span>Last check</span>
            <strong>{atm.last_checked ? new Date(atm.last_checked).toLocaleTimeString() : '—'}</strong>
          </div>
        </div>

        {atm.active_incident ? (
          <div className="atm-incident-chip-critical">
            <CircleAlert size={13} />
            <span>Incident {atm.active_incident.incident_number} · {atm.active_incident.title}</span>
          </div>
        ) : (
          <div className="atm-incident-chip-clear">
            <ShieldCheck size={12} />
            No active incident
          </div>
        )}
      </Link>

      {actions ? <div className="atm-fleet-actions">{actions}</div> : null}
    </article>
  );
}