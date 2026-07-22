import { getCompetitionConfig } from "./config.js";
import { getMonthKey, getMonthLabel } from "./time.js";

const DETAIL_BRAWLER_LIMIT = 8;
const TIMELINE_POINT_LIMIT = 192;
const ACTIVE_INTERVAL_MAX_MINUTES = 35;

function sortByGain(a, b) {
  if (b.gain !== a.gain) {
    return b.gain - a.gain;
  }

  return b.trophies - a.trophies;
}

function roleLabel(role = "member") {
  return role
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function compactBrawlers(brawlers = [], limit = DETAIL_BRAWLER_LIMIT) {
  return brawlers.slice(0, limit).map((brawler) => ({
    id: brawler.id,
    name: brawler.name,
    power: brawler.power,
    rank: brawler.rank,
    trophies: brawler.trophies,
    highestTrophies: brawler.highestTrophies
  }));
}

function sampleSnapshots(snapshots, limit = TIMELINE_POINT_LIMIT) {
  if (snapshots.length <= limit) {
    return snapshots;
  }

  const lastIndex = snapshots.length - 1;
  const selectedIndexes = new Set([0, lastIndex]);
  for (let index = 1; index < limit - 1; index += 1) {
    selectedIndexes.add(Math.round((index * lastIndex) / (limit - 1)));
  }

  return [...selectedIndexes].sort((a, b) => a - b).map((index) => snapshots[index]);
}

function applySnapshotToState(states, snapshot) {
  const present = new Map(snapshot.members.map((member) => [member.tag, member]));

  for (const state of states.values()) {
    if (state.active && !present.has(state.tag)) {
      state.active = false;
      state.disqualified = true;
      state.leftAt = snapshot.capturedAt;
      state.leaveCount = (state.leaveCount || 0) + 1;
    }
  }

  for (const member of present.values()) {
    const existing = states.get(member.tag);

    if (!existing || !existing.active) {
      states.set(member.tag, {
        tag: member.tag,
        name: member.name,
        role: member.role,
        active: true,
        disqualified: false,
        baselineTrophies: member.trophies || 0,
        baselineAt: snapshot.capturedAt,
        joinedAt: snapshot.capturedAt,
        currentTrophies: member.trophies || 0,
        currentAt: snapshot.capturedAt,
        lastMember: member,
        leaveCount: existing?.leaveCount || 0,
        rejoinCount: existing ? (existing.rejoinCount || 0) + 1 : 0,
        previousDisqualifiedGain:
          (existing?.previousDisqualifiedGain || 0) +
          Math.max(0, (existing?.currentTrophies || 0) - (existing?.baselineTrophies || 0))
      });
      continue;
    }

    existing.name = member.name;
    existing.role = member.role;
    existing.currentTrophies = member.trophies || 0;
    existing.currentAt = snapshot.capturedAt;
    existing.lastMember = member;
  }
}

function createActivityStat(member) {
  return {
    tag: member.tag,
    name: member.name,
    activeMinutes: 0,
    activeIntervals: 0,
    activeDays: new Set(),
    activeNetGain: 0,
    activePositiveGain: 0,
    activeLosses: 0,
    bestActiveIntervalGain: 0,
    firstActiveAt: null,
    lastActiveAt: null
  };
}

function getSampleLabel(activeMinutes = 0, activeIntervals = 0) {
  if (activeMinutes <= 0 || activeIntervals <= 0) {
    return "No sample";
  }

  if (activeMinutes < 60 || activeIntervals < 4) {
    return "Small sample";
  }

  if (activeMinutes >= 300) {
    return "Strong sample";
  }

  return "Good sample";
}

function buildActivityStats(ordered, options = {}) {
  const maxIntervalMinutes = options.activeIntervalMaxMinutes || ACTIVE_INTERVAL_MAX_MINUTES;
  const stats = new Map();

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const intervalMinutes = (new Date(current.capturedAt) - new Date(previous.capturedAt)) / 60000;

    if (intervalMinutes <= 0 || intervalMinutes > maxIntervalMinutes) {
      continue;
    }

    const previousMembers = new Map((previous.members || []).map((member) => [member.tag, member]));

    for (const currentMember of current.members || []) {
      const previousMember = previousMembers.get(currentMember.tag);
      if (!previousMember) {
        continue;
      }

      const delta = (currentMember.trophies || 0) - (previousMember.trophies || 0);
      if (delta === 0) {
        continue;
      }

      const stat = stats.get(currentMember.tag) || createActivityStat(currentMember);
      stat.name = currentMember.name || stat.name;
      stat.activeMinutes += intervalMinutes;
      stat.activeIntervals += 1;
      stat.activeNetGain += delta;
      stat.activePositiveGain += Math.max(0, delta);
      stat.activeLosses += Math.max(0, -delta);
      stat.bestActiveIntervalGain = Math.max(stat.bestActiveIntervalGain, delta);
      stat.firstActiveAt ||= previous.capturedAt;
      stat.lastActiveAt = current.capturedAt;
      stat.activeDays.add(current.capturedAt.slice(0, 10));
      stats.set(currentMember.tag, stat);
    }
  }

  return stats;
}

function stateToMember(state, activityStats = new Map()) {
  const member = state.lastMember || {};
  const gain = Math.max(0, (state.currentTrophies || 0) - (state.baselineTrophies || 0));
  const qualified = state.active && !state.disqualified;
  const totalVictories =
    (member.victories3v3 || 0) + (member.soloVictories || 0) + (member.duoVictories || 0);
  const peakGap = Math.max(0, (member.highestTrophies || 0) - (state.currentTrophies || 0));
  const brawlers = compactBrawlers(member.brawlers?.length ? member.brawlers : member.topBrawlers || []);
  const activity = activityStats.get(state.tag);
  const activeMinutes = activity?.activeMinutes || 0;
  const activeHours = activeMinutes / 60;
  const activeIntervals = activity?.activeIntervals || 0;
  const activeNetGain = activity?.activeNetGain || 0;
  const trophyVelocityPerActiveHour = activeHours > 0 ? activeNetGain / activeHours : 0;

  return {
    tag: state.tag,
    name: state.name,
    role: state.role,
    roleLabel: roleLabel(state.role),
    qualified,
    status: qualified ? (state.rejoinCount > 0 ? "rejoined" : "active") : "left",
    trophies: state.currentTrophies || 0,
    baselineTrophies: state.baselineTrophies || 0,
    gain: qualified ? gain : 0,
    lastRunGain: gain,
    previousDisqualifiedGain: state.previousDisqualifiedGain || 0,
    activeMinutes,
    activeHours,
    activeIntervals,
    activeDays: activity?.activeDays?.size || 0,
    activeNetGain,
    activePositiveGain: activity?.activePositiveGain || 0,
    activeLosses: activity?.activeLosses || 0,
    bestActiveIntervalGain: activity?.bestActiveIntervalGain || 0,
    trophyVelocityPerActiveHour,
    trophyVelocitySampleLabel: getSampleLabel(activeMinutes, activeIntervals),
    firstActiveAt: activity?.firstActiveAt || null,
    lastActiveAt: activity?.lastActiveAt || null,
    joinedAt: state.joinedAt,
    baselineAt: state.baselineAt,
    leftAt: state.leftAt || null,
    currentAt: state.currentAt,
    leaveCount: state.leaveCount || 0,
    rejoinCount: state.rejoinCount || 0,
    nameColor: member.nameColor || null,
    iconId: member.iconId || null,
    highestTrophies: member.highestTrophies,
    peakGap,
    expLevel: member.expLevel,
    expPoints: member.expPoints,
    totalVictories,
    victories3v3: member.victories3v3,
    soloVictories: member.soloVictories,
    duoVictories: member.duoVictories,
    brawlerCount: member.brawlerCount,
    power11Count: member.power11Count,
    maxBrawlerRank: member.maxBrawlerRank,
    topRankBrawlerCount: member.topRankBrawlerCount,
    gadgetCount: member.gadgetCount,
    starPowerCount: member.starPowerCount,
    gearCount: member.gearCount,
    brawlers,
    topBrawlers: brawlers,
    profileFetched: member.profileFetched,
    profileError: member.profileError
  };
}

function buildTimeline(ordered, members, options = {}) {
  const sampledSnapshots = sampleSnapshots(ordered, options.timelinePointLimit || TIMELINE_POINT_LIMIT);
  const baselineByTag = new Map(members.map((member) => [member.tag, member]));

  return sampledSnapshots.map((snapshot) => ({
    capturedAt: snapshot.capturedAt,
    members: snapshot.members
      .map((snapshotMember) => {
        const member = baselineByTag.get(snapshotMember.tag);
        if (!member || !member.qualified || new Date(snapshot.capturedAt) < new Date(member.baselineAt)) {
          return null;
        }

        return {
          tag: snapshotMember.tag,
          name: snapshotMember.name,
          trophies: snapshotMember.trophies || 0,
          gain: Math.max(0, (snapshotMember.trophies || 0) - (member.baselineTrophies || 0))
        };
      })
      .filter(Boolean)
  }));
}

export function buildLeaderboardFromSnapshots(snapshots, options = {}) {
  const ordered = [...snapshots].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  const config = getCompetitionConfig();
  const monthKey = ordered[0]?.monthKey || getMonthKey();
  const states = new Map();
  const activityStats = buildActivityStats(ordered, options);

  for (const snapshot of ordered) {
    applySnapshotToState(states, snapshot);
  }

  const latest = ordered.at(-1);
  const qualifiedMembers = [...states.values()]
    .map((state) => stateToMember(state, activityStats))
    .filter((member) => member.qualified)
    .sort(sortByGain)
    .map((member, index) => ({
      ...member,
      rank: index + 1
    }));

  const disqualifiedMembers = [...states.values()]
    .map((state) => stateToMember(state, activityStats))
    .filter((member) => !member.qualified)
    .sort((a, b) => new Date(b.leftAt || 0) - new Date(a.leftAt || 0))
    .map((member) => ({
      ...member,
      rank: null
    }));

  const members = [...qualifiedMembers, ...disqualifiedMembers];
  const topMember = qualifiedMembers[0] || null;
  const timelineMembers = qualifiedMembers.slice(0, options.timelineMemberLimit || qualifiedMembers.length);
  const clubTrophies =
    latest?.club?.trophies ?? qualifiedMembers.reduce((total, member) => total + member.trophies, 0);
  const clubTrophyBaseline = ordered[0]?.club?.trophies ?? clubTrophies;
  const clubTrophyGain = clubTrophies - clubTrophyBaseline;

  return {
    mode: options.mode || "live",
    generatedAt: new Date().toISOString(),
    competition: config,
    month: {
      key: monthKey,
      label: getMonthLabel(monthKey)
    },
    club: {
      tag: latest?.club?.tag || config.clubTag,
      name: latest?.club?.name || config.clubName,
      description: latest?.club?.description || "",
      type: latest?.club?.type || null,
      badgeId: latest?.club?.badgeId || null,
      requiredTrophies: latest?.club?.requiredTrophies ?? null,
      trophies: clubTrophies,
      rankings: latest?.club?.rankings || [],
      globalRank: latest?.club?.globalRank ?? null,
      countryRank: latest?.club?.countryRank ?? null,
      countryCode: latest?.club?.countryCode || null,
      countryRankLabel: latest?.club?.countryRankLabel || null
    },
    stats: {
      clubTrophies,
      clubTrophyBaseline,
      clubTrophyGain,
      memberCount: latest?.members?.length || 0,
      trackedMembers: states.size,
      qualifiedCount: qualifiedMembers.length,
      disqualifiedCount: disqualifiedMembers.length,
      rejoinedCount: members.filter((member) => member.rejoinCount > 0).length,
      topGain: topMember?.gain || 0,
      snapshotCount: ordered.length,
      firstSnapshotAt: ordered[0]?.capturedAt || null,
      lastUpdated: latest?.capturedAt || null
    },
    topMember,
    members,
    timeline: buildTimeline(ordered, timelineMembers, options)
  };
}
