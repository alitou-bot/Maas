# MAAS API

NestJS backend for MAAS Dashboard Pro.

## Stack

- NestJS (Express) + TypeScript
- PostgreSQL 16 + TypeORM
- JWT access (8h) + refresh (7d)
- Zabbix JSON-RPC client (mock by default; real API when `ZABBIX_MOCK=false`)

## Quick start

```bash
# Start MAAS Postgres + local Zabbix stack
docker compose up -d

# Install & run
cp .env.example .env   # optional — set ZABBIX_MOCK=false for real Zabbix
npm install
npm run start:dev
```

API base: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)

Health: `GET /api/v1/system/health`

Zabbix local setup: see [ZABBIX.md](./ZABBIX.md) (UI http://localhost:8080, Admin / zabbix).

## Demo accounts

Password: `password123`

| Email | Role |
|-------|------|
| `admin@ztc.ma` | SUPER_ADMIN |
| `noc@ztc.ma` | NOC_OPERATOR |
| `admin@acme.ma` | TENANT_ADMIN |
| `viewer@acme.ma` | CLIENT_VIEWER |

## Modules

`/auth` `/tenants` `/users` `/servers` `/groups` `/incidents` `/alerts` `/sla` `/plans` `/notifications` `/system` `/audit`

Guards (global): JwtAuthGuard, RolesGuard, TenantGuard  
Write ops by SUPER_ADMIN / TENANT_ADMIN are logged via AuditInterceptor.

## Env notes

- `ZABBIX_MOCK=true` — synthetic metrics/alerts (safe default without Zabbix)
- `ZABBIX_MOCK=false` + `ZABBIX_URL` — real JSON-RPC (see [ZABBIX.md](./ZABBIX.md))
- `SEED_ON_BOOT=true` — seed demo data when DB is empty
- Dedicated MAAS DB on **5434** to avoid clashing with other local Postgres instances
- Zabbix web/API on **8080**, agent trapper on **10051**
