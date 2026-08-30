import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after
 * the user stops changing it for `delay` ms.
 *
 * Use this in any page with a search/filter input to avoid
 * firing an API request on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
