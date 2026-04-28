// Edge-compatible cache — uses in-memory Map (no filesystem)
// TTL: 7 days. Resets on cold start, which is fine for a review cache.

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const store = new Map();

export function getCache(rawKey) {
  const entry = store.get(rawKey);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    store.delete(rawKey);
    return null;
  }
  return { data: entry.data, cachedAt: entry.cachedAt, ageMs: Date.now() - entry.cachedAt };
}

export function setCache(rawKey, data) {
  store.set(rawKey, { data, cachedAt: Date.now() });
}

export function cacheAge(cachedAt) {
  const diffMs = Date.now() - cachedAt;
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}
