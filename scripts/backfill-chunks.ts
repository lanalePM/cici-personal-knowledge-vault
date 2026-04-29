/**
 * Backfill item_chunks for existing vault items (run after applying migration 002).
 * Usage (from repo root): npm run chunks:backfill
 *
 * Loads .env.local BEFORE importing Gemini (static imports run first and initialize the API client).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found — run from cici repo root.");
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/u)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const { chunkAndEmbedForItem } = await import(
    "../src/lib/chunks/embed-item-chunks"
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing from .env.local — required for embeddings.");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("items")
    .select("id, status")
    .eq("status", "ready");

  if (error) throw error;

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows || []) {
    const r = await chunkAndEmbedForItem(row.id);
    if (r.ok && r.chunkCount) ok++;
    else if (r.skipped) skipped++;
    else failed++;
    console.log(row.id, r);
  }

  console.log("\nDone.");
  console.log(`Chunked: ${ok}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
