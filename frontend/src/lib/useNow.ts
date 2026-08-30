import { useEffect, useState } from 'react';

/**
 * Returns a timestamp (ms since epoch) that re-evaluates every `intervalMs`.
 * Use this to keep relative-time labels (e.g. "2 minutes ago") ticking live
 * without coupling to a global store.
 *
 * @example
 * const now = useNow();
 * const label = relativeTime(data.last_updated, now);
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
