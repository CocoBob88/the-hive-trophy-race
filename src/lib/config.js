export const DEFAULT_CLUB_TAG = "#2L9R0QPLQ";
export const DEFAULT_CLUB_NAME = "The Hive";

export function normalizeTag(tag) {
  const raw = String(tag || "").trim().toUpperCase();
  if (!raw) {
    return "";
  }

  return raw.startsWith("#") ? raw : `#${raw}`;
}

export function getCompetitionConfig() {
  return {
    clubTag: normalizeTag(process.env.BRAWL_CLUB_TAG || DEFAULT_CLUB_TAG),
    clubName: process.env.BRAWL_CLUB_NAME || DEFAULT_CLUB_NAME,
    ownerHandle: process.env.OWNER_HANDLE || "coco",
    ownerSupercellId: process.env.OWNER_SUPERCELL_ID || "ImaginaryEpicCoco"
  };
}
