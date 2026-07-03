import { NextResponse } from "next/server";
import { fetchClubSnapshot } from "../../../lib/brawlStars.js";
import { buildLeaderboardFromSnapshots } from "../../../lib/leaderboard.js";
import { appendSnapshot } from "../../../lib/store.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET || process.env.SNAPSHOT_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}

async function capture(request) {
  if (!isAuthorized(request)) {
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
