# Cici — Personal Knowledge Vault

A personal knowledge management app that helps you store, recall, and manage content from across platforms with AI summaries, tags, and hybrid search.

## Stack

- **Frontend:** Next.js 15 (App Router) + Tailwind CSS v4
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL + pgvector + Row Level Security)
- **Auth:** Supabase Auth (email/password + magic link)
- **Storage:** Supabase Storage (PDFs + images, max 5 MB)
- **AI — Summaries & Tags:** Google Gemini 2.0 Flash
- **AI — Embeddings:** Google Gemini text-embedding-004 (768 dims)
- **Search:** Hybrid (PostgreSQL tsvector + pgvector) with Reciprocal Rank Fusion

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- Google Gemini API key (get one free at [aistudio.google.com](https://aistudio.google.com))

### 1. Install dependencies

```bash
cd cici
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in your keys in `.env.local`.

### 3. Set up the database

Run the SQL migration in your Supabase SQL Editor:

1. Go to your Supabase dashboard → SQL Editor
2. Paste the contents of `supabase/migrations/001_initial_schema.sql`
3. Run it

This creates all tables, indexes, RLS policies, the hybrid search function, and the storage bucket.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy & share (Vercel + extension)

To host the app for others and point the **Cici me** extension at production, follow **[DEPLOYMENT.md](./DEPLOYMENT.md)** (environment variables, Supabase URLs, and `extension/config.js`).

## Project Structure

```
cici/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login, signup, auth callback
│   │   ├── (main)/          # Vault pages (library + detail + extension connect)
│   │   ├── api/
│   │   │   ├── items/       # CRUD for vault items
│   │   │   ├── search/      # Hybrid search endpoint
│   │   │   ├── ai/          # AI processing (summarize, embed)
│   │   │   └── extension/   # Extension API (save, token, status)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── layout/          # TopBar, Sidebar
│   │   ├── ui/              # Toast system
│   │   └── vault/           # ItemCard, EmptyState, AddToVaultModal
│   ├── lib/
│   │   ├── ai/              # Gemini AI, content extraction
│   │   ├── supabase/        # Client, server, middleware helpers
│   │   └── utils.ts
│   ├── types/
│   │   └── database.ts
│   └── middleware.ts
├── extension/               # "Cici me" Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html + popup.js
│   ├── background.js        # Context menu handler
│   ├── content.js           # Token bridge (web app → extension)
│   └── icons/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── package.json
└── README.md
```

## Save Methods (MVP)

1. **Paste link** in web app — Add to Vault modal
2. **Upload file** (PDF/image) in web app — Add to Vault modal
3. **Browser extension** — Save this page (sends URL + DOM text)
4. **Browser extension** — Save selected text

## Browser Extension ("Cici me")

### Install (load unpacked for development)

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select the `extension/` folder
4. The ✦ Cici me icon appears in your toolbar

For production, set `CICI_API_BASE` in `**extension/config.js`** to your deployed site URL (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

### Connect to your account

1. Click the Cici me extension icon
2. Click "Log in" → opens the web app
3. Log in (or sign up) → the extension auto-connects via the connect page
4. Alternatively: in the web app, click your avatar → "Copy API Token" and paste it manually

### Usage

- **Save this page:** Click the ✦ icon → add optional note → Save
- **Save selection:** Select text on any page → click ✦ icon → auto-switches to selection mode → Save
- **Right-click:** Select text → right-click → "Cici me: Save selection" (saves directly)

## How AI Processing Works

When an item is saved:

1. Item is created with `status: 'processing'`
2. Background job triggers `/api/ai/summarize`
3. Content is extracted (URL fetch → DOM fallback → PDF parse → image)
4. Gemini generates summary + tag suggestions
5. Gemini generates embedding (title + summary + notes)
6. Item updated to `status: 'ready'`

If AI fails → `status: 'summary_failed'` with a Retry button in the UI.

## Search

Hybrid search combines:

- **Keyword search:** PostgreSQL `tsvector` over title, summary, notes (weighted A/B/C)
- **Semantic search:** pgvector cosine similarity over Gemini embeddings
- **Ranking:** Reciprocal Rank Fusion (RRF) with k=60

