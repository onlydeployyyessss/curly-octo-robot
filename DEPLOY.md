# 🚀 PC Mission — Deployment Guide

Step-by-step for deploying to **Vercel** (web + serverless API + scheduler + Telegram bot)
and/or **Railway** (web + dedicated worker + Postgres).

---

## 0. Prerequisites

- The repo on GitHub (e.g. `your-org/pc-mission`).
- A PostgreSQL database (Vercel Postgres, Neon, Supabase, or Railway Postgres).
- *(Optional)* A Telegram bot token from [@BotFather](https://t.me/BotFather).
- *(Optional)* A Meta app for Instagram OAuth (App ID + Secret).
- *(Optional)* an OpenRouter API key for AI personalization.

---

## 1. Environment variables

Set these in your host's dashboard (Vercel → Settings → Environment Variables; Railway → Variables).
**Never** commit `.env`. A full reference is in `.env.example`.

| Variable | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db?sslmode=require` (auto-set by Vercel Postgres) |
| `SESSION_SECRET` | ✅ | 32+ random chars. Also encrypts stored OAuth tokens. Generate: `openssl rand -hex 32` |
| `CRON_SECRET` | ✅ | Long random string — protects the scheduler endpoint + GitHub Action |
| `APP_URL` | ✅ (prod) | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | Bootstrap admin; you can also create the first user in the UI |
| `TELEGRAM_BOT_TOKEN` | for Telegram | `123456:ABC-...` from BotFather |
| `TELEGRAM_CHAT_ID` | for Telegram | Your numeric chat id (DM `/start` to the bot to auto-register) |
| `OPENROUTER_API_KEY` | optional | Enables AI message personalization |
| `META_APP_ID` / `META_APP_SECRET` | for Instagram | Meta app credentials |
| `META_REDIRECT_URI` | for Instagram | `https://your-app.vercel.app/api/instagram/callback` |
| `META_WEBHOOK_VERIFY` | for webhooks | Any secret string you also enter in the Meta dashboard |
| `RUN_WORKER` | Railway worker | `true` on the worker service only |

---

## 2. Deploy to Vercel (recommended)

### 2.1 Import
1. Go to **https://vercel.com/new** → import the GitHub repo.
2. **Framework Preset:** leave as detected (the root `vercel.json` drives everything).
3. **Build Command:** leave **blank** (it uses `vercel.json` → `npm run vercel:build`).
   If you prefer to set it explicitly, use `npm run vercel:build`. Do **not** use a stale
   override like `npm run build && npm run db:migrate` unless it matches the repo.
4. **Output Directory:** `apps/web/dist` (already set in `vercel.json`).
5. Add a database: **Storage → Create → Postgres** and connect it to the project
   (this sets `DATABASE_URL`). Add the rest of the env vars from the table above.
6. Click **Deploy**.

> ⚠️ **After pushing fixes, do NOT click "Redeploy" on an old failed build** — that rebuilds
> the *old commit*. Instead wait for the newest commit's deployment, or use the
> **Deployments → (⌄ menu) → Deploy latest commit**, or push any new commit. The build log's
> first line shows the commit SHA — confirm it matches the latest `main`.

### 2.2 What the build does
`npm run vercel:build` →
1. typechecks & builds all packages,
2. **bundles the API into a self-contained lambda** (`api/index.js` → `api/_bundle/handler.cjs`)
   with the shared code inlined (no monorepo resolution needed on Vercel),
3. builds the React app to `apps/web/dist`,
4. runs DB migrations (non-fatal if the DB isn't reachable at build time — they also apply on
   first run; you can always run `npm run db:migrate` manually).

### 2.3 Scheduler (Vercel Hobby = daily cron only)
Vercel Hobby allows only daily cron jobs, so the frequent tick runs via a free
**GitHub Actions** workflow included in the repo.

In the GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

- `APP_URL` = `https://your-app.vercel.app` (no trailing slash)
- `CRON_SECRET` = the same value as in Vercel

The workflow (`.github/workflows/scheduler.yml`) pings `POST /api/cron/tick` every 10 minutes.
Every tick is idempotent (row locks + idempotency keys; stale locks reclaimed after 5 min),
so overlaps are harmless. Test it manually: **Actions tab → scheduler-tick → Run workflow**.

> On Vercel **Pro**, you can instead set the `vercel.json` cron to `*/10 * * * *` and
> skip the workflow.

### 2.4 Telegram bot (webhook mode on Vercel)
After the first successful deploy:

```bash
# locally, with your env loaded (or run anywhere with the token available):
npm install
TELEGRAM_BOT_TOKEN=xxx npx tsx apps/api/src/scripts/set-webhook.ts https://your-app.vercel.app
```

Then DM **/start** to your bot. Commands: `/status /report /creators /replies /errors /pause /resume`.

### 2.5 Meta / Instagram webhook (optional)
Meta App Dashboard → Webhooks → Instagram:
- Callback URL: `https://your-app.vercel.app/api/webhooks/meta`
- Verify token: the value of `META_WEBHOOK_VERIFY`
- Subscribe fields: `messages` (DMs) and `comments`.

### 2.6 Verify
- `https://your-app.vercel.app/health` →
  `{"status":"ok","database":"connected","worker":"web-mode"}`
- Log in, add a creator, and watch the activity log.

### Deploying without Git (CLI)
If the dashboard keeps building an old commit, bypass Git entirely:

```bash
npx vercel --prod
```

---

## 3. Deploy to Railway (web + dedicated worker + Postgres)

1. **New Project → Deploy from GitHub repo** (root as project root).
2. Add a **Postgres** database service; reference its `DATABASE_URL`.
3. Create **two services** from the same repo:

   | Service | Dockerfile | Env extras |
   |---|---|---|
   | `pc-mission-web` | `Dockerfile` | all vars; healthcheck `/health` |
   | `pc-mission-worker` | `Dockerfile.worker` | same vars + `RUN_WORKER=true` |

4. Set environment variables (section 1). The web container migrates on boot; the worker
   migrates too and then ticks every 30s and runs Telegram **long polling** (no webhook needed).
5. Expose the web service's public URL and set `APP_URL` / `META_REDIRECT_URI` accordingly.

Railway runs the compiled ESM bundles (`apps/api/dist/index.js` and `dist/worker.js`)
with npm dependencies installed in the image.

---

## 4. Local development

```bash
npm install
docker compose up -d postgres          # or use any local Postgres
cp .env.example .env                    # defaults work; MOCK_EXTERNAL=true simulates APIs
npm run db:migrate && npm run db:seed
npm run dev                             # web :5173 + api :4000
```

Run the API with an embedded worker: `RUN_WORKER=true npm run dev:api`.
Preview the UI with no backend at all: `cd apps/web && VITE_DEMO_MODE=1 npm run dev`.

---

## 5. Post-deploy checklist

- [ ] `/health` returns `database: "connected"`
- [ ] You can log in (or create the first operator account)
- [ ] GitHub Action `scheduler-tick` runs green (or Railway worker logs show ticks)
- [ ] Telegram `/start` and `/status` respond
- [ ] Instagram account connects via OAuth (or shows a clear "not configured" notice)
- [ ] Adding a creator schedules Day 1; a reply pauses automation automatically
- [ ] Daily report time is set under **Telegram** settings

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Build clones an **old commit SHA** | You're viewing/redeploying an old deployment. Deploy the latest commit or `npx vercel --prod`. |
| `Cannot find module '@pc/shared'` at build | Fixed by the esbuild lambda bundle (commit `3902b2c`+). Ensure the latest commit is deployed and Build Command is blank/`npm run vercel:build`. |
| Cron error about more than once/day | Hobby allows daily cron only — use the included GitHub Actions scheduler (section 2.3). |
| Lambda 500 / module not found | The build must include `api/_bundle/handler.cjs`; it's produced by `npm run build`/`vercel:build`. |
| Actions run but nothing happens | Check `APP_URL` (no trailing slash) and that `CRON_SECRET` matches Vercel. Action log shows the response. |
| Telegram silent | Confirm `TELEGRAM_BOT_TOKEN`, set `TELEGRAM_CHAT_ID` or DM `/start`, and register the webhook (2.4) or run the Railway worker. |
| Instagram actions show "manual action required" | The authorized token lacks that permission scope — the app never bypasses it; grant the scope in Meta or perform the action manually. |
