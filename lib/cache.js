import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 80);
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

export function getCache(rawKey) {
  try {
    const file = cachePath(cacheKey(rawKey));
    if (!fs.existsSync(file)) return null;
    const { data, cachedAt } = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (Date.now() - cachedAt > TTL_MS) {
      fs.unlinkSync(file);
      return null;
    }
    return { data, cachedAt, ageMs: Date.now() - cachedAt };
  } catch {
    return null;
  }
}

export function setCache(rawKey, data) {
  try {
    ensureCacheDir();
    const file = cachePath(cacheKey(rawKey));
    fs.writeFileSync(file, JSON.stringify({ data, cachedAt: Date.now() }, null, 2));
  } catch (err) {
    console.error("[cache] write error:", err.message);
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
