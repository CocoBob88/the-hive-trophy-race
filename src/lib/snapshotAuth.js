export function isSnapshotAuthorized(request) {
  const secret = process.env.CRON_SECRET || process.env.SNAPSHOT_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return bearer === secret || querySecret === secret;
}
