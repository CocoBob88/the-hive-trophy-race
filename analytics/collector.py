#!/usr/bin/env python3
import hashlib
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

MAX_BODY_BYTES = 64 * 1024
DEFAULT_DB_PATH = "/var/lib/the-hive-analytics/events.sqlite3"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def env(name, default=""):
    return os.environ.get(name, default)


def analytics_secret():
    return env("ANALYTICS_SECRET") or env("CRON_SECRET") or env("SNAPSHOT_SECRET")


def db_path():
    return env("ANALYTICS_DB", DEFAULT_DB_PATH)


def hash_value(value):
    if not value:
        return ""
    salt = env("ANALYTICS_HASH_SALT") or analytics_secret() or "the-hive"
    return hashlib.sha256(f"{salt}:{value}".encode("utf-8")).hexdigest()


def detect_device(user_agent):
    ua = (user_agent or "").lower()
    if "bot" in ua or "crawler" in ua or "spider" in ua:
        return "bot"
    if "mobile" in ua or "android" in ua or "iphone" in ua:
        return "mobile"
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    return "desktop"


def init_db():
    path = db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              received_at TEXT NOT NULL,
              occurred_at TEXT,
              event_name TEXT NOT NULL,
              visitor_hash TEXT,
              session_hash TEXT,
              path TEXT,
              search TEXT,
              title TEXT,
              referrer TEXT,
              timezone TEXT,
              language TEXT,
              viewport_width INTEGER,
              viewport_height INTEGER,
              screen_width INTEGER,
              screen_height INTEGER,
              user_agent TEXT,
              ip_hash TEXT,
              country TEXT,
              region TEXT,
              city TEXT,
              device TEXT,
              properties_json TEXT,
              raw_json TEXT
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_events_visitor_hash ON events(visitor_hash)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_events_session_hash ON events(session_hash)")
        connection.commit()


def clean_text(value, limit=1000):
    if not isinstance(value, str):
        return ""
    return value[:limit]


def clean_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def store_event(payload):
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    viewport = payload.get("viewport") if isinstance(payload.get("viewport"), dict) else {}
    screen = payload.get("screen") if isinstance(payload.get("screen"), dict) else {}
    user_agent = clean_text(meta.get("userAgent"), 1000)
    properties = payload.get("properties") if isinstance(payload.get("properties"), dict) else {}

    row = {
        "received_at": utc_now(),
        "occurred_at": clean_text(payload.get("occurredAt"), 80),
        "event_name": clean_text(payload.get("eventName"), 100),
        "visitor_hash": hash_value(payload.get("visitorId")),
        "session_hash": hash_value(payload.get("sessionId")),
        "path": clean_text(payload.get("path"), 400),
        "search": clean_text(payload.get("search"), 400),
        "title": clean_text(payload.get("title"), 300),
        "referrer": clean_text(payload.get("referrer"), 1000),
        "timezone": clean_text(payload.get("timezone"), 100),
        "language": clean_text(payload.get("language"), 80),
        "viewport_width": clean_int(viewport.get("width")),
        "viewport_height": clean_int(viewport.get("height")),
        "screen_width": clean_int(screen.get("width")),
        "screen_height": clean_int(screen.get("height")),
        "user_agent": user_agent,
        "ip_hash": hash_value(meta.get("ip")),
        "country": clean_text(meta.get("country"), 20),
        "region": clean_text(meta.get("region"), 80),
        "city": clean_text(meta.get("city"), 120),
        "device": detect_device(user_agent),
        "properties_json": json.dumps(properties, separators=(",", ":"), ensure_ascii=False),
        "raw_json": json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
    }

    with sqlite3.connect(db_path()) as connection:
        connection.execute(
            """
            INSERT INTO events (
              received_at, occurred_at, event_name, visitor_hash, session_hash,
              path, search, title, referrer, timezone, language,
              viewport_width, viewport_height, screen_width, screen_height,
              user_agent, ip_hash, country, region, city, device,
              properties_json, raw_json
            ) VALUES (
              :received_at, :occurred_at, :event_name, :visitor_hash, :session_hash,
              :path, :search, :title, :referrer, :timezone, :language,
              :viewport_width, :viewport_height, :screen_width, :screen_height,
              :user_agent, :ip_hash, :country, :region, :city, :device,
              :properties_json, :raw_json
            )
            """,
            row,
        )
        connection.commit()


def rows(query, params=()):
    with sqlite3.connect(db_path()) as connection:
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute(query, params).fetchall()]


def one(query, params=()):
    result = rows(query, params)
    return result[0] if result else {}


def since_clause(query_params):
    hours = clean_int(query_params.get("hours", ["168"])[0])
    if hours <= 0 or hours > 24 * 370:
        hours = 168
    since_epoch = time.time() - hours * 3600
    since = datetime.fromtimestamp(since_epoch, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return hours, since


def summary(query_params):
    hours, since = since_clause(query_params)
    totals = one(
        """
        SELECT
          COUNT(*) AS events,
          COUNT(DISTINCT visitor_hash) AS visitors,
          COUNT(DISTINCT session_hash) AS sessions,
          SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
          SUM(CASE WHEN event_name = 'engagement_ping' THEN CAST(json_extract(properties_json, '$.seconds') AS INTEGER) ELSE 0 END) AS engaged_seconds
        FROM events
        WHERE received_at >= ?
        """,
        (since,),
    )

    return {
        "generatedAt": utc_now(),
        "windowHours": hours,
        "since": since,
        "totals": totals,
        "events": rows(
            """
            SELECT event_name AS name, COUNT(*) AS count
            FROM events
            WHERE received_at >= ?
            GROUP BY event_name
            ORDER BY count DESC
            LIMIT 20
            """,
            (since,),
        ),
        "countries": rows(
            """
            SELECT COALESCE(NULLIF(country, ''), 'unknown') AS country, COUNT(DISTINCT visitor_hash) AS visitors, COUNT(*) AS events
            FROM events
            WHERE received_at >= ?
            GROUP BY COALESCE(NULLIF(country, ''), 'unknown')
            ORDER BY visitors DESC, events DESC
            LIMIT 20
            """,
            (since,),
        ),
        "devices": rows(
            """
            SELECT device, COUNT(DISTINCT visitor_hash) AS visitors, COUNT(*) AS events
            FROM events
            WHERE received_at >= ?
            GROUP BY device
            ORDER BY visitors DESC, events DESC
            """,
            (since,),
        ),
        "topPages": rows(
            """
            SELECT path, COUNT(*) AS page_views, COUNT(DISTINCT visitor_hash) AS visitors
            FROM events
            WHERE received_at >= ? AND event_name = 'page_view'
            GROUP BY path
            ORDER BY page_views DESC
            LIMIT 20
            """,
            (since,),
        ),
        "referrers": rows(
            """
            SELECT COALESCE(NULLIF(referrer, ''), 'direct') AS referrer, COUNT(*) AS page_views
            FROM events
            WHERE received_at >= ? AND event_name = 'page_view'
            GROUP BY COALESCE(NULLIF(referrer, ''), 'direct')
            ORDER BY page_views DESC
            LIMIT 20
            """,
            (since,),
        ),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "TheHiveAnalytics/1.0"

    def send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def is_authorized(self):
        secret = analytics_secret()
        return bool(secret) and self.headers.get("X-Analytics-Secret") == secret

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"ok": True, "time": utc_now()})
            return

        if parsed.path == "/summary":
            if not self.is_authorized():
                self.send_json(401, {"ok": False})
                return
            self.send_json(200, summary(parse_qs(parsed.query)))
            return

        self.send_json(404, {"ok": False})

    def do_POST(self):
        if urlparse(self.path).path != "/collect":
            self.send_json(404, {"ok": False})
            return

        if not self.is_authorized():
            self.send_json(401, {"ok": False})
            return

        length = clean_int(self.headers.get("Content-Length"))
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(413, {"ok": False})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not payload.get("eventName"):
                raise ValueError("eventName is required")
            store_event(payload)
            self.send_json(200, {"ok": True})
        except Exception:
            self.send_json(400, {"ok": False})

    def log_message(self, format, *args):
        return


def main():
    init_db()
    host = env("ANALYTICS_HOST", "0.0.0.0")
    port = clean_int(env("ANALYTICS_PORT", "8787")) or 8787
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"The Hive analytics collector listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
