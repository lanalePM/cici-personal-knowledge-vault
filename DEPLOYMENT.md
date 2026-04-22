# Hosting Cici for demos

This guide deploys the **Next.js app** (so friends can open it in a browser) and configures the **Chrome extension** to talk to that deployment.

## 1. Deploy the web app (recommended: Vercel)

1. Push this repo to GitHub (or GitLab / Bitbucket) if it is not already hosted in git remotely.
2. Sign in at [vercel.com](https://vercel.com) and **Import** the repository.
3. **Root directory:** use the repo root that contains `package.json` (this `cici` folder).
4. **Framework preset:** Next.js (auto-detected).
5. **Environment variables** — add the same keys as in `.env.local.example`:

   | Name | Notes |
   |------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | From Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — never expose to the client |
   | `GEMINI_API_KEY` | Google AI Studio / Gemini API key |

6. Deploy. Copy your production URL (e.g. `https://cici-xxxxx.vercel.app`).

### Local build check

Before deploying, from this directory:

```bash
npm run build
```

Fix any errors Vercel would hit the same way.

---

## 2. Supabase auth URLs

So login and magic links work on the deployed host:

1. Supabase Dashboard → **Authentication** → **URL configuration**
2. **Site URL:** set to your production URL (e.g. `https://cici-xxxxx.vercel.app`)
3. **Redirect URLs:** add the same URL and:

   `https://YOUR_DOMAIN/**`

   Include preview URLs if you use them, e.g. `https://*.vercel.app/**`

Save changes.

---

## 3. Point the Chrome extension at production

### 3a. API base URL

Edit `extension/config.js` and set `CICI_API_BASE` to your deployed origin **with no trailing slash**:

```js
const CICI_API_BASE = "https://your-app.vercel.app";
```

### 3b. Host permissions (custom domains)

The manifest already allows:

- `http://localhost:3000/*` (local dev)
- `https://*.vercel.app/*` (typical Vercel URLs)

If you use a **custom domain** (e.g. `https://cici.example.com`), add it to `extension/manifest.json` in both places:

- `content_scripts` → `matches`
- `host_permissions`

Example pattern:

`https://cici.example.com/*`

Reload the extension after edits (`chrome://extensions` → **Reload**).

---

## 4. Share with friends

### Web app only

Send them the Vercel URL. They sign up / log in like any web app.

### Extension (unpacked — good for demos)

1. Zip the `extension` folder (or share the repo and they use the `extension` folder).
2. They open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → choose the `extension` folder.
3. They must use **your** `config.js` (with your production `CICI_API_BASE`), or edit their copy to match your URL.
4. They log in on your site, open **Connect extension** (`/extension/connect`), and the bridge stores the token.

### Chrome Web Store (optional)

Publishing requires a developer account, store listing assets, and privacy policy. For quick demos, **Load unpacked** is usually enough.

---

## 5. Troubleshooting

| Issue | What to check |
|--------|----------------|
| Extension “Log in” opens wrong site | `CICI_API_BASE` in `extension/config.js` |
| Token / save fails with network error | Manifest `host_permissions` includes your exact origin; reload extension |
| Login redirect breaks after deploy | Supabase **Site URL** and **Redirect URLs** |
| 401 from `/api/extension/*` | Log in on the **same** origin as `CICI_API_BASE`; reconnect via `/extension/connect` |
