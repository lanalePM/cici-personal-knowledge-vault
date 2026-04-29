/**
 * Canonical tag labels for storage and UI (lowercase, trimmed).
 * Expand TAG_SYNONYMS as you discover noisy duplicates from AI or users.
 */
const TAG_SYNONYMS: Record<string, string> = {
  // LLMs / NLP (common overlap)
  llm: "large language models",
  llms: "large language models",
  lm: "large language models",
  "language model": "large language models",
  "language models": "large language models",
  "large language model": "large language models",

  // ML umbrella
  ml: "machine learning",
  "machine-learning": "machine learning",
  dl: "deep learning",
  "deep-learning": "deep learning",
  nlp: "natural language processing",
  "natural language": "natural language processing",

  // Web / JS ecosystem
  js: "javascript",
  ts: "typescript",
  reactjs: "react",
  "react.js": "react",
  nodejs: "node.js",
  "node js": "node.js",

  // Generic shorthand
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

function baseNormalize(input: string): string {
  const s = input
    .trim()
    .replace(/^#+/u, "")
    .replace(/\s+/gu, " ")
    .toLowerCase();
  return s;
}

/**
 * Normalize user- or AI-provided tag text for deduplication.
 * Applies lowercase, collapses whitespace, strips #, then synonym mapping.
 */
export function normalizeTagName(raw: string): string {
  const base = baseNormalize(raw);
  if (!base) return "";
  return TAG_SYNONYMS[base] ?? base;
}
