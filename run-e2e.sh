#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== r2r-pwc E2E: Postgres + schema + app + smoke tests ==="

# 1. Start Postgres (Docker)
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop (or run: docker compose up -d) then re-run this script."
  exit 1
fi

echo "[1/5] Starting PostgreSQL..."
docker compose up -d postgres

echo "[2/5] Waiting for Postgres to be ready..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose exec -T postgres pg_isready -U postgres

# Use Docker Postgres credentials
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/r2rpwc"
export PORT=5000

echo "[3/5] Pushing schema (drizzle)..."
npm run db:push

echo "[4/5] Starting app in background..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/r2rpwc" PORT=5000 npm run dev &
APP_PID=$!
trap "kill $APP_PID 2>/dev/null || true" EXIT

# Wait for server to listen
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 1
done

echo "[5/5] Smoke tests..."
# Frontend
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/)
if [ "$STATUS" != "200" ]; then
  echo "FAIL: GET / returned $STATUS"
  exit 1
fi
echo "  GET / -> $STATUS"

# Login (demo user)
RESP=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"Admin@123"}')
if echo "$RESP" | grep -q '"token"'; then
  echo "  POST /api/auth/login (admin@company.com) -> 200 + token"
else
  echo "  POST /api/auth/login response: $RESP"
  echo "FAIL: Login did not return token"
  exit 1
fi

echo ""
echo "=== E2E passed. App: http://127.0.0.1:5000 (PID $APP_PID; stop with Ctrl+C or kill $APP_PID) ==="
