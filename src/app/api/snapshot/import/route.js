import { NextResponse } from "next/server";
import { buildLeaderboardFromSnapshots } from "../../../../lib/leaderboard.js";
import { isSnapshotAuthorized } from "../../../../lib/snapshotAuth.js";
import { appendSnapshots } from "../../../../lib/store.js";

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
    const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [body.snapshot || body];
    snapshots.forEach(validateSnapshot);

    const document = await appendSnapshots(snapshots);
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots.at(-1);

    return NextResponse.json({
      imported: {
        count: snapshots.length,
        firstCapturedAt: firstSnapshot.capturedAt,
        lastCapturedAt: lastSnapshot.capturedAt,
        monthKey: lastSnapshot.monthKey,
        club: lastSnapshot.club,
        memberCount: lastSnapshot.members.length
      },
      leaderboard: buildLeaderboardFromSnapshots(document.snapshots)
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
