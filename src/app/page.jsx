"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  BadgeCheck,
  Clock,
  Cog,
  Crown,
  Flame,
  Medal,
  Search,
  Shield,
  Sparkles,
  Star,
  Trophy,
  TrendingUp,
  UserPlus,
  Wrench,
  Zap
} from "lucide-react";

const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const AUTO_REFRESH_RETRY_MS = 30 * 1000;
const CHART_COLORS = [
  "#48d7ff",
  "#ff4f7b",
  "#4f8dff",
  "#bd5cff",
  "#ffad57",
  "#5ee8b5",
  "#ffd447",
  "#ff66d8",
  "#8af06c",
  "#7c7dff",
  "#ff7a45",
  "#39d2c8",
  "#e8f06c",
  "#f05f96",
  "#78a8ff",
  "#d06cff",
  "#70e0ff",
  "#ffa7cf",
  "#a6ff8a",
  "#ffcf70",
  "#70ffd9",
  "#b8a2ff",
  "#ff8d8d",
  "#9de1ff",
  "#d8ff6f",
  "#ffb36f",
  "#6fff9f",
  "#c66fff",
  "#6f9fff",
  "#ff6fb4"
];
const ANALYTICS_VISITOR_KEY = "the-hive-visitor-id";
const ANALYTICS_SESSION_KEY = "the-hive-session-id";
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

function createAnalyticsId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getStoredAnalyticsId(key, storageName = "localStorage") {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const storage = window[storageName] || window.localStorage;
    const existing = storage.getItem(key);
    if (existing) {
      return existing;
    }

    const id = createAnalyticsId();
    storage.setItem(key, id);
    return id;
  } catch {
    return createAnalyticsId();
  }
}

function trackRaceEvent(eventName, properties = {}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload = {
      eventName,
      properties,
      occurredAt: new Date().toISOString(),
      visitorId: getStoredAnalyticsId(ANALYTICS_VISITOR_KEY),
      sessionId: getStoredAnalyticsId(ANALYTICS_SESSION_KEY, "sessionStorage"),
      path: window.location.pathname,
      search: window.location.search,
      title: document.title,
      referrer: document.referrer || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      language: navigator.language || "",
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      screen: {
        width: window.screen?.width || 0,
        height: window.screen?.height || 0
      }
    };
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/analytics/collect",
        new Blob([body], { type: "application/json" })
      );
      if (sent) {
        return;
      }
    }

    fetch("/api/analytics/collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body,
      keepalive: true
    }).catch(() => {});
  } catch {
    // Analytics should never interfere with the leaderboard UI.
  }
}

function gainBucket(value) {
  const gain = Math.abs(value || 0);
  if (gain >= 1000) {
    return "1000+";
  }

  if (gain >= 500) {
    return "500-999";
  }

  if (gain >= 250) {
    return "250-499";
  }

  if (gain >= 100) {
    return "100-249";
  }

  if (gain > 0) {
    return "1-99";
  }

  return "0";
}

function formatNumber(value) {
  return numberFormatter.format(value || 0);
}

function numericStat(member, key) {
  const value = Number(member?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function formatOptionalNumber(value) {
  return value === null || value === undefined ? "N/A" : numberFormatter.format(value);
}

function formatCompact(value) {
  return compactFormatter.format(value || 0);
}

function formatGain(value) {
  const gain = value || 0;
  return gain > 0 ? `+${formatNumber(gain)}` : "0";
}

function formatSignedGain(value) {
  const gain = value || 0;
  if (gain > 0) {
    return `+${formatNumber(gain)}`;
  }

  if (gain < 0) {
    return `-${formatNumber(Math.abs(gain))}`;
  }

  return "0";
}

function formatDate(value) {
  if (!value) {
    return "Not captured";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(new Date(value));
}

function getNextUpdateAt(lastUpdated) {
  if (!lastUpdated) {
    return null;
  }

  const timestamp = new Date(lastUpdated).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor(timestamp / UPDATE_INTERVAL_MS) * UPDATE_INTERVAL_MS + UPDATE_INTERVAL_MS;
}

function formatCountdown(nextUpdateAt, now) {
  if (!nextUpdateAt) {
    return "Waiting";
  }

  const remaining = Math.max(0, nextUpdateAt - now);
  if (remaining === 0) {
    return "Checking";
  }

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getMonthBoundsUtc(monthKey) {
  if (!monthKey) {
    return null;
  }

  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    return null;
  }

  return {
    startsAt: Date.UTC(year, month - 1, 1, 0, 0, 0, 0),
    endsAt: Date.UTC(year, month, 1, 0, 0, 0, 0)
  };
}

function formatRaceTimeLeft(endsAt, now) {
  const remaining = Math.max(0, endsAt - now);
  if (remaining === 0) {
    return "Complete";
  }

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (remaining > day) {
    return `${Math.ceil(remaining / day)} days left`;
  }

  if (remaining > hour) {
    return `${Math.ceil(remaining / hour)} hours left`;
  }

  return `${Math.max(1, Math.ceil(remaining / minute))} min left`;
}

function formatClubRankLine(club) {
  const ranks = [];
  if (club?.globalRank) {
    ranks.push(`Global #${formatNumber(club.globalRank)}`);
  }

  if (club?.countryRank) {
    const countryLabel = club.countryRankLabel || club.countryCode?.toUpperCase() || "Country";
    ranks.push(`${countryLabel} #${formatNumber(club.countryRank)}`);
  }

  return ranks.join(" · ");
}

function RaceStatus({ month, topMember, now }) {
  const bounds = getMonthBoundsUtc(month?.key);
  const monthComplete = Boolean(bounds && now >= bounds.endsAt);

  if (monthComplete) {
    return (
      <span className="title-race-chip title-race-chip--winner">
        <Crown size={16} aria-hidden="true" />
        <span>{month?.label || "Month"} winner</span>
        <strong>{topMember?.name || "Not set"}</strong>
        <em>{formatGain(topMember?.gain)}</em>
      </span>
    );
  }

  return (
    <span className="title-race-chip">
      <Clock size={16} aria-hidden="true" />
      <strong>{bounds ? formatRaceTimeLeft(bounds.endsAt, now) : "Loading"}</strong>
    </span>
  );
}

function colorForTag(tag = "") {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) % 360;
  }

  return `hsl(${hash}, 86%, 63%)`;
}

function colorForMember(member, index) {
  return CHART_COLORS[index] || colorForTag(member.tag);
}

function StatTile({ icon: Icon, label, value, hint = "", accent = "gold" }) {
  return (
    <div className={`stat-tile stat-tile--${accent}`}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function addBadge(badgesByTag, tag, badge) {
  const badges = badgesByTag.get(tag);
  if (badges) {
    badges.push(badge);
  }
}

function rankedMembers(members, key, limit = 3) {
  return [...members]
    .filter((member) => numericStat(member, key) > 0)
    .sort((a, b) => {
      const statDelta = numericStat(b, key) - numericStat(a, key);
      if (statDelta !== 0) {
        return statDelta;
      }

      return numericStat(b, "trophies") - numericStat(a, "trophies");
    })
    .slice(0, limit);
}

function buildMemberBadges(members = []) {
  const qualifiedMembers = members.filter((member) => member.qualified);
  const badgesByTag = new Map(qualifiedMembers.map((member) => [member.tag, []]));
  const maxBrawlers = Math.max(0, ...qualifiedMembers.map((member) => numericStat(member, "brawlerCount")));

  for (const member of qualifiedMembers) {
    const brawlerCount = numericStat(member, "brawlerCount");
    const power11Count = numericStat(member, "power11Count");

    if (maxBrawlers > 0 && brawlerCount === maxBrawlers) {
      addBadge(badgesByTag, member.tag, {
        id: "max-brawlers",
        label: `Max brawlers (${formatNumber(brawlerCount)})`,
        shortLabel: "MAX",
        asset: "brawler",
        tone: "gold"
      });
    }

    if (brawlerCount > 0 && power11Count >= brawlerCount) {
      addBadge(badgesByTag, member.tag, {
        id: "full-p11",
        label: `Fully Power 11 (${formatNumber(power11Count)})`,
        shortLabel: "P11",
        icon: BadgeCheck,
        tone: "teal"
      });
    }
  }

  [
    { key: "gadgetCount", prefix: "G", label: "gadgets", icon: Wrench, tone: "blue" },
    { key: "starPowerCount", prefix: "SP", label: "star powers", icon: Star, tone: "magenta" },
    { key: "gearCount", prefix: "Gear", label: "gears", icon: Cog, tone: "green" },
    { key: "expPoints", prefix: "XP", label: "XP points", icon: Zap, tone: "red" }
  ].forEach((config) => {
    rankedMembers(qualifiedMembers, config.key).forEach((member, index) => {
      const rank = index + 1;
      addBadge(badgesByTag, member.tag, {
        id: `${config.key}-${rank}`,
        label: `#${rank} ${config.label}: ${formatNumber(numericStat(member, config.key))}`,
        shortLabel: `#${rank}`,
        prefix: config.prefix,
        icon: config.icon,
        tone: config.tone
      });
    });
  });

  return badgesByTag;
}

function MemberBadge({ badge }) {
  const Icon = badge.icon;

  return (
    <span className={`member-badge member-badge--${badge.tone}`} title={badge.label} aria-label={badge.label}>
      {badge.asset === "brawler" ? (
        <img src="/brawl-stars-icon.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
      ) : (
        <Icon size={13} aria-hidden="true" />
      )}
      {badge.prefix ? <em>{badge.prefix}</em> : null}
      <strong>{badge.shortLabel}</strong>
    </span>
  );
}

function MemberBadges({ badges = [] }) {
  if (!badges.length) {
    return null;
  }

  return (
    <div className="member-badges" aria-label="Member badges">
      {badges.map((badge) => (
        <MemberBadge key={badge.id} badge={badge} />
      ))}
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value ?? "N/A"}</dd>
    </div>
  );
}

function PlayerIcon({ member }) {
  const initial = member.name?.trim()?.[0]?.toUpperCase() || "?";

  return (
    <span className="player-icon">
      <span>{initial}</span>
      {member.iconId ? (
        <img
          src={`https://cdn.brawlify.com/profile-icons/regular/${member.iconId}.png`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}

function RankBadge({ member }) {
  if (member.rank === 1) {
    return (
      <div className="rank-badge rank-badge--first" title="First place">
        <Crown size={21} aria-hidden="true" />
      </div>
    );
  }

  return <div className="rank-badge">#{member.rank}</div>;
}

function ProgressChart({ timeline = [], members = [], firstSnapshotAt, nextUpdateAt, now, isLatestMonth, monthKey }) {
  const [hoveredTag, setHoveredTag] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const qualifiedMembers = members
    .filter((member) => member.qualified)
    .sort((a, b) => b.gain - a.gain || b.trophies - a.trophies);
  const maxGain = Math.max(1, ...qualifiedMembers.map((member) => member.gain || 0));
  const width = 900;
  const height = 130;
  const padX = 28;
  const padY = 16;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;
  const topLegend = qualifiedMembers;
  const chartStartedAt = firstSnapshotAt || timeline[0]?.capturedAt;
  const isUpdateDue = Boolean(isLatestMonth && nextUpdateAt && now >= nextUpdateAt);
  const activeTag = hoveredTag || selectedTag;
  const activeMember = qualifiedMembers.find((member) => member.tag === activeTag);

  function toggleSelectedMember(member) {
    const willSelect = selectedTag !== member.tag;
    setSelectedTag(willSelect ? member.tag : "");
    trackRaceEvent("chart_member_toggled", {
      month: monthKey || "unknown",
      rank: member.rank || 0,
      selected: willSelect,
      gain_bucket: gainBucket(member.gain)
    });
  }

  function xFor(index) {
    if (timeline.length <= 1) {
      return width / 2;
    }

    return padX + (index * usableWidth) / (timeline.length - 1);
  }

  function yFor(gain) {
    return height - padY - (Math.max(0, gain) / maxGain) * usableHeight;
  }

  return (
    <section className="progress-panel">
      <div className="panel-heading">
        <div>
          <div className="section-kicker">
            <TrendingUp size={18} aria-hidden="true" />
            Trophy progress
          </div>
        </div>
        <div className={`chart-cadence${isUpdateDue ? " is-due" : ""}`} aria-live="polite">
          <Clock size={15} aria-hidden="true" />
          <span>{isLatestMonth ? "Next update" : "History"}</span>
          <strong>{isLatestMonth ? formatCountdown(nextUpdateAt, now) : "Locked"}</strong>
        </div>
      </div>

      <div className="chart-frame" aria-label="Monthly player trophy gain chart">
        {chartStartedAt ? <div className="chart-start-label">Started {formatDate(chartStartedAt)}</div> : null}
        {activeMember ? (
          <div className="chart-active-label">
            <span>{activeMember.name}</span>
            <strong>{formatGain(activeMember.gain)}</strong>
          </div>
        ) : null}
        <svg viewBox={`0 0 ${width} ${height}`} role="img">
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} />
          <line x1={padX} y1={padY} x2={padX} y2={height - padY} />
          {[0.25, 0.5, 0.75, 1].map((tick) => (
            <line
              key={tick}
              className="chart-grid"
              x1={padX}
              y1={height - padY - tick * usableHeight}
              x2={width - padX}
              y2={height - padY - tick * usableHeight}
            />
          ))}

          {qualifiedMembers.map((member, memberIndex) => {
            const points = timeline
              .map((snapshot, index) => {
                const point = snapshot.members.find((entry) => entry.tag === member.tag);
                return point ? `${xFor(index)},${yFor(point.gain)}` : null;
              })
              .filter(Boolean);

            if (points.length === 0) {
              return null;
            }

            const color = colorForMember(member, memberIndex);
            const isActive = activeTag === member.tag;
            const isMuted = Boolean(activeTag && !isActive);
            const interactiveProps = {
              onPointerEnter: () => setHoveredTag(member.tag),
              onPointerLeave: () => setHoveredTag(""),
              onFocus: () => setHoveredTag(member.tag),
              onBlur: () => setHoveredTag(""),
              onClick: () => toggleSelectedMember(member),
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleSelectedMember(member);
                }
              }
            };

            if (points.length === 1) {
              const [cx, cy] = points[0].split(",").map(Number);
              return (
                <g key={member.tag} className={`chart-series${isActive ? " is-active" : ""}${isMuted ? " is-muted" : ""}`}>
                  <circle
                    className="chart-point"
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill={color}
                    style={{ "--line-delay": `${Math.min(memberIndex * 45, 900)}ms`, color }}
                  >
                    <title>
                      {member.name} {formatGain(member.gain)}
                    </title>
                  </circle>
                  <circle
                    className="chart-hit-point"
                    cx={cx}
                    cy={cy}
                    r="13"
                    tabIndex={0}
                    role="button"
                    aria-label={`${member.name} ${formatGain(member.gain)}`}
                    {...interactiveProps}
                  />
                </g>
              );
            }

            return (
              <g key={member.tag} className={`chart-series${isActive ? " is-active" : ""}${isMuted ? " is-muted" : ""}`}>
                <polyline
                  className="chart-line"
                  points={points.join(" ")}
                  fill="none"
                  pathLength="1"
                  stroke={color}
                  strokeWidth={member.rank <= 3 ? 1.4 : 0.7}
                  opacity={member.rank <= 6 ? 0.98 : 0.42}
                  style={{ "--line-delay": `${Math.min(memberIndex * 45, 900)}ms`, color }}
                >
                  <title>
                    {member.name} {formatGain(member.gain)}
                  </title>
                </polyline>
                <polyline
                  className="chart-hit-line"
                  points={points.join(" ")}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.001)"
                  strokeWidth="18"
                  tabIndex={0}
                  role="button"
                  aria-label={`${member.name} ${formatGain(member.gain)}`}
                  {...interactiveProps}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="chart-legend">
        {topLegend.map((member, memberIndex) => (
          <button
            key={member.tag}
            type="button"
            className={activeTag === member.tag ? "is-active" : ""}
            onPointerEnter={() => setHoveredTag(member.tag)}
            onPointerLeave={() => setHoveredTag("")}
            onFocus={() => setHoveredTag(member.tag)}
            onBlur={() => setHoveredTag("")}
            onClick={() => toggleSelectedMember(member)}
          >
            <i style={{ background: colorForMember(member, memberIndex) }} />
            {member.name}
            <strong>{formatGain(member.gain)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function MemberCard({ member, maxGain, badges = [], style, monthKey }) {
  const progress = maxGain > 0 ? Math.min(100, Math.round((member.gain / maxGain) * 100)) : 0;
  const brawlers = member.topBrawlers?.length ? member.topBrawlers : member.brawlers || [];

  return (
    <article className="member-card" style={style}>
      <div className="member-card__main">
        <RankBadge member={member} />
        <PlayerIcon member={member} />

        <div className="member-card__identity">
          <div className="member-card__title">
            <div className="member-card__name-line">
              <h3>{member.name}</h3>
              <MemberBadges badges={badges} />
            </div>
            <span>{member.tag}</span>
          </div>
          <div className="member-card__meta">
            <span className="meta-pill meta-pill--role">
              <Shield size={14} aria-hidden="true" />
              {member.roleLabel}
            </span>
            <span className="meta-pill meta-pill--active">
              <UserPlus size={14} aria-hidden="true" />
              Qualified
            </span>
          </div>
        </div>

        <div className="member-card__score">
          <span>Monthly gain</span>
          <strong>{formatGain(member.gain)}</strong>
        </div>
      </div>

      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="member-card__stats">
        <div className="member-stat member-stat--trophies">
          <span>Trophies</span>
          <strong>{formatNumber(member.trophies)}</strong>
        </div>
        <div className="member-stat member-stat--wins">
          <span>Total wins</span>
          <strong>{formatOptionalNumber(member.totalVictories)}</strong>
        </div>
        <div className="member-stat member-stat--3v3">
          <span>3v3 wins</span>
          <strong>{formatOptionalNumber(member.victories3v3)}</strong>
        </div>
        <div className="member-stat member-stat--solo">
          <span>Solo</span>
          <strong>{formatOptionalNumber(member.soloVictories)}</strong>
        </div>
        <div className="member-stat member-stat--duo">
          <span>Duo</span>
          <strong>{formatOptionalNumber(member.duoVictories)}</strong>
        </div>
        <div className="member-stat member-stat--brawlers">
          <span>Brawlers</span>
          <strong>
            {formatOptionalNumber(member.brawlerCount)}
            <small>{member.power11Count !== undefined ? ` / ${member.power11Count} P11` : ""}</small>
          </strong>
        </div>
        <div className="member-stat member-stat--xp">
          <span>XP level</span>
          <strong>{formatOptionalNumber(member.expLevel)}</strong>
        </div>
      </div>

      <details
        className="member-details"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            trackRaceEvent("member_details_opened", {
              month: monthKey || "unknown",
              rank: member.rank || 0,
              role: member.roleLabel || "unknown",
              gain_bucket: gainBucket(member.gain)
            });
          }
        }}
      >
        <summary>
          <Sparkles size={16} aria-hidden="true" />
          More details
        </summary>

        <dl className="detail-grid">
          <DetailItem label="Baseline trophies" value={formatNumber(member.baselineTrophies)} />
          <DetailItem label="Race baseline" value={formatDate(member.baselineAt)} />
          <DetailItem label="XP points" value={formatOptionalNumber(member.expPoints)} />
          <DetailItem label="Profile icon ID" value={member.iconId || "N/A"} />
          <DetailItem label="Power 11 brawlers" value={formatOptionalNumber(member.power11Count)} />
          <DetailItem label="Gadgets" value={formatOptionalNumber(member.gadgetCount)} />
          <DetailItem label="Star powers" value={formatOptionalNumber(member.starPowerCount)} />
          <DetailItem label="Gears" value={formatOptionalNumber(member.gearCount)} />
          <DetailItem label="Last update" value={formatDate(member.currentAt)} />
        </dl>

        {brawlers.length ? (
          <div className="brawler-strip">
            {brawlers.map((brawler) => (
              <span key={`${member.tag}-${brawler.id}`}>
                <strong>{brawler.name}</strong>
                <small>
                  {formatNumber(brawler.trophies)} trophies / P{brawler.power || "?"} / R
                  {brawler.rank || "?"}
                </small>
              </span>
            ))}
          </div>
        ) : null}
      </details>
    </article>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState(0);
  const searchTrackedRef = useRef(false);
  const dataTrackedRef = useRef("");
  const pageViewTrackedRef = useRef(false);

  const loadLeaderboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const params = selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : "";
      const response = await fetch(`/api/leaderboard${params}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Leaderboard failed to load.");
      }

      setData(payload);
      setError("");
      if (!selectedMonth && payload.month?.key) {
        setSelectedMonth(payload.month.key);
      }
    } catch (loadError) {
      trackRaceEvent("leaderboard_load_error", {
        month: selectedMonth || "latest",
        silent
      });
      if (!silent) {
        setError(loadError.message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const nextUpdateAt = useMemo(
    () => getNextUpdateAt(data?.stats?.lastUpdated),
    [data?.stats?.lastUpdated]
  );
  const latestMonthKey = data?.availableMonths?.[0] || data?.month?.key || "";
  const isLatestMonth = !data?.month?.key || data.month.key === latestMonthKey;

  useEffect(() => {
    if (!data?.month?.key || dataTrackedRef.current === data.month.key) {
      return;
    }

    dataTrackedRef.current = data.month.key;
    trackRaceEvent("leaderboard_ready", {
      month: data.month.key,
      members: data.members?.length || 0,
      timeline_points: data.timeline?.length || 0,
      has_global_rank: Boolean(data.club?.globalRank),
      has_country_rank: Boolean(data.club?.countryRank)
    });
  }, [data]);

  useEffect(() => {
    if (pageViewTrackedRef.current || !data?.month?.key) {
      return;
    }

    pageViewTrackedRef.current = true;
    trackRaceEvent("page_view", {
      month: data.month.key,
      latest: isLatestMonth
    });
  }, [data?.month?.key, isLatestMonth]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!data?.month?.key) {
      return undefined;
    }

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      trackRaceEvent("engagement_ping", {
        month: data.month.key,
        seconds: HEARTBEAT_INTERVAL_MS / 1000
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(heartbeat);
  }, [data?.month?.key]);

  useEffect(() => {
    if (!data || !isLatestMonth || !nextUpdateAt || now < nextUpdateAt || loading) {
      return;
    }

    if (now - lastAutoRefreshAt < AUTO_REFRESH_RETRY_MS) {
      return;
    }

    setLastAutoRefreshAt(now);
    loadLeaderboard({ silent: true });
  }, [data, isLatestMonth, lastAutoRefreshAt, loadLeaderboard, loading, nextUpdateAt, now]);

  const filteredMembers = useMemo(() => {
    const members = (data?.members || []).filter((member) => member.qualified);
    const normalizedQuery = query.trim().toLowerCase();

    return members.filter((member) => {
      if (!normalizedQuery) {
        return true;
      }

      return [member.name, member.tag, member.roleLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [data, query]);

  const maxGain = useMemo(
    () => Math.max(0, ...(data?.members || []).map((member) => member.gain || 0)),
    [data]
  );
  const memberBadges = useMemo(
    () => buildMemberBadges(data?.members || []),
    [data?.members]
  );

  const topMember = data?.topMember;
  const availableMonths = data?.availableMonths?.length ? data.availableMonths : data?.month?.key ? [data.month.key] : [];
  const selectedMonthComplete = Boolean(getMonthBoundsUtc(data?.month?.key)?.endsAt <= now);
  const clubRankLine = formatClubRankLine(data?.club);

  function handleSearchChange(event) {
    const nextQuery = event.target.value;
    setQuery(nextQuery);

    if (!searchTrackedRef.current && nextQuery.trim()) {
      searchTrackedRef.current = true;
      trackRaceEvent("member_search_used", {
        month: data?.month?.key || "unknown"
      });
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <img
          className="hero__image"
          src="/hive-arena.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
        />
        <div className="hero__shade" aria-hidden="true" />

        <div className="hero__content">
          <div className="title-row">
            <span className="title-logo">
              <img src="/brawl-stars-icon.png" alt="" aria-hidden="true" />
            </span>
            <div className="title-copy">
              <div className="title-heading">
                <h1>The Hive Trophy Race</h1>
                <RaceStatus month={data?.month} topMember={topMember} now={now} />
              </div>
              <small>
                {data?.club?.tag || "#2L9R0QPLQ"}
                {clubRankLine ? ` · ${clubRankLine}` : ""}
              </small>
            </div>
          </div>

          <div className="month-row">
            <div className="hero__eyebrow">
              <CalendarDays size={18} aria-hidden="true" />
              Month
            </div>
            <div className="month-strip" aria-label="Competition month">
              {availableMonths.map((monthKey) => (
                <button
                  key={monthKey}
                  type="button"
                  className={monthKey === data?.month?.key ? "is-active" : ""}
                  onClick={() => {
                    if (monthKey !== data?.month?.key) {
                      trackRaceEvent("month_selected", {
                        month: monthKey,
                        latest: monthKey === latestMonthKey
                      });
                    }
                    setSelectedMonth(monthKey);
                  }}
                >
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC"
                  }).format(new Date(`${monthKey}-01T00:00:00.000Z`))}
                </button>
              ))}
            </div>
          </div>

          <div className="hero__stats">
            <StatTile
              icon={Trophy}
              label="Club trophies"
              value={formatCompact(data?.stats?.clubTrophies)}
              hint={`${formatSignedGain(data?.stats?.clubTrophyGain)} this month`}
            />
            <StatTile
              icon={Medal}
              label={selectedMonthComplete ? "Winner" : "Current leader"}
              value={topMember?.name || "Not set"}
              accent="gold"
            />
            <StatTile
              icon={Flame}
              label="Top gain"
              value={formatGain(data?.stats?.topGain)}
              accent="red"
            />
          </div>
        </div>
      </header>

      <section className="race-band">
        <div className="race-grid">
          <ProgressChart
            timeline={data?.timeline || []}
            members={data?.members || []}
            firstSnapshotAt={data?.stats?.firstSnapshotAt}
            nextUpdateAt={nextUpdateAt}
            now={now}
            isLatestMonth={isLatestMonth}
            monthKey={data?.month?.key}
          />

          <div className="leaderboard-panel">
            <div className="leaderboard-heading">
              <div>
                <div className="section-kicker">
                  <Crown size={18} aria-hidden="true" />
                  Qualified leaderboard
                </div>
                <h2>Monthly climb</h2>
              </div>

              <label className="search-box">
                <Search size={18} aria-hidden="true" />
                <input
                  value={query}
                  onChange={handleSearchChange}
                  placeholder="Search member"
                />
              </label>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            {loading && !data ? (
              <div className="loading-stack">
                <span />
                <span />
                <span />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="empty-state">
                <Trophy size={26} aria-hidden="true" />
                <strong>No live member rows yet</strong>
                <span>Run a snapshot to load real club data from the Brawl Stars API.</span>
              </div>
            ) : (
              <div className="member-list">
                {filteredMembers.map((member, index) => (
                  <MemberCard
                    key={member.tag}
                    member={member}
                    maxGain={maxGain}
                    badges={memberBadges.get(member.tag)}
                    monthKey={data?.month?.key}
                    style={{
                      "--row-delay": `${Math.min(index * 36, 520)}ms`,
                      "--progress-delay": `${160 + Math.min(index * 24, 340)}ms`
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
