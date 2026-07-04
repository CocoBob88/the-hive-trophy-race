import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_COLLECTOR_URL = "http://77.42.28.6:8787/collect";
const MAX_PAYLOAD_BYTES = 16 * 1024;

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
}

function getCollectorSecret() {
  return process.env.ANALYTICS_SECRET || process.env.CRON_SECRET || process.env.SNAPSHOT_SECRET || "";
}

function getCollectorUrl() {
  return process.env.ANALYTICS_COLLECTOR_URL || DEFAULT_COLLECTOR_URL;
}

function cleanText(value, limit = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.slice(0, limit);
}

function sanitizePayload(payload) {
  const eventName = cleanText(payload?.eventName, 80).replace(/[^a-zA-Z0-9_.:-]/g, "_");
  if (!eventName) {
    throw new Error("eventName is required.");
  }

  return {
    eventName,
    occurredAt: cleanText(payload?.occurredAt, 40),
    visitorId: cleanText(payload?.visitorId, 120),
    sessionId: cleanText(payload?.sessionId, 120),
    path: cleanText(payload?.path, 300),
    search: cleanText(payload?.search, 300),
    title: cleanText(payload?.title, 200),
    referrer: cleanText(payload?.referrer, 500),
    timezone: cleanText(payload?.timezone, 80),
    language: cleanText(payload?.language, 40),
    viewport: payload?.viewport || {},
    screen: payload?.screen || {},
    properties: payload?.properties && typeof payload.properties === "object" ? payload.properties : {}
  };
}

async function readLimitedJson(request) {
  const text = await request.text();
  if (text.length > MAX_PAYLOAD_BYTES) {
    throw new Error("Analytics payload is too large.");
  }

  return JSON.parse(text || "{}");
}

export async function POST(request) {
  try {
    const secret = getCollectorSecret();
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Analytics is not configured." }, { status: 202 });
    }

    const payload = sanitizePayload(await readLimitedJson(request));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(getCollectorUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Analytics-Secret": secret
        },
        body: JSON.stringify({
          ...payload,
          meta: {
            ip: getClientIp(request),
            userAgent: request.headers.get("user-agent") || "",
            country: request.headers.get("x-vercel-ip-country") || "",
            region: request.headers.get("x-vercel-ip-country-region") || "",
            city: request.headers.get("x-vercel-ip-city") || "",
            deploymentRegion: request.headers.get("x-vercel-id") || ""
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return NextResponse.json({ ok: false }, { status: 202 });
      }
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
