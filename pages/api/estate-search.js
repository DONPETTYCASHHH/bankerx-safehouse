export const runtime = "edge";

const TTL_MS = 24 * 60 * 60 * 1000;
const searchCache = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return json({ results: [], message: "Enter at least 2 characters." });
  }

  const query = q.trim().toLowerCase();

  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return json({ results: cached.data, fromCache: true });
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    return json({ message: "Missing DataForSEO credentials." }, 500);
  }

  const auth = btoa(`${login}:${password}`);

  try {
    const response = await fetch(
      "https://api.dataforseo.com/v3/serp/google/maps/live/advanced",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword: `${q.trim()} estate complex residential South Africa`,
            location_name: "South Africa",
            language_name: "English",
            device: "desktop",
            os: "windows",
            depth: 20,
            search_places: true,
          },
        ]),
      }
    );

    const data = await response.json();

    if (!response.ok || data.status_code >= 40000) {
      return json(
        {
          message: "DataForSEO request failed.",
          status: response.status,
          dataforseo_status: data.status_code,
          dataforseo_message: data.status_message,
        },
        500
      );
    }

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];

    const results = items
      .filter((item) => item?.title)
      .map((item) => ({
        place_id: item.place_id || item.cid || item.data_cid || null,
        name: item.title,
        address: item.address || item.location || "",
        rating: item.rating?.value ?? item.rating ?? null,
        reviews: item.rating?.votes_count ?? item.votes_count ?? 0,
        type: item.category || item.type || "Estate",
      }))
      .slice(0, 8);

    searchCache.set(query, { data: results, cachedAt: Date.now() });

    return json({
      results,
      fromCache: false,
      debug: {
        total_items_returned: items.length,
        first_item_type: items?.[0]?.type || null,
      },
    });
  } catch (err) {
    return json(
      {
        message: "Search unavailable.",
        error: err?.message || String(err),
      },
      500
    );
  }
}
