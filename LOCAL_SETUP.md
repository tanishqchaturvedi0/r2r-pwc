# Running r2r-pwc (Accruals Pro) locally

## One-command E2E (recommended)

With **Docker Desktop** running:

```bash
./run-e2e.sh
```

This starts PostgreSQL in Docker, pushes the schema, starts the app, and runs smoke tests (GET /, POST login). App stays running at http://127.0.0.1:5000.

---

## Manual setup

### 1. Prerequisites

- **Node.js** 20+
- **PostgreSQL** 16+ (running locally or use a cloud connection string)

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` and set:

- **DATABASE_URL** (required)  
  - Local: `postgresql://localhost:5432/r2rpwc` (create the DB first, see below)  
  - Or use a cloud Postgres URL (e.g. Supabase, Neon, Render)
- **PORT** (optional, default `5000`)
- **GEMINI_API_KEY** (optional, for Approval Rules AI)

### 3. Database (local Postgres)

Alternatively use Docker: `docker compose up -d postgres` then set in `.env`:

`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/r2rpwc`

Create the database and push the schema:

```bash
# Create database (if using local Postgres)
createdb r2rpwc

# Install deps and push Drizzle schema
npm install
npm run db:push
```

### 4. Run the app

```bash
npm run dev
```

- App + API: **http://localhost:5000** or **http://127.0.0.1:5000** (or your `PORT`)
- In dev, Vite serves the client; the same process serves the API.
- If you see **"Access to 127.0.0.1 was denied"**: use **http://localhost:5000** instead, and ensure the app is running (`npm run dev`). If it still fails, set `HOST=127.0.0.1` in `.env` and restart.

### 5. Demo logins (from seed)

| Role           | Email               | Password   |
|----------------|---------------------|------------|
| Finance Admin  | admin@company.com   | Admin@123  |
| Finance Approver | approver@company.com | Approver@123 |
| Business User  | user@company.com    | User@123   |
| Business User 2 | sanjay@company.com | User@123   |

Seed runs automatically on first start when the DB is empty. If the DB is not reachable at startup, the server still starts but API calls that need the DB will fail until Postgres is running and `DATABASE_URL` is correct.
