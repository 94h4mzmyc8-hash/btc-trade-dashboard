const $ = (id) => document.getElementById(id);
const fmtMoney = (v) => v == null ? "--" : "$" + Math.round(v).toLocaleString("en-US");
const fmtNum = (v, d = 1) => v == null ? "--" : Number(v).toFixed(d);
const fmtPct = (v, d = 1) => v == null ? "--" : (v > 0 ? "+" : "") + fmtNum(v, d) + "%";
const pctClass = (v) => (v == null ? "" : v >= 0 ? "up" : "down");
const ist = (iso) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

let chart = null;
let series = null;

function renderScenarios(s) {
  if (!s) return;
  const defs = [
    ["flushHold", "FLUSH HOLDS 62.2-62.6K", "Buy the raid at support, reclaim"],
    ["breakdown", "BREAKDOWN <62K", "4h close below 62,000 -> short 59K"],
    ["breakout", "BREAKOUT >65.5K", "Squeeze above range top"],
    ["grind", "RANGE GRIND", "62.2K-64.3K fade edges only"],
  ];
  const max = Math.max(...defs.map(([k]) => s[k] || 0));
  $("scenarios").innerHTML = defs.map(([k, name, desc]) => `
    <div class="scenario ${s[k] === max ? "top" : ""}">
      <div class="name">${name}</div>
      <div class="pct">${s[k] || "--"}%</div>
      <div class="desc">${desc}</div>
    </div>`).join("");
}

function renderOnchain(p) {
  const oc = p.onchain;
  const m = [
    ["Funding (1h)", oc.funding ? (oc.funding.latest * 100).toFixed(4) + "%" : "--",
      oc.funding ? `24h range ${(oc.funding.low24h * 100).toFixed(4)}-${(oc.funding.high24h * 100).toFixed(4)}%` : "no key"],
    ["Perp OI", oc.oi ? oc.oi.oiBtc.toLocaleString("en-US") + " BTC" : "--",
      oc.oi ? `${fmtPct(oc.oi.change24hPct)} vs 24h ago` : "no key"],
    ["Exchange netflow 24h", oc.netflow ? (oc.netflow.netflow24h > 0 ? "+" : "") + oc.netflow.netflow24h.toLocaleString("en-US") + " BTC" : "--",
      oc.netflow ? (oc.netflow.netflow24h > 0 ? "sell pressure" : "accumulation") : "no key"],
    ["SOPR", oc.sopr ? oc.sopr.sopr.toFixed(3) : "--", oc.sopr ? (oc.sopr.sopr < 1 ? "coins moving at loss" : "profit-taking") : "no key"],
    ["MVRV", oc.mvrv ? oc.mvrv.toFixed(2) : "--", oc.mvrv ? (oc.mvrv < 1.2 ? "cheap zone" : "fair value") : "no key"],
    ["Fear & Greed", p.fearGreed ? p.fearGreed.value + " (" + p.fearGreed.classification + ")" : "--",
      p.fearGreed ? `prev ${p.fearGreed.prevValue}` : "--"],
    ["BTC dominance", p.btcDominance != null ? fmtNum(p.btcDominance, 2) + "%" : "--", "of total mcap"],
    ["24h volume", fmtMoney(p.volume24h), "spot+deriv"],
  ];
  $("onchain").innerHTML = m.map(([k, v, s]) => `
    <div class="metric"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join("");
}

function renderLadder(el, rows, kind) {
  $(el).innerHTML = rows.map((r) => {
    let cls = kind + " lvl";
    if (r.level == null) return "";
    if (r.dist != null && Math.abs(r.dist) < 0.6) cls += " near";
    if (r.dist != null && ((kind === "sup" && r.dist < 0) || (kind === "res" && r.dist > 0))) cls += " hit";
    return `<div class="${cls}">
      <span class="name">${r.name}</span>
      <span class="val">${r.level.toLocaleString("en-US")}</span>
      <span class="dist">${r.dist != null ? fmtPct(r.dist, 2) : "--"}</span>
    </div>`;
  }).join("");
}

function renderSignals(sigs) {
  $("signals").innerHTML = sigs.map((s) => `
    <div class="sig ${s.active ? "active" : ""}">
      <span class="dot"></span><span class="id">${s.id}</span>
      <span class="txt">${s.text}</span>
    </div>`).join("");
}

function renderTrades(trades) {
  $("trades").innerHTML = trades.map((t) => {
    const triggered = t.status.includes("TRIGGERED") || t.status.includes("ACTIVE");
    return `<div class="trade ${triggered ? "active" : ""}">
      <h4>${t.id} · ${t.name}</h4>
      <div class="status ${t.status.includes("TRIGGERED") ? "triggered" : ""}">${t.status}</div>
      <div class="row">Entry: <b>${t.entry}</b></div>
      <div class="row">Stop: <b>${t.stop}</b> · Targets: <b>${t.targets}</b></div>
      <div class="row">Confirm: ${t.confirmation}</div>
      <div class="row">R:R <b>${t.rr}</b></div>
    </div>`;
  }).join("");
}

function renderKillSwitches(ks) {
  $("killswitches").innerHTML = ks.length
    ? ks.map((k) => `<div class="ks fired">${k}</div>`).join("")
    : '<div class="ks">No kill switches active. Monitor: funding >0.010%/h · OI +3% · netflow >+2,000 BTC · SOPR <0.98</div>';
}

function renderWindows(p) {
  $("windows").innerHTML =
    p.timeWindows.map((w) => `
      <div class="win"><span class="t">${w.t} IST</span><span class="e">${w.e}</span><span class="a">${w.a}</span></div>`).join("") +
    `<div class="win"><span class="t">RULES</span><span class="e">Risk ${p.riskRules.riskPerTradePct}%/trade · max ${p.riskRules.maxDailyLossPct}%/day · ${p.riskRules.maxTradesPerSession} trades · ≤${p.riskRules.leverageCap}x</span><span class="a">Flat by ${p.riskRules.flatByIST} IST · no positions through ${p.riskRules.noPositionsThrough}</span></div>`;
}

function renderChart(history) {
  if (!history || history.length < 2) return;
  if (!chart) {
    chart = LightweightCharts.createChart($("chart"), {
      layout: { background: { color: "#0f1420" }, textColor: "#7a8499" },
      grid: { vertLines: { color: "#1e2636" }, horzLines: { color: "#1e2636" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#1e2636" },
    });
    series = chart.addLineSeries({ color: "#3b82f6", lineWidth: 2 });
  }
  series.setData(history.map((h) => ({ time: Math.floor(new Date(h.t).getTime() / 1000), value: h.price })));
  chart.timeScale().fitContent();
}

async function fetchJsonWithFallback(paths) {
  for (const p of paths) {
    try {
      const r = await fetch(p);
      if (r.ok) return await r.json();
    } catch { /* try next */ }
  }
  return null;
}

async function load() {
  const [latest, history] = await Promise.all([
    fetchJsonWithFallback(["./data/latest.json", "../data/latest.json"]),
    fetchJsonWithFallback(["./data/history.json", "../data/history.json"]),
  ]);
  if (!latest) {
    $("price").textContent = "DATA UNAVAILABLE - waiting for first GitHub Actions run";
    return;
  }
  const p = latest;

  $("price").textContent = fmtMoney(p.price);
  $("chg24").textContent = `${fmtPct(p.change24h)} · 7d ${fmtPct(p.change7d)} · 30d ${fmtPct(p.change30d)}`;
  $("chg24").className = "chg " + pctClass(p.change24h);
  $("fng").textContent = `F&G ${p.fearGreed ? p.fearGreed.value : "--"}`;
  $("genTime").textContent = `Updated: ${p.generatedAtIST} IST (UTC ${new Date(p.generatedAt).toUTCString().slice(17, 25)})`;

  renderScenarios(p.scenarios);
  renderOnchain(p);
  renderLadder("resistance", p.levelMap.resistance, "res");
  renderLadder("support", p.levelMap.support, "sup");
  renderSignals(p.signals);
  renderTrades(p.trades);
  renderKillSwitches(p.killSwitches);
  renderWindows(p);
  renderChart(history);

  document.title = `BTC ${fmtMoney(p.price)} - Trade Desk`;
}

$("refresh").addEventListener("click", load);
setInterval(load, 120000);
load();