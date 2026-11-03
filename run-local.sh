#!/bin/bash
# Local test run of Plane with the cross-project-parent patch.
# Run from the repo root on your Mac: ./run-local.sh
set -e
cd "$(dirname "$0")"

echo "==> 1/3 Starting backend + infra (Postgres, Redis, RabbitMQ, MinIO, API, workers)"
docker compose -f docker-compose-local.yml down
docker compose -f docker-compose-local.yml up -d --build

echo "==> Waiting for API on :8000 ..."
for i in $(seq 1 60); do
  if curl -fs http://localhost:8000/api/instances/ >/dev/null 2>&1; then echo "API is up"; break; fi
  sleep 3
done

echo "==> 2/3 Installing JS deps (first time takes a few minutes)"
command -v pnpm >/dev/null || corepack enable
pnpm install --frozen-lockfile

echo "==> Building shared workspace packages (first time only, ~2-3 min)"
pnpm turbo run build --filter='./packages/*'

echo "==> 3/3 Starting web (3005) and admin (3001) dev servers"
echo "    God mode: http://localhost:3001/god-mode   App: http://localhost:3005"
(cd apps/admin && pnpm dev) &
(cd apps/web && pnpm exec react-router dev --port 3005)
