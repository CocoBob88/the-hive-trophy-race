import { NextResponse } from "next/server";
import { buildLeaderboardFromSnapshots } from "../../../../lib/leaderboard.js";
import { isSnapshotAuthorized } from "../../../../lib/snapshotAuth.js";
import { appendSnapshot } from "../../../../lib/store.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Snapshot payload is required.");
  }

  if (!snapshot.capturedAt || !snapshot.club || !Array.isArray(snapshot.members)) {
    throw new Error("Snapshot payload must include capturedAt, club, and members.");
  }
}

export async function POST(request) {
  try {
    if (!isSnapshotAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const snapshot = body.snapshot || body;
    validateSnapshot(snapshot);

    const document = await appendSnapshot(snapshot);

    return NextResponse.json({
      imported: {
        capturedAt: snapshot.capturedAt,
        monthKey: snapshot.monthKey,
        club: snapshot.club,
        memberCount: snapshot.members.length
      },
      leaderboard: buildLeaderboardFromSnapshots(document.snapshots)
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
