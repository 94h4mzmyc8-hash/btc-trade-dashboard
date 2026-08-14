const BASE = {
  cmc: "https://pro-api.coinmarketcap.com/v1",
  glassnode: "https://api.glassnode.com/v1/metrics",
  coingecko: "https://api.coingecko.com/api/v3",
  fng: "https://api.alternative.me/fng",
};

const CMC_KEY = process.env.CMC_API_KEY || "";
const GN_KEY = process.env.GLASSNODE_API_KEY || "";

async function fetchJson(url, opts = {}, timeoutMs = 20000, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 3000 * attempt));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    } finally {
      clearTimeout(t);
    }
  }
}

export async function fetchCmcQuote() {
  const q = new URLSearchParams({ id: "1", convert: "USD" });
  const j = await fetchJson(`${BASE.cmc}/cryptocurrency/quotes/latest?${q}`, {
    headers: { "X-CMC_PRO_API_KEY": CMC_KEY },
  });
  const d = j.data["1"];
  const qq = d.quote.USD;
  return {
    price: qq.price,
    change24h: qq.percent_change_24h,
    change7d: qq.percent_change_7d,
    change30d: qq.percent_change_30d,
    volume24h: qq.volume_24h,
    marketCap: qq.market_cap,
    lastUpdated: d.last_updated,
  };
}

export async function fetchCmcGlobal() {
  const j = await fetchJson(`${BASE.cmc}/global-metrics/quotes/latest`, {
    headers: { "X-CMC_PRO_API_KEY": CMC_KEY },
  });
  const d = j.data;
  return {
    totalMarketCap: d.quote.USD.total_market_cap,
    btcDominance: d.btc_dominance,
    ethDominance: d.eth_dominance,
    spotVolume24h: d.quote.USD.total_volume_24h,
  };
}

export async function fetchFearGreed() {
  const j = await fetchJson(`${BASE.fng}/?limit=2`);
  const now = j.data[0];
  const prev = j.data[1];
  return {
    value: parseInt(now.value, 10),
    classification: now.value_classification,
    prevValue: parseInt(prev.value, 10),
    updated: now.timestamp * 1000,
  };
}

export async function fetchCgPrice() {
  const j = await fetchJson(
    `${BASE.coingecko}/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
  );
  const md = j.market_data;
  return {
    price: md.current_price.usd,
    change24h: md.price_change_percentage_24h,
    change7d: md.price_change_percentage_7d,
    change30d: md.price_change_percentage_30d,
    volume24h: md.total_volume.usd,
    marketCap: md.market_cap.usd,
  };
}

export async function fetchCgOhlc(days = 90) {
  const j = await fetchJson(
    `${BASE.coingecko}/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`
  );
  return j.map((r) => ({
    t: new Date(r[0]).toISOString().slice(0, 10),
    o: r[1], h: r[2], l: r[3], c: r[4],
  }));
}

export async function fetchGlassnode(endpoint, interval, fallback = null) {
  if (!GN_KEY) return fallback;
  const q = new URLSearchParams({ a: "BTC", i: interval, api_key: GN_KEY });
  try {
    return await fetchJson(`${BASE.glassnode}/${endpoint}?${q}`);
  } catch {
    return fallback;
  }
}

export async function fetchGnFundingHourly() {
  const rows = await fetchGlassnode(
    "derivatives/futures_funding_rate_perpetual",
    "1h"
  );
  if (!rows || !rows.length) return null;
  const vals = rows.map((r) => r.v);
  const latest = vals[vals.length - 1];
  return {
    latest: latest,
    high24h: Math.max(...vals.slice(-24)),
    low24h: Math.min(...vals.slice(-24)),
    ts: rows[rows.length - 1].t,
  };
}

export async function fetchGnExchangeNetflow() {
  const rows = await fetchGlassnode(
    "transactions/transfers_volume_exchanges_net",
    "24h"
  );
  if (!rows || !rows.length) return null;
  const last = rows[rows.length - 1];
  return { netflow24h: last.v, ts: last.t };
}

export async function fetchGnSopr() {
  const rows = await fetchGlassnode("indicators/sopr", "24h");
  if (!rows || !rows.length) return null;
  return { sopr: rows[rows.length - 1].v };
}

export async function fetchGnMvrv() {
  const rows = await fetchGlassnode("market/marketcap_realized_usd", "24h");
  if (!rows || !rows.length) return null;
  const realizedCap = rows[rows.length - 1].v;
  return { realizedCapUsd: realizedCap };
}

export async function fetchGnPerpOi() {
  const rows = await fetchGlassnode(
    "derivatives/futures_open_interest_perpetual_sum",
    "24h"
  );
  if (!rows || !rows.length) return null;
  const vals = rows.map((r) => r.v);
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2] || last;
  return {
    oiBtc: last,
    change24hPct: prev ? ((last - prev) / prev) * 100 : 0,
  };
}

export async function fetchAllSources() {
  const results = await Promise.allSettled([
    fetchCmcQuote(),
    fetchCmcGlobal(),
    fetchFearGreed(),
    fetchCgOhlc(),
    fetchCgPrice(),
    fetchGnFundingHourly(),
    fetchGnExchangeNetflow(),
    fetchGnSopr(),
    fetchGnMvrv(),
    fetchGnPerpOi(),
  ]);
  const names = [
    "cmcQuote", "cmcGlobal", "fng", "ohlc", "cgPrice",
    "funding", "netflow", "sopr", "mvrv", "oi",
  ];
  const out = {};
  results.forEach((r, i) => {
    out[names[i]] = r.status === "fulfilled" ? r.value : null;
  });
  return out;
}
