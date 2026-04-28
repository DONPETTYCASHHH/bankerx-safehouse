export const runtime = 'edge';
import { getCache, setCache } from "../../lib/cache";

const DFS_AUTH = Buffer.from(
  `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`
).toString("base64");

// Cache search suggestions for 24h — estate listings don't change daily
const SEARCH_TTL_OVERRIDE = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ results: [] });

  const query = q.trim();
  const cacheKey = `search:${query}`;

  // Check cache first
  const cached = getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ results: cached.data, fromCache: true });
  }

  try {
    const response = await fetch(
      "https://api.dataforseo.com/v3/serp/google/maps/live/advanced",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${DFS_AUTH}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword: `${query} estate complex residential`,
            location_name: "South Africa",
            language_name: "English",
            depth: 10,
          },
        ]),
      }
    );

    const data = await response.json();

    if (!response.ok || data.status_code !== 20000) {
      throw new Error(data.status_message || "DataForSEO error");
    }

    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];

    const results = items
      .filter((item) => item.type === "maps_search")
      .map((item) => ({
        place_id: item.place_id,
        name: item.title,
        address: item.address,
        rating: item.rating?.value ?? null,
        reviews: item.rating?.votes_count ?? 0,
        type: item.category ?? "Estate",
      }))
      .slice(0, 8);

    setCache(cacheKey, results);
    return res.status(200).json({ results, fromCache: false });
  } catch (err) {
    console.error("[estate-search]", err.message);
    return res.status(500).json({ message: "Search unavailable. Please type your estate name manually." });
  }
}
