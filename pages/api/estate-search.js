export const runtime = 'edge';

const TTL_MS = 24 * 60 * 60 * 1000;
const searchCache = new Map();
const searchCounts = new Map();
const SEARCH_LIMIT = 20;

function isGibberish(q) {
  if (q.length < 5) return true;
  if (!/[aeiou]/i.test(q)) return true;          // no vowels
  if (/^\d+$/.test(q)) return true;              // all numbers
  if (/^[^a-zA-Z]*$/.test(q)) return true;       // no letters at all
  if (/^(.)\1{3,}$/.test(q)) return true;        // repeated chars "aaaaa"
  if (/test/i.test(q)) return true;              // contains "test"
  return false;
}

function checkSearchLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const count = searchCounts.get(key) ?? 0;
  if (count >= SEARCH_LIMIT) return false;
  searchCounts.set(key, count + 1);
  return true;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q || q.trim().length < 5) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = q.trim();

  // Reject gibberish
  if (isGibberish(query)) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Per-IP rate limit
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!checkSearchLimit(ip)) {
    return new Response(JSON.stringify({ results: [], message: 'Search limit reached for today.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cache hit
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return new Response(JSON.stringify({ results: cached.data, fromCache: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = btoa(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`);

  try {
    const response = await fetch(
      'https://api.dataforseo.com/v3/serp/google/maps/live/advanced',
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          keyword: `${query} estate complex residential`,
          location_name: 'South Africa',
          language_name: 'English',
          depth: 10,
        }]),
      }
    );

    const data = await response.json();
    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];

    const results = items
      .filter(item => item.type === 'maps_search')
      .map(item => ({
        place_id: item.place_id,
        name: item.title,
        address: item.address,
        rating: item.rating?.value ?? null,
        reviews: item.rating?.votes_count ?? 0,
        type: item.category ?? 'Estate',
      }))
      .slice(0, 8);

    searchCache.set(query, { data: results, cachedAt: Date.now() });

    return new Response(JSON.stringify({ results, fromCache: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Search unavailable. Please type your estate name manually.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
