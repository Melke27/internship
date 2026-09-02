import { Inbox } from 'lucide-react';

export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return (
    <div className="state-view" role="status" aria-live="polite">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description = 'There are no records in your authorized scope.',
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="state-view empty-state">
      <div className="empty-icon" aria-hidden><Inbox size={22} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function ErrorState({
  message = 'Unable to load this resource.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-view error-state" role="alert">
      <strong>Unable to load data</strong>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="button secondary" onClick={onRetry} style={{ marginTop: 12 }}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
