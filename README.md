# 🎯 PC Mission

**A respectful, multi-day Instagram creator outreach command center.**

PC Mission manages a campaign where you politely ask creators, once per day over a
configurable number of days, whether they can help you get a PC. Every DM and comment is
templated/approved, optionally personalized by AI, **logged before it is sent**, and — most
importantly — **all automation for a creator stops the moment they reply**. You get a daily
Telegram report and an instant Telegram alert on every reply.

> ⚠️ **Policy-first by design.** PC Mission uses **only** the official Instagram Graph API
> and Facebook Login (OAuth). It never asks for passwords, session cookies, or browser
> cookies, and never attempts to bypass Meta permissions, rate limits, or automation
> restrictions. When an API capability isn't authorized, the app shows
> *"API permission unavailable — manual action required"* instead of working around it.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui-style components |
| Backend | Node.js + TypeScript (Express) |
| Database | PostgreSQL via Drizzle ORM (SQL migrations) |
| Worker | Node worker process (Railway) **or** Vercel Cron + webhooks |
| AI | OpenRouter (optional, ON/OFF toggle, guardrailed) |
| Instagram | Official Meta/Instagram Graph API + OAuth |
| Telegram | Telegram Bot API (webhook or long polling) |
| Auth | Email + password (scrypt), HTTP-only secure session cookies |
| Deploy | **Vercel** (web + API + cron + webhooks) and/or **Railway** (web + worker + Postgres) |

Secrets exist **only** in server environment variables — nothing is ever bundled to the browser.

---

## Repository layout

```
pc-mission/
├── api/index.ts                  # Vercel serverless entry
├── vercel.json                   # Vercel build + rewrites + cron
├── Dockerfile / Dockerfile.worker   # Railway web + worker
├── railway.json
├── packages/shared/              # Shared types, constants, zod schemas
├── apps/web/                     # React dashboard (Vite + Tailwind)
└── apps/api/                     # Express API + scheduler + integrations
    ├── src/db/schema.ts          # 16 tables, FKs + indexes
    ├── drizzle/                  # Generated SQL migrations
    ├── src/services/             # instagram, openrouter, telegram, campaign-engine…
    └── src/routes/               # REST endpoints + webhooks
```

---

## Quick start (local)

```bash
# 1. Install
npm install

# 2. Postgres (docker-compose provided, or any local Postgres)
docker compose up -d postgres        # or: createdb pc_mission

# 3. Environment
cp .env.example .env                 # fill in values (defaults work for local dev)

# 4. Migrate + seed (creates admin user if ADMIN_PASSWORD is set)
npm run db:migrate
npm run db:seed

# 5. Run everything (web on :5173, API on :4000)
npm run dev
# Or run the API with the embedded worker:
# RUN_WORKER=true npm run dev:api
```

Open `http://localhost:5173`.
With `MOCK_EXTERNAL=true` (default in dev) Instagram/Telegram/OpenRouter calls are simulated,
so the entire campaign flow works without external credentials. Set it to `false` with real
credentials to use live APIs.

**Try the UI with zero backend:** `cd apps/web && VITE_DEMO_MODE=1 npm run dev` — the dashboard
runs against an interactive in-memory demo dataset.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | 32+ char secret; also derives token-encryption key |
| `OPENROUTER_API_KEY` | optional | AI message personalization |
| `OPENROUTER_MODEL` | optional | Default `openai/gpt-4o-mini` |
| `TELEGRAM_BOT_TOKEN` | for Telegram | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | for Telegram | Your chat id (also settable in UI) |
| `TELEGRAM_AUTHORIZED_IDS` | optional | Comma-separated extra allowed chat/user ids |
| `META_APP_ID` / `META_APP_SECRET` | for Instagram | Meta app credentials |
| `META_REDIRECT_URI` | for Instagram | `https://<your-domain>/api/instagram/callback` |
| `META_GRAPH_VERSION` | optional | Default `v21.0` |
| `META_WEBHOOK_VERIFY` / `META_WEBHOOK_SECRET` | for webhooks | Meta webhook verify token |
| `CRON_SECRET` | ✅ in prod | Bearer secret protecting `/api/cron/tick` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | Bootstrap admin (or create one in the UI) |
| `APP_URL` | ✅ in prod | Public app URL (OAuth redirects) |
| `RUN_WORKER` | Railway worker | `true` on the worker service |
| `VITE_DEMO_MODE` | frontend only | `1` = UI demo data (never expose secrets) |

---

## Deploy to Vercel (web app + API + Telegram bot)

1. Push this repository to GitHub and import it in Vercel.
2. Vercel auto-detects the config (`vercel.json`):
   - builds the React app (`apps/web/dist`),
   - bundles `api/index.ts` as a serverless function,
   - rewrites `/api/*` → the function, everything else → SPA,
   - runs a daily **Vercel Cron** safety net against `/api/cron/tick` (Hobby-compatible),
     while a free **GitHub Actions** workflow (`*/10 * * * *`) provides the frequent tick —
     see step 6.
3. Add a **Postgres** database (Vercel Postgres/Neon) and set `DATABASE_URL`.
4. Set all environment variables above (the Postgres integration sets `DATABASE_URL` for you).
5. Migrations run automatically during build (`npm run db:migrate`).
6. **Enable the scheduler heartbeat** — Vercel *Hobby* plans only allow **daily** cron jobs,
   so the frequent tick runs via a free **GitHub Actions** workflow included in the repo
   (`.github/workflows/scheduler.yml`, every 10 minutes). Add two repository secrets under
   **GitHub repo → Settings → Secrets and variables → Actions**:
   - `APP_URL` → e.g. `https://your-app.vercel.app`
   - `CRON_SECRET` → the same value you set in Vercel

   The action pings `POST /api/cron/tick` with the bearer token. Every tick is idempotent
   (row-level locks + idempotency keys), and stale locks from killed serverless runs are
   reclaimed automatically after 5 minutes — so overlapping or delayed ticks are harmless.
   The daily Vercel cron (`vercel.json`) acts as an additional safety net. On Vercel **Pro**
   you can instead change its schedule to `*/10 * * * *` and delete the workflow.
7. Register the Telegram webhook once:
   ```bash
   npm run telegram:webhook -- https://your-app.vercel.app
   ```
8. Configure the Meta webhook (App Dashboard → Webhooks → Instagram):
   - Callback URL: `https://your-app.vercel.app/api/webhooks/meta`
   - Verify token: value of `META_WEBHOOK_VERIFY`
   - Subscribe to `messages` (Instagram Messaging) and `comments`.

**Cron auth on Vercel:** Vercel sends `Authorization: Bearer <CRON_SECRET>` when you set the
`CRON_SECRET` environment variable in your project.

---

## Deploy to Railway (web + dedicated worker + Postgres)

1. New project → deploy from this repo **three times** with root as the project root:
   - **pc-mission-web** — `Dockerfile`, healthcheck `/health`
   - **pc-mission-worker** — `Dockerfile.worker` (set `RUN_WORKER=true`; runs scheduler + Telegram long polling)
   - **Postgres** — official Postgres plugin/image
2. Set `DATABASE_URL` (use the Postgres service reference) and the rest of the variables.
3. The web container runs migrations on boot; the worker does the same and then ticks every 30s.

---

## Telegram bot

Daily report at your configured time + instant reply alerts. Commands (authorized chat only):

`/start` · `/status` · `/report` · `/creators` · `/replies` · `/errors` · `/pause` · `/resume`

Daily report format:

```
🤖 PC MISSION — DAILY REPORT
📅 27 Aug 2026
👥 CREATORS  • Active: 42  • New: 8  • Completed: 3
📨 OUTREACH  • DMs sent: 37  • Comments sent: 29  • Failed actions: 2
💬 RESPONSES • Total replies: 5 • Positive: 2 • Maybe: 1 • Declined: 2
🔥 CREATOR REPLIES … ⏳ ACTIVE CAMPAIGNS (Day 1…5+) … 🎯 PC MISSION … ⚠️ ERRORS
```

Instant reply alert on every creator response: `🔥 CREATOR REPLIED … 🛑 Automation automatically paused.`

---

## Campaign engine reliability

- **Idempotent queue** — every scheduled action has a unique `idempotency_key`
  (`dm:<creator>:<day>:<date>`); duplicate sends are impossible.
- **Row locking** — due actions are claimed with `FOR UPDATE SKIP LOCKED`, so Vercel Cron and
  a Railway worker can coexist without double-processing.
- **Verification gates** before each action: campaign active? creator replied? paused/stopped?
  already done today? excluded?
- **Final message stored first** — the exact DM/comment text is written to the activity log
  *before* the API call (also handles AI output).
- **Retry policy** — transient errors (network, rate limit, 5xx) use exponential backoff
  (60s → cap 30min) up to 5 attempts; permanent errors (OAuth expired, permission denied,
  invalid creator, deleted media, blocked, duplicate) are never retried indefinitely.
- **Auto-stop** — any reply cancels pending actions and pauses the campaign.
- **Emergency stop** — the red sidebar button (or `/pause`, or Settings) halts every worker.

---

## AI personalization (OpenRouter)

OFF by default → fixed approved templates. When ON, the AI rephrases the approved day message
using the creator's public profile/notes and previous interactions. A strict system prompt and
an output validator forbid impersonation, fabricated conversations, fake promises, harassment,
threats, manipulation, and platform-bypassing content. Policy-violating output is rejected and
the approved template is used instead (fail safe).

---

## API surface (selected)

```
POST /api/auth/setup | /api/auth/login | /api/auth/logout      GET /api/auth/me
GET  /api/dashboard/stats
GET/POST /api/creators   PATCH /api/creators/:id
POST /api/creators/:id/control   {action: start|pause|resume|stop|skip_day|restart|exclude|include}
GET  /api/creators/:id/conversation
GET  /api/campaigns    PUT /api/campaigns/config    GET /api/campaigns/queue/upcoming
GET  /api/accounts     POST /api/accounts/connect   GET /api/instagram/callback (OAuth)
GET  /api/templates    POST /api/templates/generate POST /api/templates/send-test
GET  /api/replies      POST /api/replies/manual
GET  /api/activity     GET /api/errors
GET/PUT /api/telegram/settings   POST /api/telegram/test | /report-now | /webhook
GET/PUT /api/settings  POST /api/settings/emergency-stop
POST /api/cron/tick   (Bearer CRON_SECRET)
POST /api/telegram/webhook        GET/POST /api/webhooks/meta
GET  /health → { "status": "ok", "database": "connected", "worker": "running" }
```

---

## Database

16 tables: `users, sessions, instagram_accounts, creators, campaigns, campaign_days,
message_templates, scheduled_actions, action_logs, conversations, replies,
excluded_creators, telegram_settings, daily_reports, system_errors, app_settings, audit_logs`
with foreign keys and indexes on creator username, campaign status, scheduled action time,
action status, Instagram account id, and reply timestamp.

## Scripts

```bash
npm run dev            # web + api together
npm run build          # typecheck + build all packages
npm run db:migrate     # apply SQL migrations
npm run db:seed        # seed admin + default templates
npm run worker         # standalone scheduler worker (tsx)
npm run telegram:webhook -- <url>   # set telegram webhook
```
