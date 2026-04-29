import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found. Run from cici repo root.");
  }

  const content = fs.readFileSync(envPath, "utf8");
  const vars = {};
  for (const line of content.split(/\r?\n/u)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    vars[key] = value;
  }
  return vars;
}

const TAG_SYNONYMS = {
  llm: "large language models",
  llms: "large language models",
  lm: "large language models",
  "language model": "large language models",
  "language models": "large language models",
  "large language model": "large language models",

  ml: "machine learning",
  "machine-learning": "machine learning",
  dl: "deep learning",
  "deep-learning": "deep learning",
  nlp: "natural language processing",
  "natural language": "natural language processing",

  js: "javascript",
  ts: "typescript",
  reactjs: "react",
  "react.js": "react",
  nodejs: "node.js",
  "node js": "node.js",

  ai: "artificial intelligence",
  "gen ai": "generative ai",
  genai: "generative ai",
  rag: "retrieval augmented generation",
  "retrieval-augmented generation": "retrieval augmented generation",

  api: "api",
  apis: "api",
  db: "database",
  databases: "database",

  ui: "user interface",
  ux: "user experience",
  cli: "command line",
};

function normalizeTagName(raw) {
  const base = raw
    .trim()
    .replace(/^#+/u, "")
    .replace(/\s+/gu, " ")
    .toLowerCase();
  if (!base) return "";
  return TAG_SYNONYMS[base] ?? base;
}

async function mergeTagInto(supabase, sourceTagId, targetTagId) {
  const { data: sourceLinks, error: sourceLinksError } = await supabase
    .from("item_tags")
    .select("item_id, is_ai")
    .eq("tag_id", sourceTagId);
  if (sourceLinksError) throw sourceLinksError;

  for (const link of sourceLinks || []) {
    const { data: existing, error: existingError } = await supabase
      .from("item_tags")
      .select("is_ai")
      .eq("item_id", link.item_id)
      .eq("tag_id", targetTagId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existing) {
      const { error: insertErr } = await supabase.from("item_tags").insert({
        item_id: link.item_id,
        tag_id: targetTagId,
        is_ai: !!link.is_ai,
      });
      if (insertErr) throw insertErr;
      continue;
    }

    if (link.is_ai && !existing.is_ai) {
      const { error: updateErr } = await supabase
        .from("item_tags")
        .update({ is_ai: true })
        .eq("item_id", link.item_id)
        .eq("tag_id", targetTagId);
      if (updateErr) throw updateErr;
    }
  }

  const { error: deleteLinksErr } = await supabase
    .from("item_tags")
    .delete()
    .eq("tag_id", sourceTagId);
  if (deleteLinksErr) throw deleteLinksErr;

  const { error: deleteTagErr } = await supabase
    .from("tags")
    .delete()
    .eq("id", sourceTagId);
  if (deleteTagErr) throw deleteTagErr;
}

async function main() {
  const env = readEnvFile();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, user_id, name, created_at")
    .order("created_at", { ascending: true });
  if (tagsError) throw tagsError;

  const groups = new Map();
  for (const tag of tags || []) {
    const canonical = normalizeTagName(tag.name);
    if (!canonical) continue;
    const key = `${tag.user_id}::${canonical}`;
    const arr = groups.get(key) || [];
    arr.push({ ...tag, canonical });
    groups.set(key, arr);
  }

  let renamedCount = 0;
  let mergedCount = 0;
  let touchedGroups = 0;

  for (const group of groups.values()) {
    const canonical = group[0].canonical;
    const exactCanonical = group.find((g) => g.name === canonical);
    const target = exactCanonical || group[0];

    if (target.name !== canonical) {
      const { error: renameErr } = await supabase
        .from("tags")
        .update({ name: canonical })
        .eq("id", target.id);
      if (renameErr) throw renameErr;
      renamedCount += 1;
      touchedGroups += 1;
      target.name = canonical;
    }

    for (const source of group) {
      if (source.id === target.id) continue;
      await mergeTagInto(supabase, source.id, target.id);
      mergedCount += 1;
      touchedGroups += 1;
    }
  }

  const { count: remainingTags, error: countErr } = await supabase
    .from("tags")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;

  console.log("Tag cleanup complete.");
  console.log(`- Groups touched: ${touchedGroups}`);
  console.log(`- Tags renamed to canonical: ${renamedCount}`);
  console.log(`- Duplicate tags merged: ${mergedCount}`);
  console.log(`- Remaining tag rows: ${remainingTags ?? 0}`);
}

main().catch((err) => {
  console.error("Tag cleanup failed:", err.message || err);
  process.exit(1);
});
