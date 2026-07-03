import { NextResponse } from "next/server";
import { fetchClubSnapshot } from "../../../lib/brawlStars.js";
import { buildLeaderboardFromSnapshots } from "../../../lib/leaderboard.js";
import { isSnapshotAuthorized } from "../../../lib/snapshotAuth.js";
import { appendSnapshot } from "../../../lib/store.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function capture(request) {
  if (!isSnapshotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await fetchClubSnapshot();
  const document = await appendSnapshot(snapshot);

  return NextResponse.json({
    captured: snapshot,
    leaderboard: buildLeaderboardFromSnapshots(document.snapshots)
  });
}

export async function POST(request) {
  try {
    return await capture(request);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function GET(request) {
  try {
    return await capture(request);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
