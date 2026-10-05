export const MAX_PAGE_LIMIT = 100;

export function parsePage(raw?: string): number {
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function parseLimit(raw: string | undefined, fallback: number): number {
  const n = raw ? parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_PAGE_LIMIT, n);
}
