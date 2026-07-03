import { NextResponse } from "next/server";
import { buildLeaderboardFromSnapshots } from "../../../lib/leaderboard.js";
import { listAvailableMonths, readMonthSnapshots } from "../../../lib/store.js";
import { getMonthKey } from "../../../lib/time.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || getMonthKey();
  const snapshots = await readMonthSnapshots(month);
  const leaderboard = buildLeaderboardFromSnapshots(snapshots);

  return NextResponse.json({
    ...leaderboard,
    availableMonths: await listAvailableMonths()
  }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
