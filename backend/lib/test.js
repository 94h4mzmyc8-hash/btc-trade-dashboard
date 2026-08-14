import { buildPlan } from "./plan.js";

const sample = {
  cmcQuote: {
    price: 62793.84, change24h: -0.88, change7d: -3.08, change30d: -3.23,
    volume24h: 20299331808, marketCap: 1260284028743,
  },
  cmcGlobal: { totalMarketCap: 2170000000000, btcDominance: 58.4, ethDominance: 10.5, spotVolume24h: 100000000000 },
  fng: { value: 29, classification: "Fear", prevValue: 29, updated: Date.now() },
  cgPrice: null,
  ohlc: [
    ["2026-06-28", 62662, 63032, 58124, 59954],
    ["2026-07-02", 59953, 61067, 57779, 59968],
    ["2026-07-06", 59968, 63900, 59542, 63569],
    ["2026-07-10", 63586, 64530, 61325, 63198],
    ["2026-07-14", 63193, 64621, 61782, 62269],
    ["2026-07-18", 62279, 65501, 62224, 63899],
    ["2026-07-22", 63918, 66892, 63734, 66516],
    ["2026-07-26", 66539, 66684, 63700, 64321],
    ["2026-07-30", 64316, 65618, 62785, 63916],
    ["2026-08-03", 63934, 65305, 62263, 63501],
    ["2026-08-07", 63466, 64933, 62241, 64261],
    ["2026-08-11", 64263, 65363, 63771, 63915],
  ].map(([t, o, h, l, c]) => ({ t, o, h, l, c })),
  funding: { latest: 0.0000514, high24h: 0.0000997, low24h: 0.0000376 },
  oi: { oiBtc: 487099, change24hPct: 1.44 },
  netflow: { netflow24h: -1585 },
  sopr: { sopr: 0.998 },
  mvrv: { realizedCapUsd: 1058164509375 },
};

const plan = buildPlan(sample);
if (!plan) throw new Error("buildPlan returned null");

console.log("PRICE:", plan.price, "| IST:", plan.generatedAtIST);
console.log("LEVELS:", JSON.stringify(plan.levels));
console.log("SCENARIOS:", JSON.stringify(plan.scenarios));
console.log("SIGNALS:", plan.signals.map((s) => `${s.active ? "●" : "○"} ${s.id}`).join(" "));
console.log("KILL SWITCHES:", plan.killSwitches.length);
console.log("TRADES:", plan.trades.map((t) => `${t.id}:${t.status.slice(0, 20)}`).join(" | "));
console.log("MVRV:", plan.onchain.mvrv.toFixed(2));
console.log("ENGINE TEST PASSED");