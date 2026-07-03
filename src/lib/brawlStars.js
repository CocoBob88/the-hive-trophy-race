import { getCompetitionConfig, normalizeTag } from "./config.js";
import { getMonthKey } from "./time.js";

const API_BASE = "https://api.brawlstars.com/v1";
const PROFILE_CONCURRENCY = 5;

class BrawlApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "BrawlApiError";
    this.status = status;
  }
}

function getToken() {
  return process.env.BRAWL_API_TOKEN;
}

function encodeTag(tag) {
  return encodeURIComponent(normalizeTag(tag));
}

async function fetchBrawlJson(pathname) {
  const token = getToken();
  if (!token) {
    throw new BrawlApiError("BRAWL_API_TOKEN is not set.", 400);
  }

  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  const body = await response.text();
  const json = body ? JSON.parse(body) : null;

  if (!response.ok) {
    const apiMessage = json?.message || json?.reason || json?.description;
    throw new BrawlApiError(
      `Brawl Stars API request failed (${response.status}): ${apiMessage || response.statusText}`,
      response.status
    );
  }

  return json;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function summarizeBrawlers(brawlers = []) {
  const sorted = [...brawlers].sort((a, b) => (b.trophies || 0) - (a.trophies || 0));
  const maxRank = brawlers.reduce((max, brawler) => Math.max(max, brawler.rank || 0), 0);

  return {
    brawlerCount: brawlers.length,
    power11Count: brawlers.filter((brawler) => (brawler.power || 0) >= 11).length,
    maxBrawlerRank: maxRank,
    topRankBrawlerCount: brawlers.filter((brawler) => (brawler.rank || 0) === maxRank).length,
    gadgetCount: brawlers.reduce((total, brawler) => total + (brawler.gadgets?.length || 0), 0),
    starPowerCount: brawlers.reduce((total, brawler) => total + (brawler.starPowers?.length || 0), 0),
    gearCount: brawlers.reduce((total, brawler) => total + (brawler.gears?.length || 0), 0),
    brawlers: sorted.map((brawler) => ({
      id: brawler.id,
      name: brawler.name,
      power: brawler.power,
      rank: brawler.rank,
      trophies: brawler.trophies,
      highestTrophies: brawler.highestTrophies,
      gadgetCount: brawler.gadgets?.length || 0,
      starPowerCount: brawler.starPowers?.length || 0,
      gearCount: brawler.gears?.length || 0
    })),
    topBrawlers: sorted.slice(0, 5).map((brawler) => ({
      id: brawler.id,
      name: brawler.name,
      power: brawler.power,
      rank: brawler.rank,
      trophies: brawler.trophies,
      highestTrophies: brawler.highestTrophies
    }))
  };
}

function normalizeMember(member, profile, errorMessage) {
  const brawlerSummary = summarizeBrawlers(profile?.brawlers);

  return {
    tag: normalizeTag(profile?.tag || member.tag),
    name: profile?.name || member.name,
    nameColor: profile?.nameColor || member.nameColor || null,
    role: member.role || profile?.club?.role || "member",
    iconId: profile?.icon?.id || member.icon?.id || null,
    trophies: profile?.trophies ?? member.trophies ?? 0,
    highestTrophies: profile?.highestTrophies ?? null,
    expLevel: profile?.expLevel ?? null,
    expPoints: profile?.expPoints ?? null,
    victories3v3: profile?.["3vs3Victories"] ?? null,
    soloVictories: profile?.soloVictories ?? null,
    duoVictories: profile?.duoVictories ?? null,
    bestRoboRumbleTime: profile?.bestRoboRumbleTime ?? null,
    bestTimeAsBigBrawler: profile?.bestTimeAsBigBrawler ?? null,
    isQualifiedFromChampionshipChallenge:
      profile?.isQualifiedFromChampionshipChallenge ?? null,
    profileFetched: Boolean(profile),
    profileError: errorMessage || null,
    ...brawlerSummary
  };
}

export async function fetchClubSnapshot() {
  const config = getCompetitionConfig();
  const capturedAt = new Date().toISOString();
  const club = await fetchBrawlJson(`/clubs/${encodeTag(config.clubTag)}`);
  const memberList = Array.isArray(club.members)
    ? club.members
    : (await fetchBrawlJson(`/clubs/${encodeTag(config.clubTag)}/members`)).items || [];

  const members = await mapLimit(memberList, PROFILE_CONCURRENCY, async (member) => {
    try {
      const profile = await fetchBrawlJson(`/players/${encodeTag(member.tag)}`);
      return normalizeMember(member, profile);
    } catch (error) {
      return normalizeMember(member, null, error.message);
    }
  });

  return {
    capturedAt,
    monthKey: getMonthKey(new Date(capturedAt)),
    club: {
      tag: normalizeTag(club.tag || config.clubTag),
      name: club.name || config.clubName,
      description: club.description || "",
      type: club.type || null,
      badgeId: club.badgeId || null,
      requiredTrophies: club.requiredTrophies ?? null,
      trophies: club.trophies ?? members.reduce((total, member) => total + member.trophies, 0),
      memberCount: club.members?.length || members.length
    },
    members
  };
}
