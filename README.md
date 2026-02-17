# GrowTrialLab

Monorepo scaffold for local development with:
- Django backend (`backend/`)
- Next.js frontend (`frontend/`)
- Docker Compose runtime (`docker-compose.yml`)

Experiment flow summary:
- `/experiments/{id}` is the canonical experiment entry route.
- It redirects to `/experiments/{id}/setup` until bootstrap setup is complete (plants + tents/slots + recipes).
- After bootstrap setup, it redirects to `/experiments/{id}/overview` for readiness work (baseline + placement/tray recipes + feeding).

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
   - LAN frontend (same network): `http://<HOST_LAN_IP>:3000`

### LAN access notes

- Frontend now uses same-origin API requests (`/api/*`, `/healthz`, `/media/*`) and Next rewrites to reach backend.
- This means opening `http://<HOST_LAN_IP>:3000` from another device works without browser calls to `localhost:8000`.
- Docker Compose defaults:
  - `NEXT_BACKEND_ORIGIN=http://backend:8000` (frontend proxy target inside compose network)
  - `DJANGO_ALLOWED_HOSTS=*` for local dev convenience
- Production should set strict host allowlists and explicit origins.

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

## Backend tests (pytest)

- Run all backend tests:
  - `cd backend && uv run pytest`
- Run a single file:
  - `cd backend && uv run pytest tests/test_lifecycle.py`
- Run a single test:
  - `cd backend && uv run pytest tests/test_lifecycle.py::test_lifecycle_start_stop_roundtrip_for_ready_experiment`
- Run with coverage:
  - `cd backend && uv run pytest --cov=api --cov-report=term-missing`
- Run in parallel (optional, xdist):
  - `cd backend && uv run pytest -n auto`

## Reset Local Dev DB

Use this only when you intentionally want a clean empty local database.

```bash
infra/scripts/reset-dev.sh
```

What it deletes:
- The Docker Compose Postgres named volume backing `/var/lib/postgresql/data`.
- This removes all local dev DB rows (experiments, plants, events, users in DB, etc.).

What it runs:
- `docker compose down --remove-orphans`
- Detects the actual Postgres volume name from `docker compose config --format json`
- `docker volume rm -f <detected_postgres_volume>`
- `docker compose up --build -d`
- waits for backend health at `http://localhost:8000/healthz` while backend startup runs migrations/bootstrap

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

- Auth bypass only activates when all of the following are true:
  - `NODE_ENV=development`
  - `ENABLE_DEV_AUTH_BYPASS=true`
  - `DJANGO_DEBUG=1`
  - Cloudflare Access values are missing/placeholders (`CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`)
- In bypass mode, requests are treated as `DEV_EMAIL` (or `ADMIN_EMAIL` if `DEV_EMAIL` is unset).
- In all other modes, full Cloudflare JWT verification is enforced.

## Required env vars

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `NODE_ENV`
- `ENABLE_DEV_AUTH_BYPASS`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `ADMIN_EMAIL`
- `DEV_EMAIL`
- `AUTH_MODE`
- `PUBLIC_BASE_URL`
- `NEXT_BACKEND_ORIGIN` (compose/internal proxy target for frontend rewrites)
- `NEXT_PUBLIC_BACKEND_BASE_URL` (optional browser override; usually leave unset to use same-origin rewrites)

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
