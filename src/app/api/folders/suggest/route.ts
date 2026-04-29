import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const maxDuration = 60;

// ── POST /api/folders/suggest ─────────────────────────────────────────────────
// Looks at all the user's tags, asks Gemini to group them into logical folders,
// then creates those folders in the DB.
// Skips tags that are already in a folder. Skips folder names that already exist.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load all user tags
  const { data: tags } = await supabase
    .from("tags")
    .select("name")
    .eq("user_id", user.id)
    .order("name");

  const allTagNames = (tags || []).map((t) => t.name).filter(Boolean);

  if (allTagNames.length < 3) {
    return NextResponse.json(
      { error: "You need at least 3 tags to get folder suggestions." },
      { status: 400 }
    );
  }

  // Load existing folders + their tags so we can skip already-grouped tags
  const { data: existingFolders } = await supabase
    .from("vault_folders")
    .select("id, name")
    .eq("user_id", user.id);

  const existingFolderIds = (existingFolders || []).map((f) => f.id);
  const existingFolderNames = new Set(
    (existingFolders || []).map((f) => f.name.toLowerCase())
  );

  let alreadyGroupedTags = new Set<string>();
  if (existingFolderIds.length > 0) {
    const { data: ft } = await supabase
      .from("folder_tags")
      .select("tag_name")
      .in("folder_id", existingFolderIds);
    alreadyGroupedTags = new Set((ft || []).map((r) => r.tag_name));
  }

  const ungroupedTags = allTagNames.filter((t) => !alreadyGroupedTags.has(t));

  if (ungroupedTags.length < 2) {
    return NextResponse.json(
      { error: "All your tags are already grouped into folders." },
      { status: 400 }
    );
  }

  // Ask Gemini to propose groupings
  const prompt = `You are helping organize a personal knowledge vault. The user has saved articles and notes tagged with these labels:

Tags: ${ungroupedTags.join(", ")}

Group them into 3–7 meaningful thematic folders. Rules:
- Each folder gets a clear, concise name (2–4 words)
- Group tags covering the same or related topics, EVEN IF worded differently (e.g. "llm", "large-language-models", "gpt" → one folder called "AI Models")
- Each folder must have at least 2 tags
- Do NOT force-fit every tag — it is fine to leave some ungrouped
- Prefer 3–5 great folders over 7 mediocre ones

Return JSON only:
{
  "folders": [
    {"name": "AI & Machine Learning", "tags": ["llm", "machine-learning", "neural-networks"]},
    {"name": "Product & Growth", "tags": ["product-management", "startup", "product-led-growth"]}
  ]
}`;

  let suggested: { name: string; tags: string[] }[] = [];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text) as { folders?: unknown };

    if (Array.isArray(parsed.folders)) {
      suggested = (parsed.folders as { name?: unknown; tags?: unknown }[])
        .filter((f) => typeof f.name === "string" && Array.isArray(f.tags))
        .map((f) => ({
          name: String(f.name).trim(),
          tags: (f.tags as unknown[]).filter((t): t is string => typeof t === "string"),
        }))
        .filter((f) => f.name && f.tags.length >= 2);
    }
  } catch (e) {
    console.error("[folders/suggest] Gemini error:", e);
    return NextResponse.json({ error: "AI suggestion failed" }, { status: 500 });
  }

  if (suggested.length === 0) {
    return NextResponse.json({ error: "No valid groupings found" }, { status: 422 });
  }

  // Create the suggested folders in the DB
  let foldersCreated = 0;
  const ungroupedTagSet = new Set(ungroupedTags);

  for (const suggestion of suggested) {
    // Skip if a folder with this name already exists (case-insensitive)
    if (existingFolderNames.has(suggestion.name.toLowerCase())) continue;

    // Only include tags that actually exist in the user's vault and are ungrouped
    const validTags = suggestion.tags.filter((t) => ungroupedTagSet.has(t));
    if (validTags.length < 2) continue;

    const { data: newFolder } = await supabase
      .from("vault_folders")
      .insert({ user_id: user.id, name: suggestion.name })
      .select("id")
      .single();

    if (!newFolder) continue;

    await supabase.from("folder_tags").insert(
      validTags.map((tag_name) => ({ folder_id: newFolder.id, tag_name }))
    );

    // Mark these tags as grouped so subsequent folders don't double-use them
    for (const t of validTags) ungroupedTagSet.delete(t);
    foldersCreated++;
  }

  return NextResponse.json({ folders_created: foldersCreated });
}
