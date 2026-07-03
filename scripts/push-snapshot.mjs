import { loadLocalEnv } from "../src/lib/env.js";
import { fetchClubSnapshot } from "../src/lib/brawlStars.js";
import { appendSnapshot } from "../src/lib/store.js";

loadLocalEnv();

const endpoint =
  process.env.SNAPSHOT_IMPORT_URL || "https://www.the-hive.club/api/snapshot/import";
const secret = process.env.SNAPSHOT_SECRET || process.env.CRON_SECRET;

if (!secret) {
  console.error("SNAPSHOT_SECRET or CRON_SECRET is required to push snapshots.");
  process.exit(1);
}

try {
  const snapshot = await fetchClubSnapshot();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ snapshot })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Snapshot import failed with ${response.status}.`);
  }

  await appendSnapshot(snapshot);

  const top = (payload.leaderboard?.members || [])
    .filter((member) => member.qualified)
    .slice(0, 3)
    .map((member) => `${member.rank}. ${member.name} +${member.gain}`)
    .join(" | ");

  console.log(`Pushed ${snapshot.members.length} members for ${snapshot.club.name}.`);
  console.log(`Imported at ${payload.imported?.capturedAt || snapshot.capturedAt}.`);
  console.log(top ? `Top race: ${top}` : "No qualified members yet.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
