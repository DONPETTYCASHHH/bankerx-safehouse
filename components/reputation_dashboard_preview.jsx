import React from "react";

const demoData = {
  estate: "Search an estate to begin",
  publicRating: "—", analysedAverage: "—",
  writtenReviews: 0, criticalRisks: 0, eriScore: 0,
  cacheStatus: "No scan yet", lastUpdated: "—",
  ratings: [{label:"5★",value:0},{label:"4★",value:0},{label:"3★",value:0},{label:"2★",value:0},{label:"1★",value:0}],
  risks: [], words: [], reviews: [],
};

const loadingSteps = [
  "Checking cache…",
  "Searching Google review data…",
  "Preparing public review scan…",
  "Analysing sentiment and recurring themes…",
  "Building SAFEHOUSE dashboard…",
];

async function searchEstates(query) {
  const res = await fetch(`/api/estate-search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Search failed");
  return json.results ?? [];
}

async function fetchEriScan({ complexName, location, placeId }) {
  const res = await fetch("/api/eri-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ complexName, location, placeId }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.message ?? "Unable to generate scan right now.");
  return payload;
}

function Stars({ n }) {
  return <span className="stars">{"★".repeat(n)}<span>{"★".repeat(5 - n)}</span></span>;
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function KPI({ label, value, sub }) {
  return (
    <Card className="kpi-card">
      <div className="eyebrow">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </Card>
  );
}

function EstateSearch({ onSelect, disabled }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const debounceRef = React.useRef(null);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val); setActiveIdx(-1);
    if (val.trim().length < 3) { setResults([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try { const r = await searchEstates(val.trim()); setResults(r); setOpen(true); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 500);
  }

  function pick(r) { setQuery(r.name); setOpen(false); setResults([]); onSelect(r); }

  return (
    <div className="search-wrap">
      <div className="search-field">
        <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="rgba(255,255,255,.55)" strokeWidth="1.4"/>
          <path d="M10.5 10.5L14 14" stroke="rgba(255,255,255,.55)" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input value={query} onChange={handleChange} placeholder="Search complex or estate name…" disabled={disabled} autoComplete="off"
          onKeyDown={e=>{
            if(!results.length) return;
            if(e.key==="ArrowDown") setActiveIdx(i=>Math.min(i+1,results.length-1));
            if(e.key==="ArrowUp") setActiveIdx(i=>Math.max(i-1,0));
            if(e.key==="Enter"&&activeIdx>=0) pick(results[activeIdx]);
            if(e.key==="Escape") setOpen(false);
          }}
          onBlur={()=>setTimeout(()=>setOpen(false),150)}
          onFocus={()=>results.length&&setOpen(true)}
        />
        {searching && <div className="search-spinner"/>}
        {query && !searching && <button className="clear-x" onClick={()=>{setQuery("");setResults([]);setOpen(false);onSelect(null);}}>✕</button>}
      </div>
      {open && results.length > 0 && (
        <div className="dropdown">
          {results.map((r,i)=>(
            <div key={r.place_id??r.name} className={`drop-item${i===activeIdx?" active":""}`} onMouseDown={e=>{e.preventDefault();pick(r);}}>
              <div className="pin-icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1C4.79 1 3 2.79 3 5c0 3.25 4 8 4 8s4-4.75 4-8c0-2.21-1.79-4-4-4z" fill="#60a5fa"/>
                  <circle cx="7" cy="5" r="1.5" fill="#05070d"/>
                </svg>
              </div>
              <div className="drop-info">
                <strong>{r.name}</strong>
                <span>{r.address}</span>
                {r.type && <em>{r.type}</em>}
              </div>
              {r.rating && <div className="drop-rating"><span>★ {r.rating.toFixed(1)}</span><small>{r.reviews} reviews</small></div>}
            </div>
          ))}
        </div>
      )}
      {open && !searching && results.length===0 && query.length>=3 && (
        <div className="dropdown"><div className="drop-empty">No estates found — try a different name</div></div>
      )}
    </div>
  );
}

function ERITooltip({ breakdown }) {
  const [visible, setVisible] = React.useState(false);
  const bd = breakdown ?? {};
  const rows = [
    { label:"Recency-weighted star rating", weight:"40%", val:bd.starComponent },
    { label:"Risk cluster severity", weight:"35%", val:bd.riskComponent },
    { label:"Negative review rate", weight:"15%", val:bd.negativeRate },
    { label:"Management response rate", weight:"10%", val:bd.responseComponent },
  ];
  return (
    <span className="eri-info-wrap">
      <button className="eri-info-btn" onMouseEnter={()=>setVisible(true)} onMouseLeave={()=>setVisible(false)} onClick={()=>setVisible(v=>!v)} aria-label="How is this calculated?">ⓘ</button>
      {visible && (
        <div className="eri-tooltip">
          <div className="eri-tooltip-title">How ERI is calculated</div>
          {rows.map((r,i)=>(
            <div key={i} className="eri-tooltip-row">
              <span>{r.label}</span>
              <span className="eri-tooltip-weight">{r.weight}</span>
              {r.val!=null && <span className="eri-tooltip-val">{r.val}</span>}
            </div>
          ))}
          <div className="eri-tooltip-note">Recent reviews weighted up to 5× more. Higher = higher risk. All data from Google Reviews.</div>
        </div>
      )}
    </span>
  );
}

function RatingDistribution({ data }) {
  const max = Math.max(...data.ratings.map(r=>r.value), 1);
  return (
    <Card>
      <div className="section-head">
        <div>
          <h2>Star Rating Distribution</h2>
          <p>From Google review data · {data.writtenReviews} reviews analysed.</p>
        </div>
        <span className="pill muted-pill">{data.writtenReviews} analysed</span>
      </div>
      <div className="bar-list">
        {data.ratings.map(r=>(
          <div key={r.label} className="rating-row">
            <span>{r.label}</span>
            <div className="track"><div className="fill" style={{width:`${(r.value/max)*100}%`}}/></div>
            <strong>{r.value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ERIGauge({ data }) {
  const riskLabel = data.eriScore>=70?"Critical":data.eriScore>=55?"High Risk":data.eriScore>=35?"Moderate":"Low Risk";
  return (
    <Card>
      <div className="section-head compact">
        <div>
          <h2 style={{display:"flex",alignItems:"center",gap:6}}>ERI Score <ERITooltip breakdown={data.eriBreakdown}/></h2>
          <p>Estate Risk Index</p>
        </div>
        <span className="pill danger-pill">{riskLabel}</span>
      </div>
      <div className="gauge-wrap">
        <div className="gauge" style={{background:`conic-gradient(from 215deg,rgba(96,165,250,.95) 0deg,rgba(253,230,138,.95) ${data.eriScore*2.7}deg,rgba(255,255,255,.09) ${data.eriScore*2.7}deg 270deg,transparent 270deg)`}}>
          <div className="gauge-inner">
            <span>{data.eriScore}</span>
            <small>out of 100</small>
          </div>
        </div>
      </div>
      <p className="body-copy" style={{color:"rgba(255,255,255,.65)"}}>Recency-weighted composite using Google Reviews data. Higher = higher risk.</p>
    </Card>
  );
}

function WordCloud({ data }) {
  if (!data.words.length) return null;
  return (
    <Card>
      <div className="section-head">
        <div>
          <h2>High-Impact Themes</h2>
          <p>Most repeated signals from Google written reviews.</p>
        </div>
      </div>
      <div className="word-cloud">
        {data.words.map(([word,value],i)=>(
          <span key={word} style={{fontSize:Math.max(13,Math.min(38,11+value*0.75)),opacity:i<5?1:i<11?.85:.65}}>{word}</span>
        ))}
      </div>
    </Card>
  );
}

function Risks({ data }) {
  if (!data.risks.length) return null;
  const levelColor = l => l==="Critical"?"#fca5a5":l==="High"?"#fdba74":l==="Medium"?"#fde68a":"rgba(255,255,255,.6)";
  return (
    <Card>
      <div className="section-head compact">
        <div>
          <h2>Risk Ratings</h2>
          <p>Operational risk clusters from Google Reviews.</p>
        </div>
      </div>
      <div className="risk-list">
        {data.risks.map(r=>(
          <div key={r.name} className="risk-item">
            <div className="risk-top"><strong>{r.name}</strong><span style={{color:levelColor(r.level)}}>{r.level}</span></div>
            <div className="mini-track"><div style={{width:`${r.score}%`}}/></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Reviews({ data }) {
  if (!data.reviews.length) return null;
  return (
    <Card className="wide-card">
      <div className="section-head">
        <div>
          <h2>Review Signals</h2>
          <p>Sourced from Google Reviews · anonymised for display.</p>
        </div>
      </div>
      <div className="review-grid">
        {data.reviews.map((r,i)=>(
          <div key={i} className="review-card">
            <div className="review-top"><strong>{r.user}</strong><Stars n={r.rating}/></div>
            {r.date && <div className="review-date">{new Date(r.date).toLocaleDateString("en-ZA")}</div>}
            <p>{r.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function App() {
  const [selected, setSelected] = React.useState(null);
  const [data, setData] = React.useState(demoData);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingIndex, setLoadingIndex] = React.useState(0);
  const [error, setError] = React.useState("");
  const [pullsRemaining, setPullsRemaining] = React.useState(3);
  const [fromCache, setFromCache] = React.useState(false);
  const [hasScan, setHasScan] = React.useState(false);

  React.useEffect(()=>{
    if (!isLoading) return;
    const t = setInterval(()=>setLoadingIndex(c=>Math.min(c+1,loadingSteps.length-1)),850);
    return ()=>clearInterval(t);
  },[isLoading]);

  async function runScan() {
    if (!selected) { setError("Select an estate first."); return; }
    setError(""); setIsLoading(true); setLoadingIndex(0);
    try {
      const result = await fetchEriScan({ complexName:selected.name, location:selected.address, placeId:selected.place_id });
      setData(result.dashboard ?? result);
      setPullsRemaining(result.pullsRemaining ?? pullsRemaining);
      setFromCache(result.fromCache ?? false);
      setHasScan(true);
    } catch(err) { setError(err.message); }
    finally { setIsLoading(false); }
  }

  return (
    <div className="page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page { background: white !important; padding: 0 !important; }
          .card { box-shadow: none !important; border: 1px solid #ddd !important; background: #f9f9f9 !important; break-inside: avoid; }
          * { color: #111 !important; }
          .eyebrow, .kpi-sub, .section-head p, .review-date { color: #555 !important; }
          .fill { background: #60a5fa !important; }
          .word-cloud span { color: #111 !important; }
        }
        * { box-sizing: border-box; } body { margin: 0; }
        .page { min-height: 100vh; color: #f0f4ff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background: radial-gradient(circle at 12% 8%,rgba(64,126,255,.28),transparent 30%),radial-gradient(circle at 88% 10%,rgba(253,230,138,.14),transparent 26%),radial-gradient(circle at 50% 100%,rgba(37,99,235,.16),transparent 35%),#05070d; padding: 22px; }
        .shell { max-width: 1180px; margin: 0 auto; }
        .nav { height: 52px; display: flex; align-items: center; margin-bottom: 18px; }
        .brand { display: flex; gap: 10px; align-items: center; font-weight: 800; letter-spacing: -.02em; color: #fff; font-size: 17px; }
        .brand-emoji { font-size: 26px; line-height: 1; }
        .card { background: linear-gradient(180deg,rgba(255,255,255,.105),rgba(255,255,255,.058)); border: 1px solid rgba(255,255,255,.135); border-radius: 30px; padding: 24px; box-shadow: 0 24px 80px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter: blur(24px); }
        .hero { padding: 30px; }
        .hero-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 26px; align-items: start; }
        .badge { display: inline-flex; gap: 8px; align-items: center; padding: 8px 13px; border-radius: 999px; background: rgba(255,255,255,.09); color: rgba(255,255,255,.9); font-size: 13px; border: 1px solid rgba(255,255,255,.15); }
        .dot { width: 7px; height: 7px; border-radius: 99px; background: #93c5fd; box-shadow: 0 0 18px #60a5fa; }
        h1 { font-size: clamp(32px,5vw,62px); line-height: .92; letter-spacing: -0.065em; margin: 18px 0 16px; color: #fff; }
        h2 { margin: 0; font-size: 22px; letter-spacing: -.035em; color: #f0f4ff; }
        .hero-copy { color: rgba(255,255,255,.72); font-size: 15px; line-height: 1.65; max-width: 720px; margin: 0; }
        .search-panel { background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.12); border-radius: 26px; padding: 16px; }
        .search-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: rgba(255,255,255,.9); }
        .search-wrap { position: relative; margin-bottom: 10px; }
        .search-field { position: relative; }
        .search-field input { width: 100%; background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.15); border-radius: 17px; padding: 15px 16px 15px 40px; font-size: 14px; outline: none; transition: .2s ease; }
        .search-field input:focus { border-color: rgba(147,197,253,.6); box-shadow: 0 0 0 4px rgba(96,165,250,.13); background: rgba(255,255,255,.1); }
        .search-field input::placeholder { color: rgba(255,255,255,.4); }
        .search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .search-spinner { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.2); border-top-color: #93c5fd; border-radius: 50%; animation: spin .6s linear infinite; }
        .clear-x { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,.15); border: none; color: #fff; width: 20px; height: 20px; border-radius: 99px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: #111827; border: 1px solid rgba(255,255,255,.15); border-radius: 18px; overflow: hidden; z-index: 50; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
        .drop-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.06); transition: background .1s; }
        .drop-item:last-child { border-bottom: none; }
        .drop-item:hover, .drop-item.active { background: rgba(255,255,255,.08); }
        .pin-icon { width: 30px; height: 30px; border-radius: 10px; background: rgba(96,165,250,.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .drop-info { flex: 1; min-width: 0; }
        .drop-info strong { display: block; font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .drop-info span { display: block; font-size: 12px; color: rgba(255,255,255,.55); margin-top: 1px; }
        .drop-info em { display: inline-block; font-style: normal; font-size: 11px; color: rgba(255,255,255,.45); background: rgba(255,255,255,.08); border-radius: 6px; padding: 2px 7px; margin-top: 4px; }
        .drop-rating { text-align: right; flex-shrink: 0; }
        .drop-rating span { font-size: 13px; color: #fde68a; font-weight: 600; display: block; }
        .drop-rating small { font-size: 11px; color: rgba(255,255,255,.4); }
        .drop-empty { padding: 16px; font-size: 13px; color: rgba(255,255,255,.5); text-align: center; }
        button.scan-btn { width: 100%; border: 0; border-radius: 17px; padding: 15px 18px; font-weight: 850; color: #07111f; cursor: pointer; background: linear-gradient(135deg,#fde68a,#93c5fd 52%,#60a5fa); box-shadow: 0 18px 50px rgba(96,165,250,.22); transition: transform .2s ease,filter .2s ease; margin-top: 10px; font-size: 14px; }
        button.scan-btn:hover { transform: translateY(-1px); filter: brightness(1.04); }
        button.scan-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .status-row { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 12px; }
        .pill { border-radius: 999px; padding: 8px 12px; font-size: 12px; white-space: nowrap; }
        .blue-pill { color: #bfdbfe; background: rgba(96,165,250,.15); border: 1px solid rgba(96,165,250,.2); }
        .muted-pill { color: rgba(255,255,255,.8); background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
        .danger-pill { color: #fecaca; background: rgba(248,113,113,.15); border: 1px solid rgba(248,113,113,.18); }
        .green-pill { color: #bbf7d0; background: rgba(34,197,94,.12); border: 1px solid rgba(34,197,94,.22); }
        .loading-box, .error-box { margin-top: 13px; padding: 14px 15px; border-radius: 18px; font-size: 14px; }
        .loading-box { color: rgba(255,255,255,.9); background: rgba(96,165,250,.11); border: 1px solid rgba(96,165,250,.16); }
        .error-box { color: #fecaca; background: rgba(248,113,113,.13); border: 1px solid rgba(248,113,113,.18); }
        @keyframes spin { to { transform: rotate(360deg); } }
        .grid5 { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 14px; margin-top: 18px; }
        .grid2 { display: grid; grid-template-columns: 1.28fr .9fr; gap: 18px; margin-top: 18px; }
        .kpi-card { padding: 18px; min-height: 128px; display: flex; flex-direction: column; justify-content: space-between; }
        .eyebrow { color: rgba(255,255,255,.55); font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; }
        .kpi-value { font-size: clamp(25px,3vw,36px); font-weight: 850; letter-spacing: -.055em; color: #fff; }
        .kpi-sub { color: rgba(255,255,255,.65); font-size: 12px; }
        .section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
        .section-head.compact { margin-bottom: 10px; }
        .section-head p { margin: 6px 0 0; color: rgba(255,255,255,.65); font-size: 13px; }
        .bar-list { display: grid; gap: 14px; }
        .rating-row { display: grid; grid-template-columns: 44px 1fr 44px; gap: 12px; align-items: center; color: rgba(255,255,255,.8); font-size: 13px; }
        .rating-row strong { color: #fff; }
        .track { height: 16px; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; }
        .fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg,#fde68a,#93c5fd,#3b82f6); }
        .gauge-wrap { display: flex; justify-content: center; padding: 14px 0 18px; }
        .gauge { width: 218px; height: 218px; border-radius: 50%; display: grid; place-items: center; transform: rotate(-135deg); }
        .gauge-inner { width: 166px; height: 166px; border-radius: 50%; background: rgba(5,7,13,.92); display: grid; place-items: center; transform: rotate(135deg); border: 1px solid rgba(255,255,255,.12); }
        .gauge-inner span { font-size: 62px; font-weight: 900; letter-spacing: -.06em; line-height: 1; color: #fff; }
        .gauge-inner small { color: rgba(255,255,255,.6); margin-top: -36px; }
        .body-copy { line-height: 1.65; margin: 0; font-size: 14px; }
        .word-cloud { min-height: 246px; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 12px 20px; background: rgba(0,0,0,.18); border: 1px solid rgba(255,255,255,.09); border-radius: 24px; padding: 24px; }
        .word-cloud span { font-weight: 880; letter-spacing: -.04em; color: #fff; }
        .risk-list { display: grid; gap: 12px; }
        .risk-item { background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; padding: 14px; }
        .risk-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 11px; font-size: 14px; }
        .risk-top strong { color: #f0f4ff; }
        .mini-track { height: 8px; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; }
        .mini-track div { height: 100%; border-radius: inherit; background: linear-gradient(90deg,#fde68a,#fb923c,#ef4444); }
        .wide-card { margin-top: 18px; }
        .review-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 13px; }
        .review-card { background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.09); border-radius: 23px; padding: 16px; }
        .review-card strong { color: #f0f4ff; font-size: 14px; }
        .review-card p { color: rgba(255,255,255,.75); font-size: 13px; line-height: 1.55; margin: 10px 0 0; }
        .review-date { font-size: 11px; color: rgba(255,255,255,.45); margin-top: 4px; }
        .stars { color: #fde68a; font-size: 13px; letter-spacing: 1px; }
        .stars span { color: rgba(255,255,255,.2); }
        .review-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
        .eri-info-wrap { position: relative; display: inline-flex; align-items: center; }
        .eri-info-btn { background: none; border: none; color: rgba(255,255,255,.5); font-size: 14px; cursor: pointer; padding: 0 2px; line-height: 1; transition: color .15s; }
        .eri-info-btn:hover { color: #93c5fd; }
        .eri-tooltip { position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%); width: 270px; background: #1a2035; border: 1px solid rgba(147,197,253,.3); border-radius: 16px; padding: 14px; z-index: 100; box-shadow: 0 20px 60px rgba(0,0,0,.7); }
        .eri-tooltip-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.6); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .eri-tooltip-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,.85); padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.07); }
        .eri-tooltip-row:last-of-type { border-bottom: none; }
        .eri-tooltip-row span:first-child { flex: 1; }
        .eri-tooltip-weight { color: #93c5fd; font-weight: 700; font-size: 12px; }
        .eri-tooltip-val { background: rgba(255,255,255,.1); border-radius: 6px; padding: 2px 7px; font-size: 12px; color: rgba(255,255,255,.65); min-width: 28px; text-align: center; }
        .eri-tooltip-note { font-size: 11px; color: rgba(255,255,255,.5); margin-top: 10px; line-height: 1.5; }
        .footer-area { margin-top: 28px; display: flex; flex-direction: column; align-items: center; gap: 16px; padding-bottom: 12px; }
        .footer-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
        .btn-join { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 999px; background: linear-gradient(135deg,#fde68a,#93c5fd 52%,#60a5fa); color: #07111f; font-weight: 800; font-size: 14px; text-decoration: none; transition: transform .2s,filter .2s; }
        .btn-join:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .btn-print { display: inline-flex; align-items: center; gap: 8px; padding: 14px 24px; border-radius: 999px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.9); font-weight: 600; font-size: 14px; border: 1px solid rgba(255,255,255,.18); cursor: pointer; transition: background .2s; }
        .btn-print:hover { background: rgba(255,255,255,.14); }
        .footer-note { text-align: center; color: rgba(255,255,255,.45); font-size: 12px; line-height: 1.8; }
        .footer-note a { color: rgba(147,197,253,.8); text-decoration: none; }
        .footer-note a:hover { text-decoration: underline; }
        @media (max-width: 980px) { .hero-grid, .grid2 { grid-template-columns: 1fr; } .grid5 { grid-template-columns: repeat(2,minmax(0,1fr)); } .review-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 640px) { .page { padding: 14px; } .card, .hero { border-radius: 24px; padding: 18px; } .grid5, .review-grid { grid-template-columns: 1fr; } .section-head { flex-direction: column; } }
      `}</style>

      <main className="shell">
        <div className="nav no-print">
          <div className="brand"><span className="brand-emoji">🏠</span> BANKERX SAFEHOUSE</div>
        </div>

        <Card className="hero">
          <div className="hero-grid">
            <div>
              <div className="badge"><span className="dot"/> SAFEHOUSE Dashboard</div>
              <h1>{data.estate}</h1>
              <p className="hero-copy">Reputation intelligence for South African residential estates — combining public ratings, written review sentiment, operational risk themes and escalation signals into one clean dashboard.</p>
            </div>
            <div className="search-panel no-print">
              <div className="search-title">Run an estate scan</div>
              <EstateSearch onSelect={setSelected} disabled={isLoading}/>
              {fromCache && (
                <div style={{marginBottom:10,padding:"10px 13px",borderRadius:14,background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.18)",fontSize:12,color:"#bbf7d0"}}>
                  ✓ Showing cached result · refreshes automatically every 7 days
                </div>
              )}
              <button className="scan-btn" disabled={isLoading||!selected} onClick={runScan}>
                {isLoading?"Running…":"Run Risk Tool"}
              </button>
              <div className="status-row">
                <span className="pill blue-pill">Scans remaining: {pullsRemaining}</span>
                {hasScan && <span className={`pill ${fromCache?"green-pill":"muted-pill"}`}>{data.cacheStatus}</span>}
                {hasScan && <span className="pill muted-pill">{data.lastUpdated}</span>}
              </div>
              {isLoading && (
                <div className="loading-box">
                  <span style={{display:"inline-block",width:12,height:12,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin .6s linear infinite",marginRight:8,verticalAlign:"middle"}}/>
                  {loadingSteps[loadingIndex]}
                </div>
              )}
              {error && <div className="error-box">{error}</div>}
            </div>
          </div>
        </Card>

        {hasScan && (
          <>
            <section className="grid5">
              <KPI label="Public Rating" value={data.publicRating} sub="Google Maps signal"/>
              <KPI label="Analysed Average" value={data.analysedAverage} sub="Review-weighted avg"/>
              <KPI label="Reviews Analysed" value={data.writtenReviews} sub="Google review depth"/>
              <KPI label="Critical Risks" value={data.criticalRisks} sub="Flagged clusters"/>
              <KPI label="ERI Score" value={`${data.eriScore}/100`} sub="Composite risk"/>
            </section>
            <section className="grid2">
              <RatingDistribution data={data}/>
              <ERIGauge data={data}/>
            </section>
            <section className="grid2">
              <WordCloud data={data}/>
              <Risks data={data}/>
            </section>
            <Reviews data={data}/>
          </>
        )}

        <div className="footer-area">
          <div className="footer-btns no-print">
            <a className="btn-join" href="https://www.bankerx.org/join" target="_blank" rel="noopener noreferrer">🏠 Join BANKERX</a>
            {hasScan && <button className="btn-print" onClick={()=>window.print()}>🖨 Print to PDF</button>}
          </div>
          <p className="footer-note">
            BANKERX SAFEHOUSE · Educational analytics only · Not property, legal or financial advice.<br/>
            All data sourced from publicly available sources (Google Reviews).<br/>
            Send us your feedback: <a href="mailto:contact@bankerx.co.za">contact@bankerx.co.za</a>
          </p>
        </div>
      </main>
    </div>
  );
}
