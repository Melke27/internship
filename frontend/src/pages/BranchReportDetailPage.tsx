import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { mediaUrl } from '../lib/utils';
import { ErrorState, LoadingState } from '../components/feedback/StateView';
import { EvidenceLightbox, EvidenceThumb } from '../components/ui/Evidence';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import type { BranchReport } from '../types/api';

export default function BranchReportDetailPage() {
  const { id } = useParams();
  const [lightbox, setLightbox] = useState(false);
  const report = useQuery({
    queryKey: ['branch-report', id],
    queryFn: () => api.get<BranchReport>(`/branch-reports/${id}/`).then((r) => r.data),
    enabled: Boolean(id),
  });

  if (report.isLoading) return <LoadingState label="Loading report..." />;
  if (report.isError || !report.data) {
    return <ErrorState message="Unable to load ATM information." onRetry={() => report.refetch()} />;
  }

  const data = report.data;
  const evidence = mediaUrl(data.evidence);

  return (
    <section className="page-content">
      <div className="page-header">
        <div>
          <p className="page-kicker">Branch Report</p>
          <h1>{data.report_id}</h1>
          <p className="page-copy">
            {data.atm_reference} · {data.problem_type.replaceAll('_', ' ')}
          </p>
        </div>
        <div className="badge-group">
          <PriorityBadge value={data.severity} />
          <StatusBadge value={data.status} />
        </div>
      </div>

      <div className="content-grid">
        <article className="panel">
          <h2>Report Details</h2>
          <div className="detail-grid">
            <div>
              <span>ATM</span>
              <strong>{data.atm_reference}</strong>
            </div>
            <div>
              <span>Branch</span>
              <strong>{data.branch_name}</strong>
            </div>
            <div>
              <span>Reported By</span>
              <strong>{data.reported_by_name || '—'}</strong>
            </div>
            <div>
              <span>Submitted</span>
              <strong>{new Date(data.created_at).toLocaleString()}</strong>
            </div>
            <div>
              <span>ATM Working</span>
              <strong>{data.atm_currently_working}</strong>
            </div>
            <div>
              <span>Linked Incident</span>
              <strong>{data.linked_incident_number || 'Not converted'}</strong>
            </div>
          </div>
          <div className="stack-gap">
            <div>
              <h3>Problem Description</h3>
              <p>{data.description}</p>
            </div>
            {data.observed_error ? (
              <div>
                <h3>Observed Error</h3>
                <p>{data.observed_error}</p>
              </div>
            ) : null}
            {data.customer_impact ? (
              <div>
                <h3>Service Impact</h3>
                <p>{data.customer_impact}</p>
              </div>
            ) : null}
            {data.dismissal_reason ? (
              <div>
                <h3>Dismissal Reason</h3>
                <p>{data.dismissal_reason}</p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <h2>Evidence</h2>
          {evidence ? (
            <EvidenceThumb url={evidence} label="Report evidence" onOpen={() => setLightbox(true)} />
          ) : (
            <p className="empty-inline">No evidence uploaded.</p>
          )}
          <h2 style={{ marginTop: 24 }}>Status Timeline</h2>
          <div className="timeline">
            {[
              'SUBMITTED',
              'RECEIVED',
              'REVIEWING',
              'CONVERTED_TO_INCIDENT',
            ].map((step) => {
              const reached = rank(data.status) >= rank(step);
              return (
                <div className={`timeline-item ${reached ? 'done' : ''}`} key={step}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{step === 'CONVERTED_TO_INCIDENT' ? 'Converted to Incident' : step.replaceAll('_', ' ')}</strong>
                    {data.status === step ? <small>Current status</small> : null}
                  </div>
                </div>
              );
            })}
            {data.status === 'DISMISSED' ? (
              <div className="timeline-item done">
                <div className="timeline-dot" />
                <div>
                  <strong>DISMISSED</strong>
                  <small>{data.dismissal_reason}</small>
                </div>
              </div>
            ) : null}
          </div>
          {data.status === 'CONVERTED_TO_INCIDENT' && data.linked_incident_id ? (
            <p className="empty-inline" style={{ marginTop: 12 }}>
              This report was converted to an incident. Resolution and verification are tracked on the
              linked incident, not on the report itself.
            </p>
          ) : null}
          <div className="row-actions" style={{ marginTop: 16 }}>
            <Link className="button secondary" to="/branch/reports">
              Back to reports
            </Link>
            {data.linked_incident_id ? (
              <Link className="button primary small" to={`/incidents/${data.linked_incident_id}`}>
                View Incident ({data.linked_incident_number})
              </Link>
            ) : null}
          </div>
        </article>
      </div>

      {lightbox && evidence ? (
        <EvidenceLightbox
          url={evidence}
          meta={{
            filename: 'Evidence',
            uploadedBy: data.reported_by_name || undefined,
            uploadedAt: data.created_at,
          }}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </section>
  );
}

function rank(status: string) {
  const order = [
    'SUBMITTED',
    'RECEIVED',
    'REVIEWING',
    'REVIEWED',
    'CONVERTED_TO_INCIDENT',
    'ASSIGNED',
    'RESOLVED',
    'VERIFIED',
    'CLOSED',
    'DISMISSED',
  ];
  return order.indexOf(status);
}
