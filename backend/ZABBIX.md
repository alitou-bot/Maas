# Local Zabbix (dev)

MAAS talks to Zabbix only through the JSON-RPC API. The frontend never calls Zabbix directly.

## Start / stop

From `backend/`:

```bash
# MAAS Postgres + Zabbix (DB, server, web UI, agent)
docker compose up -d

# Stop everything
docker compose down

# Stop but keep data volumes
docker compose stop
```

| Service | URL / port |
|---------|------------|
| Zabbix web UI + API | http://localhost:8080 |
| JSON-RPC endpoint | http://localhost:8080/api_jsonrpc.php |
| Zabbix server (agents) | TCP 10051 |
| MAAS Postgres | localhost:5434 |

Default UI login: **Admin** / **zabbix** (local only).

## Env (NestJS)

In `.env`:

```bash
ZABBIX_URL=http://localhost:8080/api_jsonrpc.php
ZABBIX_USER=Admin
ZABBIX_PASSWORD=zabbix
ZABBIX_MOCK=false
WEBHOOK_SECRET=zabbix-webhook-secret
```

| Mode | When |
|------|------|
| **Mock** | `ZABBIX_MOCK` is not `false`, or `ZABBIX_URL` is empty. Charts/alerts use synthetic data; `/system/zabbix/test` returns `6.4.0-mock`. |
| **Real** | `ZABBIX_MOCK=false` and a reachable `ZABBIX_URL`. |

## Map a host into MAAS

1. Open http://localhost:8080 → **Monitoring → Hosts** (or **Configuration → Hosts**).
2. Open the host (default: **Zabbix server**). Note its numeric **Host ID**.
3. If the agent is unreachable, set the host interface to DNS/IP `zabbix_agent` (Docker service name) and port `10050`.
4. In MAAS, create or edit a **server** and set `zabbixHostId` to that Host ID.

## Verify API from MAAS

```bash
# After backend is running with ZABBIX_MOCK=false
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ztc.ma","password":"password123"}'

# Use the accessToken:
curl -s -X POST http://localhost:4000/api/v1/system/zabbix/test \
  -H "Authorization: Bearer <accessToken>"
```

Expect: `"connected": true` and a real version (e.g. `6.4.x`), not `6.4.0-mock`.

Also: Admin UI → Settings → Zabbix test.

## Incident webhook (for later Zabbix Actions)

```
POST http://localhost:4000/api/v1/incidents/webhook
Header: X-Webhook-Secret: <WEBHOOK_SECRET>
Content-Type: application/json
```

Body fields: `hostname`, `severity`, `title`, `description`, optional `zabbixEventId`, `triggeredAt`.

The hostname must match a row in the MAAS `servers` table.
