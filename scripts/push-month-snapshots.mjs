import { loadLocalEnv } from "../src/lib/env.js";
import { readMonthSnapshots } from "../src/lib/store.js";
import { getMonthKey } from "../src/lib/time.js";

loadLocalEnv();

const monthKey = process.argv[2] || getMonthKey();
const endpoint =
  process.env.SNAPSHOT_IMPORT_URL || "https://www.the-hive.club/api/snapshot/import";
const secret = process.env.SNAPSHOT_SECRET || process.env.CRON_SECRET;

if (!secret) {
  console.error("SNAPSHOT_SECRET or CRON_SECRET is required to push month snapshots.");
  process.exit(1);
}

const snapshots = await readMonthSnapshots(monthKey);

if (snapshots.length === 0) {
  console.error(`No snapshots found for ${monthKey}.`);
  process.exit(1);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ snapshots })
});

const payload = await response.json().catch(() => null);
if (!response.ok) {
  console.error(payload?.error || `Snapshot import failed with ${response.status}.`);
  process.exit(1);
}

const stats = payload.leaderboard?.stats || {};
console.log(`Pushed ${snapshots.length} snapshots for ${monthKey}.`);
console.log(`Production first snapshot: ${stats.firstSnapshotAt || "unknown"}.`);
console.log(`Production latest snapshot: ${stats.lastUpdated || "unknown"}.`);
console.log(`Production timeline size: ${stats.snapshotCount || 0}.`);
