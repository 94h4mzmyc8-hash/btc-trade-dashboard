export function computeLevels(ohlc) {
  const closes = ohlc.map((d) => d.c);
  const n = closes.length;
  const sma = (k) => {
    if (n < k) return null;
    return closes.slice(-k).reduce((a, b) => a + b, 0) / k;
  };

  const last3 = ohlc.slice(-3);
  const H = Math.max(...last3.map((d) => d.h));
  const L = Math.min(...last3.map((d) => d.l));
  const C = closes[closes.length - 1];
  const P = (H + L + C) / 3;

  const lookback = ohlc.slice(-21);
  const sh = Math.max(...lookback.map((d) => d.h));
  const sl = Math.min(...lookback.map((d) => d.l));
  const fib = (f) => sh - (sh - sl) * f;

  return {
    sma7: sma(7),
    sma30: sma(30),
    pivot: P,
    r1: 2 * P - L,
    s1: 2 * P - H,
    fib38: fib(0.382),
    fib50: fib(0.5),
    fib618: fib(0.618),
    fib786: fib(0.786),
    swingHigh: sh,
    swingLow: sl,
    high90: Math.max(...ohlc.map((d) => d.h)),
    low90: Math.min(...ohlc.map((d) => d.l)),
  };
}

export function buildLevelMap(price, lv) {
  const fmt = (v) => (v == null ? null : Math.round(v));
  const dist = (v) => (v == null ? null : ((price - v) / price) * 100);
  const support = [
    { name: "Recent swing low", level: fmt(lv.swingLow), dist: dist(lv.swingLow) },
    { name: "Breakdown line", level: fmt(62000), dist: dist(62000) },
    { name: "Invalidation", level: fmt(61850), dist: dist(61850) },
    { name: "78.6% fib", level: fmt(lv.fib786), dist: dist(lv.fib786) },
    { name: "July low", level: fmt(59200), dist: dist(59200) },
    { name: "90d floor", level: fmt(lv.low90), dist: dist(lv.low90) },
  ].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  const resistance = [
    { name: "Pivot", level: fmt(lv.pivot), dist: dist(lv.pivot) },
    { name: "38.2% fib", level: fmt(lv.fib38), dist: dist(lv.fib38) },
    { name: "50% fib / SMA7", level: fmt(Math.max(lv.fib50, lv.sma7 || 0)), dist: dist(Math.max(lv.fib50, lv.sma7 || 0)) },
    { name: "61.8% fib / SMA30", level: fmt(Math.max(lv.fib618, lv.sma30 || 0)), dist: dist(Math.max(lv.fib618, lv.sma30 || 0)) },
    { name: "Swing-high cluster", level: fmt(65350), dist: dist(65350) },
    { name: "Range top", level: fmt(lv.swingHigh), dist: dist(lv.swingHigh) },
  ].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  return { support, resistance };
}

export function computeScenarios({ price, lv, funding, oi, netflow, sopr, fng }) {
  let flush = 38, breakdown = 27, breakout = 20, grind = 15;

  const nearSupport = price <= lv.swingLow + 400;
  const atResistance = price >= 65000;
  if (nearSupport) { flush += 12; breakdown += 4; grind -= 6; }
  if (atResistance) { breakout += 10; flush -= 8; }

  if (funding) {
    if (funding.latest > 0.00008) { flush += 8; breakout -= 4; }
    if (funding.latest < 0.00003) { flush += 6; breakout += 6; }
    if (funding.latest > 0.0001) { flush -= 6; breakdown += 6; }
  }
  if (oi) {
    if (oi.change24hPct > 2 && !nearSupport) { breakdown += 8; flush -= 4; }
    if (oi.change24hPct > 2 && nearSupport) { flush += 6; }
  }
  if (netflow) {
    if (netflow.netflow24h > 2000) breakdown += 8;
    if (netflow.netflow24h < -1500) flush += 6;
  }
  if (sopr && sopr.sopr < 0.98) { breakdown += 6; flush -= 4; }
  if (fng) {
    if (fng.value <= 25) flush += 8;
    if (fng.value >= 60) breakdown += 6;
  }

  const total = flush + breakdown + breakout + grind;
  return {
    flushHold: Math.round((flush / total) * 100),
    breakdown: Math.round((breakdown / total) * 100),
    breakout: Math.round((breakout / total) * 100),
    grind: Math.round((grind / total) * 100),
  };
}

export function computeSignals(price, lv, funding) {
  const s = [];
  const push = (id, active, text) => s.push({ id, active, text });

  push("A_BUY_ZONE", price >= 62200 && price <= 62650,
    "LONG (Trade A): price in 62,200-62,650 zone");
  push("A_CONFIRM", price > 62750,
    "A-CONFIRM: 15m reclaim above 62,750");
  push("C1_TRIGGERED", price < 62000,
    "SHORT (Trade C1): price below 62,000 breakdown line");
  push("B_SELL_ZONE", price >= 65300 && price <= 65500,
    "SHORT (Trade B): price in 65,300-65,500 zone");
  push("C2_BREAKOUT", price > 66000,
    "LONG (Trade C2): breakout above 66,000");
  push("STOP_RAID", price < 61850,
    "Invalidation: below 61,850 - flush failing, all longs exit");

  if (funding) {
    push("KILL_LONG_CROWD", funding.latest > 0.0001,
      "KILL SWITCH: funding >0.010%/h - long crowd, fade rallies");
    push("SHORT_CROWDED", funding.latest < 0.00002,
      "Shorts crowded (funding <0.002%/h) - long bias");
  }
  return s;
}

export function computeKillSwitches({ funding, oi, netflow, sopr }) {
  const ks = [];
  if (funding && funding.latest > 0.0001)
    ks.push("Funding >0.010%/h - longs crowded; take T1 early, no T2");
  if (oi && oi.change24hPct > 3)
    ks.push(`OI +${oi.change24hPct.toFixed(1)}% intraday - breakout pending; halve size`);
  if (netflow && netflow.netflow24h > 2000)
    ks.push("Exchange netflow > +2,000 BTC - whales selling; skip longs");
  if (sopr && sopr.sopr < 0.98)
    ks.push(`SOPR ${sopr.sopr.toFixed(3)} - capitulation signal; wait for reclaim`);
  return ks;
}

export function buildTimeWindows() {
  return [
    { t: "19:00-20:00", e: "London/NY overlap open", a: "Monitor news flow, avoid entries" },
    { t: "23:30-00:30", e: "US morning, CME rollover", a: "High liquidity; primary entry window" },
    { t: "01:30-02:30", e: "NY close + CME settlement", a: "Flush low or reclaim prints here" },
    { t: "02:30-06:30", e: "Late NY / Asia", a: "Trail stops, flat by 06:30" },
    { t: "06:30-13:30", e: "Asia session", a: "Reassess; watch for funding drift" },
  ];
}