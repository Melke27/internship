import { isAxiosError } from 'axios';
import { api } from '../lib/api';

export function listResource<T>(path: string) {
  return api.get<T[] | { results: T[] }>(path).then((response) =>
    Array.isArray(response.data) ? response.data : response.data.results,
  );
}

export function extractError(error: unknown, fallback: string) {
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data as Record<string, unknown>;
    if (typeof data.detail === 'string') return data.detail;
    const parts = Object.entries(data).map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(', ')}`;
      if (typeof value === 'object' && value) return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${String(value)}`;
    });
    return parts.join(' · ') || fallback;
  }
  return fallback;
}

export function formatDuration(minutes?: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return `/media/${path}`;
}
