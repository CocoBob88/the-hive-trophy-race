import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_SUMMARY_URL = "http://77.42.28.6:8787/summary";

function getDashboardSecret() {
  return process.env.ANALYTICS_DASHBOARD_PASSWORD || process.env.CRON_SECRET || process.env.SNAPSHOT_SECRET || "";
}

function getCollectorSecret() {
  return process.env.ANALYTICS_SECRET || process.env.CRON_SECRET || process.env.SNAPSHOT_SECRET || "";
}

function getSummaryUrl() {
  return process.env.ANALYTICS_SUMMARY_URL || DEFAULT_SUMMARY_URL;
}

function getBearer(request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

export async function GET(request) {
  const dashboardSecret = getDashboardSecret();
  const collectorSecret = getCollectorSecret();

  if (!dashboardSecret || !collectorSecret || getBearer(request) !== dashboardSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(getSummaryUrl());
  const requestUrl = new URL(request.url);
  url.searchParams.set("hours", requestUrl.searchParams.get("hours") || "24");

  try {
    const response = await fetch(url, {
      headers: {
        "X-Analytics-Secret": collectorSecret
      },
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: payload?.error || "Analytics summary failed." }, { status: 502 });
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
