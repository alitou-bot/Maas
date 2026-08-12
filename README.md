# MAAS Dashboard Pro

Full-stack Monitoring-as-a-Service platform for ZTC.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, SWR, Axios |
| Backend | NestJS, TypeORM, PostgreSQL 16, JWT |
| Charts | Recharts |
| Tables | TanStack Table v8 |

## Run everything (Docker)

From the repo root:

```bash
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Zabbix UI | http://localhost:8080 (Admin / zabbix) |
| MAAS Postgres | localhost:5434 |

Stop: `docker compose down`

## Run on the host (dev)

```bash
# 1. Infra only (DB + Zabbix)
docker compose up -d postgres postgres_zabbix zabbix_server zabbix_web zabbix_agent

# 2. API (port 4000)
cd backend && npm install && npm run start:dev

# 3. Frontend (port 3000)
cd frontend && npm install && npm run dev
```

- UI: http://localhost:3000  
- API: http://localhost:4000/api/v1  
- Health: http://localhost:4000/api/v1/system/health  

Frontend env (`frontend/.env.local`):

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Initial account

Database seeds **only** one Super Admin:

| Email | Password | Role |
|-------|----------|------|
| `admin@ztc.ma` | `password123` | SUPER_ADMIN |

Create plans, tenants, users, and servers from the admin UI.

## Auth

Frontend stores NestJS access + refresh tokens (localStorage + cookie for middleware). Axios sends `Authorization: Bearer <accessToken>` and refreshes on 401.
