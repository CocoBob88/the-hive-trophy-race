import { loadLocalEnv } from "../src/lib/env.js";

loadLocalEnv();

const hours = process.argv[2] || "24";
const baseUrl = process.env.ANALYTICS_SUMMARY_URL || "http://77.42.28.6:8787/summary";
const secret = process.env.ANALYTICS_SECRET || process.env.CRON_SECRET || process.env.SNAPSHOT_SECRET;

if (!secret) {
  console.error("ANALYTICS_SECRET, CRON_SECRET, or SNAPSHOT_SECRET is required.");
  process.exit(1);
}

const url = new URL(baseUrl);
url.searchParams.set("hours", hours);

const response = await fetch(url, {
  headers: {
    "X-Analytics-Secret": secret
  }
});
const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error(payload?.error || `Analytics summary failed with ${response.status}.`);
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
