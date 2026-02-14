# GrowTrialLab

Monorepo scaffold for local development with:
- Django backend (`backend/`)
- Next.js frontend (`frontend/`)
- Docker Compose runtime (`docker-compose.yml`)

Experiment flow summary:
- `/experiments/{id}` is the canonical experiment entry route.
- It redirects to `/experiments/{id}/setup` until bootstrap setup is complete (plants + blocks + recipes).
- After bootstrap setup, it redirects to `/experiments/{id}/overview` for readiness work (baseline + assignment).

## Quick start

1. Create a local `.env` from template:
   ```bash
   cp .env.example .env
   ```
2. Start services:
   ```bash
   docker compose up --build
   ```
3. Verify:
   - Backend health: `http://localhost:8000/healthz`
   - Frontend: `http://localhost:3000`
   - API root: `http://localhost:8000/api/v1/`

## Stop

```bash
docker compose down
```

## PWA install and offline checks

PWA features are configured in `frontend/` with:
- `frontend/public/manifest.webmanifest`
- `frontend/public/sw.js`
- `frontend/app/offline/page.tsx`

Run a production frontend build for service worker behavior:

```bash
cd frontend
pnpm build
pnpm start
```

Verify in Chrome/Edge DevTools:
1. Open `http://localhost:3000`.
2. Go to `Application` > `Manifest` and confirm manifest is detected.
3. Go to `Application` > `Service Workers` and confirm `sw.js` is active.
4. In DevTools `Network`, toggle `Offline`, reload, and confirm offline fallback appears (`/offline`).

Install prompts:
1. Android (Chrome): browser menu > `Install app` / `Add to Home screen`.
2. iOS (Safari): `Share` > `Add to Home Screen`.
3. Desktop (Chrome/Edge): click the install icon in the address bar.

Notes:
- Service workers require secure context; `localhost` is allowed for local testing.
- Do not commit local `.env` files.

## Local editor setup (WSL + VSCode)

- Python interpreter is pinned in `.vscode/settings.json` to:
  - `${workspaceFolder}/backend/.venv/bin/python`
- Create/sync local backend env:
  - `cd backend && uv venv`
  - `cd backend && uv sync`
- Type checking:
  - `pnpm pyright`
  - Config lives in `pyrightconfig.json` (scoped to `backend/`).

## Verification script

- Run full checks:
  - `infra/scripts/verify.sh`
- Script runs:
  - backend tests
  - pyright
  - docker compose build

## Auth behavior

- There is no login UI and no password auth.
- Backend validates `Cf-Access-Jwt-Assertion` on requests (except `/healthz`) using:
  - `https://{CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`
  - signature + `exp` + `aud` (`CF_ACCESS_AUD`)
- Invite-only mode:
  - Unknown authenticated users are rejected with 403.
  - `ADMIN_EMAIL` is auto-bootstrapped as an active admin.
- `/api/me` returns the authenticated app user profile.
- Core CRUD endpoints are under `/api/v1/*` and are available to any authenticated `app_user`.
- Admin APIs:
  - `GET /api/admin/users`
  - `POST /api/admin/users` (invite by email)
  - `PATCH /api/admin/users/{id}` (set `status` to `active` or `disabled`)

## Dev bypass (local only)

- If `DJANGO_DEBUG=1` and either `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is missing/placeholder, auth bypass is enabled.
- In bypass mode, requests are treated as `DEV_EMAIL` (or `ADMIN_EMAIL` if `DEV_EMAIL` is unset).
- If both Cloudflare values are set to real values, full JWT verification is enforced even in debug mode.

## Required env vars

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `ADMIN_EMAIL`
- `DEV_EMAIL`
- `AUTH_MODE`
- `PUBLIC_BASE_URL`

## Label QR URLs

- Plant label QR codes encode an absolute URL in the form `{PUBLIC_BASE_URL}/p/{plant_uuid}`.
- If `PUBLIC_BASE_URL` is missing or invalid, labels fall back to `http://localhost:3000/p/{plant_uuid}`.
- For production, set `PUBLIC_BASE_URL` to the real external app origin so printed QR labels resolve correctly outside local dev.

## Media uploads (dev)

- Uploaded files are stored in `/data/uploads` in the backend container.
- In local compose, this maps to `./data/uploads` on the host.
- Django serves media at `/media/` when `DJANGO_DEBUG=1`.

## Env safety

- Commit `.env.example` only.
- Do not commit `.env` with local real values.
