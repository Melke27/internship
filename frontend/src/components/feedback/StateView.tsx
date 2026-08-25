export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return (
    <div className="state-view">
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
      <div className="empty-icon">✓</div>
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
    <div className="state-view error-state">
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
