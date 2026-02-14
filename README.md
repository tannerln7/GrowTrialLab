# GrowTrialLab

Monorepo scaffold for local development with:
- Django backend (`backend/`)
- Next.js frontend (`frontend/`)
- Docker Compose runtime (`docker-compose.yml`)

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

## Media uploads (dev)

- Uploaded files are stored in `/data/uploads` in the backend container.
- In local compose, this maps to `./data/uploads` on the host.
- Django serves media at `/media/` when `DJANGO_DEBUG=1`.

## Env safety

- Commit `.env.example` only.
- Do not commit `.env` with local real values.
