export const runtime = 'edge';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const scanCache = new Map();
const dailyCounts = new Map();
const DAILY_LIMIT = 3;

function getAuth() {
  return btoa(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`);
}

function cacheAge(cachedAt) {
  const diffMs = Date.now() - cachedAt;
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const count = dailyCounts.get(key) ?? 0;
  if (count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  dailyCounts.set(key, count + 1);
  return { allowed: true, remaining: DAILY_LIMIT - count - 1 };
}

function recencyWeight(timestamp) {
  if (!timestamp) return 0.3;
  const ageDays = (Date.now() - new Date(timestamp).getTime()) / 86_400_000;
  if (ageDays <= 30) return 1.0;
  if (ageDays <= 90) return 0.8;
  if (ageDays <= 180) return 0.6;
  if (ageDays <= 365) return 0.4;
  return 0.2;
}

async function fetchReviews(placeId, complexName, location) {
  const auth = getAuth();
  const taskRes = await fetch(
    'https://api.dataforseo.com/v3/business_data/google/reviews/task_post',
    {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        ...(placeId ? { place_id: placeId } : { keyword: `${complexName} ${location}` }),
        location_name: 'South Africa',
        language_name: 'English',
        depth: 50,
        sort_by: 'newest',
      }]),
    }
  );

  const taskData = await taskRes.json();
  const taskId = taskData.tasks?.[0]?.id;
  if (!taskId) throw new Error('No task ID returned');

  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resultRes = await fetch(
      `https://api.dataforseo.com/v3/business_data/google/reviews/task_get/${taskId}`,
      { headers: { 'Authorization': `Basic ${auth}` } }
    );
    const resultData = await resultRes.json();
    const items = resultData.tasks?.[0]?.result?.[0]?.items;
    if (items) return { items, taskResult: resultData.tasks?.[0]?.result?.[0] };
  }
  throw new Error('Review fetch timed out. Please try again.');
}

function buildDashboard(complexName, taskResult) {
  const reviews = taskResult.items ?? [];
  const totalRating = taskResult.rating?.value ?? null;
  const totalReviews = taskResult.rating?.votes_count ?? reviews.length;

  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const sentimentKeywords = {
    'Management': ['management', 'trustees', 'body corporate', 'hoa', 'committee', 'chairman'],
    'Security & Access': ['security', 'guard', 'access', 'gate', 'boom', 'intercom', 'cctv'],
    'Value / Levies': ['levy', 'levies', 'fees', 'value', 'expensive', 'overpriced', 'cost'],
    'Maintenance': ['maintenance', 'repairs', 'broken', 'pothole', 'paint', 'rust', 'fix'],
    'Health & Hygiene': ['sewage', 'smell', 'pest', 'cockroach', 'rat', 'dirty', 'hygiene', 'clean'],
    'Loadshedding': ['loadshedding', 'load shedding', 'generator', 'eskom', 'power', 'electricity', 'solar'],
  };

  const riskScores = Object.fromEntries(Object.keys(sentimentKeywords).map(k => [k, 0]));
  const wordFreq = {};
  const processedReviews = [];

  let weightedRatingSum = 0, weightedRatingTotal = 0;
  let weightedNegativeSum = 0, weightedTotal = 0, reviewsWithReply = 0;

  for (const r of reviews) {
    const rating = r.rating?.value;
    const weight = recencyWeight(r.timestamp);
    const text = (r.review_text ?? '').toLowerCase();
    const roundedRating = Math.round(rating ?? 3);

    if (rating && dist[roundedRating] !== undefined) {
      dist[roundedRating]++;
      weightedRatingSum += rating * weight;
      weightedRatingTotal += weight;
    }

    if (rating) {
      weightedTotal += weight;
      if (rating <= 2) weightedNegativeSum += weight;
    }

    if (r.owner_answer) reviewsWithReply++;

    for (const [category, keywords] of Object.entries(sentimentKeywords)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          const sentiment = rating <= 2 ? 2 : rating === 3 ? 0.5 : -0.5;
          riskScores[category] += sentiment * weight;
          if (!wordFreq[kw]) wordFreq[kw] = 0;
          wordFreq[kw]++;
        }
      }
    }

    if (processedReviews.length < 6) {
      processedReviews.push({
        user: 'Resident ' + String.fromCharCode(65 + processedReviews.length),
        rating: roundedRating,
        text: (r.review_text ?? '').slice(0, 160),
        date: r.timestamp ?? null,
      });
    }
  }

  const analysedAvg = weightedRatingTotal > 0 ? weightedRatingSum / weightedRatingTotal : totalRating ?? 3;
  const starComponent = ((5 - analysedAvg) / 4) * 100;

  const risks = Object.entries(riskScores).map(([name, raw]) => {
    const score = Math.min(100, Math.max(0, Math.round(50 + raw * 4)));
    const level = score >= 75 ? 'Critical' : score >= 55 ? 'High' : score >= 35 ? 'Medium' : 'Low';
    return { name, score, level };
  }).sort((a, b) => b.score - a.score);

  const avgRiskScore = risks.length > 0 ? risks.reduce((s, r) => s + r.score, 0) / risks.length : 50;
  const negativeRate = weightedTotal > 0 ? (weightedNegativeSum / weightedTotal) * 100 : 50;
  const responseComponent = 100 - (reviews.length > 0 ? (reviewsWithReply / reviews.length) * 100 : 0);

  const eriScore = Math.min(100, Math.max(0, Math.round(
    starComponent * 0.40 + avgRiskScore * 0.35 + negativeRate * 0.15 + responseComponent * 0.10
  )));

  const criticalRisks = risks.filter(r => r.level === 'Critical').length;
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 17);

  return {
    estate: complexName,
    publicRating: totalRating ? `${totalRating.toFixed(1)}★` : 'N/A',
    analysedAverage: `${analysedAvg.toFixed(1)}★`,
    writtenReviews: totalReviews,
    criticalRisks,
    eriScore,
    eriBreakdown: {
      starComponent: Math.round(starComponent),
      riskComponent: Math.round(avgRiskScore),
      negativeRate: Math.round(negativeRate),
      responseComponent: Math.round(responseComponent),
    },
    cacheStatus: 'Fresh scan',
    lastUpdated: new Date().toLocaleDateString('en-ZA'),
    ratings: [5, 4, 3, 2, 1].map(s => ({ label: `${s}★`, value: dist[s] })),
    risks,
    words: topWords,
    reviews: processedReviews,
  };
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const { complexName, location, placeId } = body;

  if (!complexName?.trim()) {
    return new Response(JSON.stringify({ message: 'Complex name is required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const cacheKey = `eri:${placeId ?? complexName}:${location ?? 'South Africa'}`;
  const cached = scanCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return new Response(JSON.stringify({
      dashboard: {
        ...cached.data,
        cacheStatus: `Cached · ${cacheAge(cached.cachedAt)}`,
        lastUpdated: new Date(cached.cachedAt).toLocaleDateString('en-ZA'),
      },
      fromCache: true,
      cachedAt: cached.cachedAt,
      pullsRemaining: DAILY_LIMIT,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return new Response(JSON.stringify({
      message: `Daily scan limit reached (${DAILY_LIMIT}/day).`,
      pullsRemaining: 0,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { items, taskResult } = await fetchReviews(placeId, complexName.trim(), location ?? 'South Africa');
    const dashboard = buildDashboard(complexName.trim(), { items, ...taskResult });

    scanCache.set(cacheKey, { data: dashboard, cachedAt: Date.now() });

    return new Response(JSON.stringify({ dashboard, fromCache: false, pullsRemaining: remaining }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ message: err.message || 'Scan failed. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
