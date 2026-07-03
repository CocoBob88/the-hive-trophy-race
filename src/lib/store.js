import fs from "node:fs/promises";
import path from "node:path";
import { getMonthKey } from "./time.js";

const DATABASE_VERSION = 1;
const RETAIN_MONTHS = 12;
const RETAIN_BACKUPS = 24;
const DB_BLOB_PATH = "trophy-race/trophy-race-db.json";
const BACKUP_BLOB_PREFIX = "trophy-race/backups/db/";

function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function getBlobAccess() {
  return process.env.BLOB_ACCESS || "private";
}

async function getBlobSdk() {
  return import("@vercel/blob");
}

function getDataDirectory() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
}

function getDatabaseFile() {
  return path.join(getDataDirectory(), "trophy-race-db.json");
}

function getLegacySnapshotFile(monthKey) {
  return path.join(getDataDirectory(), "snapshots", `${monthKey}.json`);
}

function getBackupFile(capturedAt) {
  const safeTimestamp = capturedAt.replace(/[:.]/g, "-");
  return path.join(getDataDirectory(), "backups", "db", `trophy-race-db-${safeTimestamp}.json`);
}

function getBackupBlobPath(capturedAt) {
  const safeTimestamp = capturedAt.replace(/[:.]/g, "-");
  return `${BACKUP_BLOB_PREFIX}trophy-race-db-${safeTimestamp}.json`;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function readBlobJson(pathname, fallback) {
  if (!isBlobConfigured()) {
    return fallback;
  }

  const { get } = await getBlobSdk();

  try {
    const blob = await get(pathname, {
      access: getBlobAccess()
    });

    if (!blob) {
      return fallback;
    }

    return JSON.parse(await new Response(blob.stream).text());
  } catch (error) {
    if (error.status === 404 || error.message?.includes("not found")) {
      return fallback;
    }

    throw error;
  }
}

async function writeBlobJson(pathname, value, { overwrite = true } = {}) {
  const { put } = await getBlobSdk();
  await put(pathname, `${JSON.stringify(value, null, 2)}\n`, {
    access: getBlobAccess(),
    allowOverwrite: overwrite,
    cacheControlMaxAge: 60,
    contentType: "application/json"
  });
}

function createEmptyDatabase() {
  return {
    version: DATABASE_VERSION,
    updatedAt: null,
    months: {}
  };
}

function compactMember(member) {
  return {
    tag: member.tag,
    name: member.name,
    role: member.role,
    trophies: member.trophies || 0,
    iconId: member.iconId || null
  };
}

function compactSnapshot(snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    monthKey: snapshot.monthKey,
    club: {
      tag: snapshot.club?.tag,
      name: snapshot.club?.name,
      trophies: snapshot.club?.trophies ?? 0,
      memberCount: snapshot.club?.memberCount ?? snapshot.members?.length ?? 0,
      badgeId: snapshot.club?.badgeId ?? null,
      requiredTrophies: snapshot.club?.requiredTrophies ?? null
    },
    members: (snapshot.members || []).map(compactMember)
  };
}

function ensureMonth(database, monthKey) {
  database.months[monthKey] ||= {
    monthKey,
    snapshots: [],
    latestMembers: {}
  };

  return database.months[monthKey];
}

function addSnapshotToDatabase(database, snapshot) {
  const monthKey = snapshot.monthKey || getMonthKey(new Date(snapshot.capturedAt));
  const month = ensureMonth(database, monthKey);

  month.snapshots.push(compactSnapshot({ ...snapshot, monthKey }));
  month.snapshots.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));

  for (const member of snapshot.members || []) {
    month.latestMembers[member.tag] = member;
  }

  database.updatedAt = snapshot.capturedAt;
  pruneDatabase(database);
}

function pruneDatabase(database) {
  const monthKeys = Object.keys(database.months).sort();
  const remove = monthKeys.slice(0, Math.max(0, monthKeys.length - RETAIN_MONTHS));

  for (const monthKey of remove) {
    delete database.months[monthKey];
  }
}

function hydrateSnapshot(month, snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    monthKey: snapshot.monthKey,
    club: snapshot.club,
    members: snapshot.members.map((member) => ({
      ...(month.latestMembers[member.tag] || {}),
      ...member
    }))
  };
}

async function readLegacyDatabase() {
  const database = createEmptyDatabase();
  const snapshotsDirectory = path.join(getDataDirectory(), "snapshots");

  let files = [];
  try {
    files = await fs.readdir(snapshotsDirectory);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const document = await readJson(path.join(snapshotsDirectory, file), null);
    for (const snapshot of document?.snapshots || []) {
      addSnapshotToDatabase(database, snapshot);
    }
  }

  return database;
}

async function readDatabase() {
  if (isBlobConfigured()) {
    const blobDatabase = await readBlobJson(DB_BLOB_PATH, null);
    if (blobDatabase) {
      return {
        ...createEmptyDatabase(),
        ...blobDatabase,
        months: blobDatabase.months || {}
      };
    }
  }

  const existing = await readJson(getDatabaseFile(), null);
  if (existing) {
    return {
      ...createEmptyDatabase(),
      ...existing,
      months: existing.months || {}
    };
  }

  return readLegacyDatabase();
}

async function backupExistingDatabase(capturedAt) {
  if (isBlobConfigured()) {
    const database = await readBlobJson(DB_BLOB_PATH, null);
    if (!database) {
      return;
    }

    await writeBlobJson(getBackupBlobPath(capturedAt), database, { overwrite: false });
    await pruneBlobBackups();
    return;
  }

  const filePath = getDatabaseFile();

  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const backupPath = getBackupFile(capturedAt);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.copyFile(filePath, backupPath);
  await pruneBackups(path.dirname(backupPath));
}

async function pruneBlobBackups() {
  const { del, list } = await getBlobSdk();
  const result = await list({
    prefix: BACKUP_BLOB_PREFIX,
    limit: 1000
  });

  const oldBackups = result.blobs
    .map((blob) => blob.pathname)
    .filter((pathname) => pathname.endsWith(".json"))
    .sort()
    .slice(0, Math.max(0, result.blobs.filter((blob) => blob.pathname.endsWith(".json")).length - RETAIN_BACKUPS));

  if (oldBackups.length > 0) {
    await del(oldBackups);
  }
}

async function pruneBackups(backupDirectory) {
  let backups = [];
  try {
    backups = await fs.readdir(backupDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const files = backups
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(backupDirectory, entry.name))
    .sort();

  for (const file of files.slice(0, Math.max(0, files.length - RETAIN_BACKUPS))) {
    await fs.unlink(file);
  }
}

export async function appendSnapshot(snapshot) {
  const database = await readDatabase();
  await backupExistingDatabase(snapshot.capturedAt);
  addSnapshotToDatabase(database, snapshot);
  if (isBlobConfigured()) {
    await writeBlobJson(DB_BLOB_PATH, database);
  } else {
    await writeJsonAtomic(getDatabaseFile(), database);
  }

  const monthKey = snapshot.monthKey || getMonthKey(new Date(snapshot.capturedAt));
  return {
    monthKey,
    snapshots: await readMonthSnapshots(monthKey, database)
  };
}

export async function readMonthSnapshots(monthKey = getMonthKey(), providedDatabase = null) {
  const database = providedDatabase || (await readDatabase());
  const month = database.months[monthKey];

  if (!month) {
    return [];
  }

  return month.snapshots.map((snapshot) => hydrateSnapshot(month, snapshot));
}

export async function listAvailableMonths() {
  const database = await readDatabase();
  return Object.keys(database.months).sort().slice(-RETAIN_MONTHS).reverse();
}
