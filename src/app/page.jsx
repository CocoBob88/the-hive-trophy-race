"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  Crown,
  Flame,
  Medal,
  Search,
  Shield,
  Sparkles,
  Trophy,
  TrendingUp,
  UserPlus,
  Users
} from "lucide-react";

const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

function formatNumber(value) {
  return numberFormatter.format(value || 0);
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

function formatDate(value) {
  if (!value) {
    return "Not captured";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function colorForTag(tag = "") {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) % 360;
  }

  return `hsl(${hash}, 86%, 63%)`;
}

function StatTile({ icon: Icon, label, value, accent = "gold" }) {
  return (
    <div className={`stat-tile stat-tile--${accent}`}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
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

function ProgressChart({ timeline = [], members = [] }) {
  const qualifiedMembers = members
    .filter((member) => member.qualified)
    .sort((a, b) => b.gain - a.gain || b.trophies - a.trophies)
    .slice(0, 10);
  const maxGain = Math.max(1, ...qualifiedMembers.map((member) => member.gain || 0));
  const width = 900;
  const height = 130;
  const padX = 28;
  const padY = 16;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;
  const topLegend = qualifiedMembers.slice(0, 10);

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
        <span>{timeline.length} snapshots</span>
      </div>

      <div className="chart-frame" aria-label="Monthly player trophy gain chart">
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

          {qualifiedMembers.map((member) => {
            const points = timeline
              .map((snapshot, index) => {
                const point = snapshot.members.find((entry) => entry.tag === member.tag);
                return point ? `${xFor(index)},${yFor(point.gain)}` : null;
              })
              .filter(Boolean);

            if (points.length === 0) {
              return null;
            }

            const color = colorForTag(member.tag);
            if (points.length === 1) {
              const [cx, cy] = points[0].split(",").map(Number);
              return (
                <circle key={member.tag} cx={cx} cy={cy} r="4" fill={color}>
                  <title>
                    {member.name} {formatGain(member.gain)}
                  </title>
                </circle>
              );
            }

            return (
              <polyline
                key={member.tag}
                points={points.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={member.rank <= 3 ? 1.4 : 0.7}
                opacity={member.rank <= 6 ? 0.98 : 0.42}
              >
                <title>
                  {member.name} {formatGain(member.gain)}
                </title>
              </polyline>
            );
          })}
        </svg>
      </div>

      <div className="chart-legend">
        {topLegend.map((member) => (
          <span key={member.tag}>
            <i style={{ background: colorForTag(member.tag) }} />
            {member.name}
            <strong>{formatGain(member.gain)}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function MemberCard({ member, maxGain }) {
  const progress = maxGain > 0 ? Math.min(100, Math.round((member.gain / maxGain) * 100)) : 0;
  const brawlers = member.brawlers?.length ? member.brawlers.slice(0, 8) : member.topBrawlers || [];

  return (
    <article className="member-card">
      <div className="member-card__main">
        <RankBadge member={member} />
        <PlayerIcon member={member} />

        <div className="member-card__identity">
          <div className="member-card__title">
            <h3>{member.name}</h3>
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
        <div>
          <span>Trophies</span>
          <strong>{formatNumber(member.trophies)}</strong>
        </div>
        <div>
          <span>Total wins</span>
          <strong>{formatOptionalNumber(member.totalVictories)}</strong>
        </div>
        <div>
          <span>3v3 wins</span>
          <strong>{formatOptionalNumber(member.victories3v3)}</strong>
        </div>
        <div>
          <span>Solo</span>
          <strong>{formatOptionalNumber(member.soloVictories)}</strong>
        </div>
        <div>
          <span>Duo</span>
          <strong>{formatOptionalNumber(member.duoVictories)}</strong>
        </div>
        <div>
          <span>Brawlers</span>
          <strong>
            {formatOptionalNumber(member.brawlerCount)}
            <small>{member.power11Count !== undefined ? ` / ${member.power11Count} P11` : ""}</small>
          </strong>
        </div>
        <div>
          <span>XP level</span>
          <strong>{formatOptionalNumber(member.expLevel)}</strong>
        </div>
      </div>

      <details className="member-details">
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

  async function loadLeaderboard() {
    setLoading(true);
    setError("");

    try {
      const params = selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : "";
      const response = await fetch(`/api/leaderboard${params}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Leaderboard failed to load.");
      }

      setData(payload);
      if (!selectedMonth && payload.month?.key) {
        setSelectedMonth(payload.month.key);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaderboard();
  }, [selectedMonth]);

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

  const topMember = data?.topMember;
  const availableMonths = data?.availableMonths?.length ? data.availableMonths : data?.month?.key ? [data.month.key] : [];

  return (
    <main className="page">
      <header className="hero">
        <img className="hero__image" src="/hive-arena.png" alt="" aria-hidden="true" />
        <div className="hero__shade" aria-hidden="true" />

        <div className="hero__content">
          <div className="title-row">
            <span className="title-logo">
              <img src="/brawl-stars-icon.png" alt="" aria-hidden="true" />
            </span>
            <div>
              <h1>The Hive Trophy Race</h1>
              <small>{data?.club?.tag || "#2L9R0QPLQ"}</small>
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
                  onClick={() => setSelectedMonth(monthKey)}
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
            />
            <StatTile
              icon={Users}
              label="Qualified members"
              value={data?.stats?.qualifiedCount || 0}
              accent="teal"
            />
            <StatTile
              icon={Clock}
              label="First snapshot"
              value={formatDate(data?.stats?.firstSnapshotAt)}
              accent="blue"
            />
            <StatTile
              icon={Clock}
              label="Last update"
              value={formatDate(data?.stats?.lastUpdated)}
              accent="magenta"
            />
            <StatTile
              icon={Medal}
              label="Current leader"
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
          <ProgressChart timeline={data?.timeline || []} members={data?.members || []} />

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
                  onChange={(event) => setQuery(event.target.value)}
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
                {filteredMembers.map((member) => (
                  <MemberCard key={member.tag} member={member} maxGain={maxGain} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
