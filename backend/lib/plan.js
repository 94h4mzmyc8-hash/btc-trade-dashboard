import { computeLevels, buildLevelMap, computeScenarios, computeSignals, computeKillSwitches, buildTimeWindows } from "./analysis.js";

export function buildPlan(data) {
  const { cmcQuote, cgPrice, ohlc, funding, oi, netflow, sopr, fng } = data;
  const quote = cmcQuote || cgPrice;
  const price = quote ? quote.price : null;
  const hasChange = (x) => x == null ? null : x;
  const change24h = cmcQuote ? hasChange(cmcQuote.change24h) : cgPrice ? hasChange(cgPrice.change24h) : null;
  const change7d = cmcQuote ? hasChange(cmcQuote.change7d) : cgPrice ? hasChange(cgPrice.change7d) : null;
  const change30d = cmcQuote ? hasChange(cmcQuote.change30d) : cgPrice ? hasChange(cgPrice.change30d) : null;
  const volume24h = (cmcQuote || cgPrice || {}).volume24h ?? null;
  const marketCap = (cmcQuote || cgPrice || {}).marketCap ?? null;
  if (!price || !ohlc || !ohlc.length) return null;

  const lv = computeLevels(ohlc);
  const levelMap = buildLevelMap(price, lv);
  const scenarios = computeScenarios({ price, lv, funding, oi, netflow, sopr, fng });
  const signals = computeSignals(price, lv, funding);
  const killSwitches = computeKillSwitches({ funding, oi, netflow, sopr });

  const trades = [
    {
      id: "A",
      name: "LONG - buy the flush",
      status: price >= 62200 && price <= 62650 ? "ACTIVE ZONE" : price < 62200 ? "WAIT (invalid if 4h <62,000)" : "STAGED",
      entry: "62,200-62,650 (2-step scale-in: 62,540-650 / 62,240-320)",
      stop: "61,850",
      targets: "T1 63,450 (pivot) -> T2 64,000 (61.8% fib)",
      confirmation: "15m close above 62,750 or rejection wick on zone",
      rr: "2.5-3.5:1",
    },
    {
      id: "C1",
      name: "SHORT - breakdown continuation",
      status: price < 62000 ? "TRIGGERED" : "CONTINGENCY",
      entry: "61,950-62,100 on retest after 4h close < 62,000",
      stop: "62,600",
      targets: "61,000 -> 59,000 (July low)",
      confirmation: "4h close below 62,000",
      rr: "2.5:1",
    },
    {
      id: "B",
      name: "SHORT - range resistance",
      status: "DEACTIVATED tonight (unreachable; reactivate on reclaim of 63,500)",
      entry: "65,300-65,500 on 15m rejection",
      stop: "65,900",
      targets: "64,000 -> 63,400",
      confirmation: "Daily close below 66,000",
      rr: "2.2:1",
    },
    {
      id: "C2",
      name: "LONG - momentum breakout",
      status: "OPTIONALITY",
      entry: "4h close > 66,000",
      stop: "65,000",
      targets: "67,000 -> 68,200",
      confirmation: "Holds 2 hours above 66,000",
      rr: "2.5:1",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    generatedAtIST: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    price: price,
    change24h: change24h,
    change7d: change7d,
    change30d: change30d,
    volume24h: volume24h,
    marketCap: marketCap,
    btcDominance: data.cmcGlobal ? data.cmcGlobal.btcDominance : null,
    fearGreed: fng,
    onchain: {
      funding: funding,
      oi: oi,
      netflow: netflow,
      sopr: sopr,
      realizedCapUsd: data.mvrv ? data.mvrv.realizedCapUsd : null,
      mvrv: data.mvrv && cmcQuote ? cmcQuote.marketCap / data.mvrv.realizedCapUsd : null,
    },
    levels: lv,
    levelMap: levelMap,
    scenarios: scenarios,
    signals: signals,
    killSwitches: killSwitches,
    trades: trades,
    timeWindows: buildTimeWindows(),
    riskRules: {
      riskPerTradePct: 0.5,
      maxDailyLossPct: 1.0,
      maxTradesPerSession: 3,
      leverageCap: 5,
      flatByIST: "06:30",
      noPositionsThrough: "FOMC minutes 19 Aug 23:30 IST",
    },
  };
}