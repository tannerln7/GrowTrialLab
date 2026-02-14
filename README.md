# GrowTrialLab

Monorepo scaffold for local development with:
- Django backend (`backend/`)
- Next.js frontend (`frontend/`)
- Docker Compose runtime (`docker-compose.yml`)

## Quick start

1. (Optional) copy env template:
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

## Stop

```bash
docker compose down
```

## Required env vars (dev defaults in `.env.example`)

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
