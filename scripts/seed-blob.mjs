import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { loadLocalEnv } from "../src/lib/env.js";

loadLocalEnv();

const databasePath = path.join(process.cwd(), "data", "trophy-race-db.json");
const blobPath = "trophy-race/trophy-race-db.json";

try {
  const database = await fs.readFile(databasePath, "utf8");

  await put(blobPath, database, {
    access: process.env.BLOB_ACCESS || "private",
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json"
  });

  console.log(`Seeded ${blobPath} from ${databasePath}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
