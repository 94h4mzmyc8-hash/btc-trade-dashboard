import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllSources } from "./sources.js";
import { buildPlan } from "./plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");
const SITE_DIR = path.join(ROOT, "site");
const LATEST = path.join(DATA_DIR, "latest.json");
const HISTORY = path.join(DATA_DIR, "history.json");
const MAX_HISTORY = 1000;

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(SITE_DIR, { recursive: true });

  const data = await fetchAllSources();
  const plan = buildPlan(data);

  if (!plan) {
    console.error("NO_PLAN: missing core data sources");
    process.exit(1);
  }

  await writeFile(LATEST, JSON.stringify(plan, null, 2));

  let history = [];
  if (existsSync(HISTORY)) {
    try {
      history = JSON.parse(await readFile(HISTORY, "utf8"));
    } catch {
      history = [];
    }
  }
  history.push({
    t: plan.generatedAt,
    price: plan.price,
    change24h: plan.change24h,
    funding: plan.onchain.funding ? plan.onchain.funding.latest : null,
    oiBtc: plan.onchain.oi ? plan.onchain.oi.oiBtc : null,
    fearGreed: plan.fearGreed ? plan.fearGreed.value : null,
    scenarios: plan.scenarios,
  });
  history = history.slice(-MAX_HISTORY);
  await writeFile(HISTORY, JSON.stringify(history));

  const activeSignals = plan.signals.filter((s) => s.active).map((s) => s.id);
  console.log(JSON.stringify({
    price: plan.price,
    change24hPct: plan.change24h,
    generatedIST: plan.generatedAtIST,
    scenarios: plan.scenarios,
    activeSignals,
    killSwitches: plan.killSwitches.length,
    sources: Object.keys(data).filter((k) => data[k] !== null).length + "/9",
  }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});