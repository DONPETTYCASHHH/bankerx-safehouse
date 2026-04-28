const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const memoryCache = new Map();

function cacheKey(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .slice(0, 80);
}

export function getCache(rawKey) {
  try {
    const key = cacheKey(rawKey);
    const item = memoryCache.get(key);

    if (!item) return null;

    const { data, cachedAt } = item;
    const ageMs = Date.now() - cachedAt;

    if (ageMs > TTL_MS) {
      memoryCache.delete(key);
      return null;
    }

    return { data, cachedAt, ageMs };
  } catch {
    return null;
  }
}

export function setCache(rawKey, data) {
  try {
    const key = cacheKey(rawKey);
    memoryCache.set(key, {
      data,
      cachedAt: Date.now(),
    });
  } catch (err) {
    console.error("[cache] write error:", err?.message || err);
  }
}

export function cacheAge(cachedAt) {
  const diffMs = Date.now() - cachedAt;
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}
