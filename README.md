# BTC Trade Desk — Continuous Bitcoin Analysis Dashboard

Browser-based, institution-style BTC day-trading analysis that runs **continuously and free**, entirely from GitHub: a cron workflow analyses the market every 15 minutes, and a static dashboard is served on GitHub Pages.

## How it works

```
GitHub Actions (every 15 min)
   │  CMC API · Glassnode API · CoinGecko API · Fear&Greed API
   ▼
Analysis engine (Node.js, no dependencies)
   │  levels (fib/pivot/SMA) · scenarios · signals · kill switches · trade plan (IST)
   ▼
data/latest.json + data/history.json  ──►  GitHub Pages dashboard (static HTML/JS)
```

- **No server.** Everything runs inside GitHub's free Actions quota (~2 min per run × 96 runs/day ≈ 200 min/month; free tier is 2,000 min).
- **All times in IST** (Asia/Kolkata) in the output and the dashboard.

## Setup (5 minutes)

1. **Create a GitHub repository** and push this project to it (see "Push to GitHub" below).
2. **Add API keys as repository Secrets** (Settings → Secrets and variables → Actions):
   - `CMC_API_KEY` — CoinMarketCap free key (https://pro.coinmarketcap.com) — required for quotes & market data.
   - `GLASSNODE_API_KEY` — Glassnode free key (https://glassnode.com) — required for on-chain metrics (funding, OI, flows, SOPR, MVRV). Without it, on-chain sections show `no key`.
   - CoinGecko and Fear&Greed need no key. The engine **degrades gracefully** if any source is missing.
3. **Enable GitHub Pages**: Settings → Pages → Source: **GitHub Actions**.
4. **Trigger one run manually**: Actions → "btc-analysis" → Run workflow. Wait ~2 min.
5. Open your dashboard at `https://<user>.github.io/<repo>/`.

The workflow now runs automatically every 15 minutes.

## Dashboard contents

- Live BTC price, 24h/7d/30d change, Fear & Greed
- Scenario matrix (flush-hold / breakdown / breakout / grind) with probability weights
- On-chain + derivatives panel: funding, perp OI, exchange netflow, SOPR, MVRV, dominance, volume
- Support/resistance ladder with live % distance and proximity flags
- Signal panel (buy-zone, confirm, breakdown, breakout, kill-switch triggers)
- Trade plan cards (A / B / C1 / C2) with entries, stops, targets, R:R
- Kill switches, IST execution windows, risk rules
- Price chart from the 15-minute snapshot history

## Codified trading logic (see `backend/lib/analysis.js`)

- Levels: 21-day swing fib retracements, classic daily pivots, SMA7/SMA30 from 90d OHLC
- Scenario scoring: price position, funding crowding, OI trend, exchange flows, SOPR, fear & greed
- Signals match the desk plan: long 62,200–62,650 (confirm 15m > 62,750) · breakdown short < 62,000 · breakout > 66,000 · invalidation 61,850
- Kill switches: funding >0.010%/h, OI +3% intraday, netflow >+2,000 BTC, SOPR <0.98

## Adjusting cadence

Edit the `cron` line in `.github/workflows/analysis.yml`. Every 15 min costs ~200 Actions minutes/month; every 60 min costs ~50. GitHub may delay scheduled runs by a few minutes to an hour during busy periods — treat the plan as 15–30 minute granularity, not tick-data.

## Running locally

```bash
node backend/lib/index.js        # uses CMC_API_KEY / GLASSNODE_API_KEY env vars if set
python3 -m http.server 8080      # in project root, then open http://localhost:8080/frontend/
```

## Push to GitHub

```bash
cd btc-trade-dashboard
git init && git add . && git commit -m "BTC trade desk dashboard"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## Disclaimer

Automated analysis tool. Not financial advice. Crypto day trading carries substantial risk of loss.