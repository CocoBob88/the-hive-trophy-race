import { appendSnapshots, readMonthSnapshots } from "../src/lib/store.js";
import { loadLocalEnv } from "../src/lib/env.js";

loadLocalEnv();

const MONTH_KEY = "2026-07";
const CAPTURED_AT = "2026-07-01T18:18:00.000Z";
const CLUB_TROPHIES = 4_407_014;
const CLUB_MEMBER_COUNT = 30;

const apply = process.argv.includes("--apply");
const includeReview = process.argv.includes("--include-review");

const baselineRows = [
  { rank: 1, tag: "#PJLQ2RYY", trophies: 168_795 },
  { rank: 2, tag: "#9GLV9VC9L", trophies: 167_214 },
  { rank: 3, tag: "#YRU0LPLU0", trophies: 161_941 },
  { rank: 4, tag: "#80QP8J2UC", trophies: 161_626 },
  { rank: 5, tag: "#L8289PL0", trophies: 161_425 },
  { rank: 6, tag: "#GJUCUV90J", trophies: 158_347 },
  { rank: 7, tag: "#299R22JGP", trophies: 155_829 },
  { rank: 8, tag: "#20J2LC922", trophies: 154_431 },
  { rank: 9, tag: "#LLGL8YLGL", trophies: 152_970, private: true },
  { rank: 10, tag: "#2RGYUJG80", trophies: 152_787 },
  { rank: 11, tag: "#8LUVPLJQU", trophies: 152_188 },
  { rank: 12, tag: "#GCQVRL9PL", trophies: 149_175 },
  { rank: 13, tag: "#QUR2CQU2Y", trophies: 147_596 },
  { rank: 14, tag: "#JUU2VJR", trophies: 147_286 },
  { rank: 15, tag: "#2G2CPVGGP", trophies: 147_242 },
  { rank: 16, tag: "#2GUG2C00C", trophies: 146_608 },
  { rank: 17, tag: "#JR2V98QQ", trophies: 145_292 },
  { rank: 18, tag: "#RGJ2JUL9", trophies: 144_746 },
  { rank: 19, tag: "#8UJQYVPU", trophies: 143_916 },
  { rank: 20, tag: "#YVQCPVUQU", trophies: 142_638 },
  { rank: 21, tag: "#8JJ89809C", trophies: 141_563 },
  {
    rank: 22,
    tag: "#CV9VV2UU",
    trophies: 141_133,
    review: true,
    note: "Partially cut off in screenshot; inferred from current API gain."
  },
  { rank: 23, tag: "#2G8R9UR02", trophies: 139_869 },
  { rank: 24, tag: "#Q9V9YQ2JG", trophies: 139_156 },
  { rank: 25, tag: "#990V8RRUR", trophies: 138_590 },
  { rank: 26, tag: "#2LLGJVPR8", trophies: 138_005 },
  { rank: 27, tag: "#L98YV9L8G", trophies: 131_107 },
  { rank: 28, tag: "#8RC8VVQJ8", trophies: 129_910 },
  {
    rank: 29,
    tag: "#JP089PU",
    trophies: 124_256,
    review: true,
    note: "Bottom row is partially visible in screenshot."
  }
];

function displayName(row, knownMember) {
  if (row.private) {
    return "[masked]";
  }

  return knownMember?.name || row.tag;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

const snapshots = await readMonthSnapshots(MONTH_KEY);
if (snapshots.length === 0) {
  console.error(`No ${MONTH_KEY} snapshots found. Nothing was changed.`);
  process.exit(1);
}

const existingBaseline = snapshots.find((snapshot) => snapshot.capturedAt === CAPTURED_AT);
const latestSnapshot = snapshots.at(-1);
const knownMembers = new Map();

for (const snapshot of snapshots) {
  for (const member of snapshot.members || []) {
    knownMembers.set(member.tag, {
      ...knownMembers.get(member.tag),
      ...member
    });
  }
}

const rowsForImport = baselineRows.filter((row) => includeReview || !row.review);
const missingRows = rowsForImport.filter((row) => !knownMembers.has(row.tag));

if (missingRows.length > 0) {
  console.error("These baseline rows could not be matched to known API tags:");
  for (const row of missingRows) {
    console.error(`- rank ${row.rank}, ${row.tag}, ${formatNumber(row.trophies)} trophies`);
  }
  console.error("Nothing was changed.");
  process.exit(1);
}

const members = rowsForImport.map((row) => {
  const knownMember = knownMembers.get(row.tag);
  return {
    tag: row.tag,
    name: knownMember.name,
    role: knownMember.role || "member",
    trophies: row.trophies,
    iconId: knownMember.iconId || null
  };
});

const snapshot = {
  capturedAt: CAPTURED_AT,
  monthKey: MONTH_KEY,
  club: {
    ...(latestSnapshot.club || {}),
    tag: latestSnapshot.club?.tag || "#2L9R0QPLQ",
    name: latestSnapshot.club?.name || "The Hive",
    trophies: CLUB_TROPHIES,
    memberCount: CLUB_MEMBER_COUNT
  },
  members
};

console.log(`${apply ? "Apply" : "Dry run"} July 2026 manual baseline`);
console.log(`Captured at: ${CAPTURED_AT}`);
console.log(`Club trophies: ${formatNumber(CLUB_TROPHIES)}`);
console.log(`Rows included: ${members.length}`);
console.log(`Review rows included: ${includeReview ? "yes" : "no"}`);
console.log("");
console.log("Rank | Member | Trophies | Note");
console.log("---- | ------ | -------- | ----");
for (const row of baselineRows) {
  const included = includeReview || !row.review;
  const knownMember = knownMembers.get(row.tag);
  const note = [
    included ? "included" : "held for review",
    row.note || "",
    row.private ? "masked in review output" : ""
  ].filter(Boolean).join("; ");
  console.log(
    `${row.rank} | ${displayName(row, knownMember)} | ${formatNumber(row.trophies)} | ${note}`
  );
}

if (existingBaseline) {
  console.log("");
  console.log("A snapshot already exists at this timestamp. Applying will replace that timestamp.");
}

if (!apply) {
  console.log("");
  console.log("Dry run only. Re-run with --apply to write the baseline.");
  console.log("Add --include-review to include the partially visible screenshot rows.");
  process.exit(0);
}

await appendSnapshots([snapshot]);
console.log("");
console.log(`Imported ${members.length} manual baseline rows for ${MONTH_KEY}.`);
