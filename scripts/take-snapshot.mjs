import { loadLocalEnv } from "../src/lib/env.js";
import { fetchClubSnapshot } from "../src/lib/brawlStars.js";
import { buildLeaderboardFromSnapshots } from "../src/lib/leaderboard.js";
import { appendSnapshot } from "../src/lib/store.js";

loadLocalEnv();

try {
  const snapshot = await fetchClubSnapshot();
  const document = await appendSnapshot(snapshot);
  const leaderboard = buildLeaderboardFromSnapshots(document.snapshots, {
    mode: "live"
  });

  const top = leaderboard.members
    .filter((member) => member.qualified)
    .slice(0, 3)
    .map((member) => `${member.rank}. ${member.name} +${member.gain}`)
    .join(" | ");

  console.log(`Captured ${snapshot.members.length} members for ${snapshot.club.name}.`);
  console.log(`Month: ${leaderboard.month.label}`);
  console.log(`Snapshots this month: ${document.snapshots.length}`);
  console.log(top ? `Top race: ${top}` : "No qualified members yet.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
