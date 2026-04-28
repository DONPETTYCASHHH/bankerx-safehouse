export const runtime = 'edge';
import { getCache, setCache, cacheAge } from "../../lib/cache";

const DFS_AUTH = Buffer.from(
  `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`
).toString("base64");

const DAILY_LIMIT = parseInt(process.env.DAILY_SCAN_LIMIT ?? "3", 10);

// Simple in-memory rate limiter (use Redis in production for multi-instance)
const dailyCounts = new Map();

function getRateLimitKey(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] ?? req.socket.remoteAddress ?? "unknown";
}

function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const count = dailyCounts.get(key) ?? 0;
  if (count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  dailyCounts.set(key, count + 1);
  return { allowed: true, remaining: DAILY_LIMIT - count - 1 };
}

async function fetchReviews(placeId, complexName, location) {
  // Use async task for cheaper DataForSEO pricing
  const taskRes = await fetch(
    "https://api.dataforseo.com/v3/business_data/google/reviews/task_post",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${DFS_AUTH}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          ...(placeId ? { place_id: placeId } : { keyword: `${complexName} ${location}` }),
          location_name: "South Africa",
          language_name: "English",
          depth: 50,
          sort_by: "newest",
        },
      ]),
    }
  );

  const taskData = await taskRes.json();
  if (!taskRes.ok) throw new Error("Failed to post review task");

  const taskId = taskData.tasks?.[0]?.id;
  if (!taskId) throw new Error("No task ID returned");

  // Poll for result (up to 30s)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const resultRes = await fetch(
      `https://api.dataforseo.com/v3/business_data/google/reviews/task_get/${taskId}`,
      { headers: { Authorization: `Basic ${DFS_AUTH}` } }
    );
    const resultData = await resultRes.json();
    const items = resultData.tasks?.[0]?.result?.[0]?.items;
    if (items) return { items, taskData: resultData.tasks?.[0]?.result?.[0] };
  }

  throw new Error("Review fetch timed out. Try again in a moment.");
}

// Recency weight: reviews decay in importance the older they are
function recencyWeight(timestamp) {
  if (!timestamp) return 0.3;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 30)  return 1.0;
  if (ageDays <= 90)  return 0.8;
  if (ageDays <= 180) return 0.6;
  if (ageDays <= 365) return 0.4;
  return 0.2;
}

function buildDashboard(complexName, taskResult) {
  const reviews = taskResult.items ?? [];
  const totalRating = taskResult.rating?.value ?? null;
  const totalReviews = taskResult.rating?.votes_count ?? reviews.length;

  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  const sentimentKeywords = {
    Management: ["management", "trustees", "body corporate", "hoa", "committee", "chairman"],
    "Security & Access": ["security", "guard", "access", "gate", "boom", "intercom", "cctv"],
    "Value / Levies": ["levy", "levies", "fees", "value", "expensive", "overpriced", "cost"],
    Maintenance: ["maintenance", "repairs", "broken", "pothole", "paint", "rust", "fix"],
    "Health & Hygiene": ["sewage", "smell", "pest", "cockroach", "rat", "dirty", "hygiene", "clean"],
    Loadshedding: ["loadshedding", "load shedding", "generator", "eskom", "power", "electricity", "solar"],
  };

  const riskScores = Object.fromEntries(Object.keys(sentimentKeywords).map((k) => [k, 0]));
  const wordFreq = {};
  const processedReviews = [];

  // Per-review accumulators for weighted scoring
  let weightedRatingSum = 0;
  let weightedRatingTotal = 0;
  let weightedNegativeSum = 0;   // recency-weighted negative review count
  let weightedTotal = 0;          // recency-weighted total review count
  let reviewsWithReply = 0;

  for (const r of reviews) {
    const rating = r.rating?.value;
    const weight = recencyWeight(r.timestamp);
    const text = (r.review_text ?? "").toLowerCase();
    const roundedRating = Math.round(rating ?? 3);

    if (rating && dist[roundedRating] !== undefined) {
      dist[roundedRating]++;
      weightedRatingSum += rating * weight;
      weightedRatingTotal += weight;
    }

    // Recency-weighted negative rate (1–2★ = negative)
    if (rating) {
      weightedTotal += weight;
      if (rating <= 2) weightedNegativeSum += weight;
    }

    // Management response tracking
    if (r.owner_answer) reviewsWithReply++;

    // Risk keyword scoring — weighted by recency and sentiment direction
    for (const [category, keywords] of Object.entries(sentimentKeywords)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          // Negative mention boosts risk, positive mention reduces it
          const sentiment = rating <= 2 ? 2 : rating === 3 ? 0.5 : -0.5;
          riskScores[category] += sentiment * weight;
          if (!wordFreq[kw]) wordFreq[kw] = 0;
          wordFreq[kw]++;
        }
      }
    }

    if (processedReviews.length < 6) {
      processedReviews.push({
        user: r.author_title ?? "Resident",
        rating: roundedRating,
        text: (r.review_text ?? "").slice(0, 160),
        date: r.timestamp ?? null,
      });
    }
  }

  // ── Component A: Star rating (40%) ──────────────────────────────────────────
  // Recency-weighted average, inverted so higher score = more risk
  const analysedAvg = weightedRatingTotal > 0
    ? weightedRatingSum / weightedRatingTotal
    : totalRating ?? 3;
  const starComponent = ((5 - analysedAvg) / 4) * 100; // 0–100

  // ── Component B: Risk cluster severity (35%) ─────────────────────────────
  const risks = Object.entries(riskScores).map(([name, raw]) => {
    const score = Math.min(100, Math.max(0, Math.round(50 + raw * 4)));
    const level = score >= 75 ? "Critical" : score >= 55 ? "High" : score >= 35 ? "Medium" : "Low";
    return { name, score, level };
  }).sort((a, b) => b.score - a.score);

  const avgRiskScore = risks.length > 0
    ? risks.reduce((s, r) => s + r.score, 0) / risks.length
    : 50;

  // ── Component C: Recency-weighted negative rate (15%) ─────────────────────
  const negativeRate = weightedTotal > 0 ? (weightedNegativeSum / weightedTotal) * 100 : 50;

  // ── Component D: Management response rate (10%, inverted) ────────────────
  // Low response rate = higher risk
  const responseRate = reviews.length > 0 ? (reviewsWithReply / reviews.length) * 100 : 0;
  const responseComponent = 100 - responseRate; // inverted

  // ── Final ERI score ────────────────────────────────────────────────────────
  const eriScore = Math.min(100, Math.max(0, Math.round(
    starComponent   * 0.40 +
    avgRiskScore    * 0.35 +
    negativeRate    * 0.15 +
    responseComponent * 0.10
  )));

  const criticalRisks = risks.filter((r) => r.level === "Critical").length;
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 17);

  return {
    estate: complexName,
    publicRating: totalRating ? `${totalRating.toFixed(1)}★` : "N/A",
    analysedAverage: `${analysedAvg.toFixed(1)}★`,
    writtenReviews: totalReviews,
    criticalRisks,
    eriScore,
    // Expose breakdown so the frontend tooltip can show real numbers
    eriBreakdown: {
      starComponent:      Math.round(starComponent),
      riskComponent:      Math.round(avgRiskScore),
      negativeRate:       Math.round(negativeRate),
      responseComponent:  Math.round(responseComponent),
    },
    cacheStatus: "Fresh scan",
    lastUpdated: new Date().toLocaleDateString("en-ZA"),
    ratings: [5, 4, 3, 2, 1].map((s) => ({ label: `${s}★`, value: dist[s] })),
    risks,
    words: topWords,
    reviews: processedReviews,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const { complexName, location, placeId } = req.body ?? {};
  if (!complexName?.trim()) return res.status(400).json({ message: "Complex name is required." });

  const ip = getRateLimitKey(req);
  const cacheKey = `eri:${placeId ?? complexName}:${location ?? "South Africa"}`;

  // Always serve from cache if available (7-day TTL enforced in cache.js)
  const cached = getCache(cacheKey);
  if (cached) {
    return res.status(200).json({
      dashboard: {
        ...cached.data,
        cacheStatus: `Cached · ${cacheAge(cached.cachedAt)}`,
        lastUpdated: new Date(cached.cachedAt).toLocaleDateString("en-ZA"),
      },
      fromCache: true,
      cachedAt: cached.cachedAt,
      pullsRemaining: DAILY_LIMIT,
    });
  }

  // Rate limit only applies to fresh (non-cached) scans
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({
      message: `Daily scan limit reached (${DAILY_LIMIT}/day). Cached results still available.`,
      pullsRemaining: 0,
    });
  }

  try {
    const { items, taskData } = await fetchReviews(placeId, complexName.trim(), location ?? "South Africa");
    const dashboard = buildDashboard(complexName.trim(), { items, ...taskData });

    setCache(cacheKey, dashboard);

    return res.status(200).json({ dashboard, fromCache: false, pullsRemaining: remaining });
  } catch (err) {
    console.error("[eri-scan]", err.message);
    return res.status(500).json({ message: err.message || "Scan failed. Please try again." });
  }
}
