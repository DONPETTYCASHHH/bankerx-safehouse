export const runtime = 'edge';

const TTL_MS = 24 * 60 * 60 * 1000;
const searchCache = new Map();

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q || q.trim().length < 2) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = q.trim();
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return new Response(JSON.stringify({ results: cached.data, fromCache: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  const auth = btoa(`${login}:${password}`);

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
