# MAAS Dashboard Pro

Monitoring-as-a-Service frontend for ZTC — Next.js 15 App Router, TypeScript, Tailwind CSS, Recharts, TanStack Table, Lucide, Axios + SWR.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

Password for all: `password123`

| Email | Role | Landing |
|-------|------|---------|
| `admin@ztc.ma` | SUPER_ADMIN | `/admin/dashboard` |
| `noc@ztc.ma` | NOC_OPERATOR | `/noc/dashboard` |
| `admin@acme.ma` | TENANT_ADMIN | `/client/dashboard` |
| `viewer@acme.ma` | CLIENT_VIEWER | `/client/dashboard` |

JWT is stored in an httpOnly cookie (`maas_token`) via `/api/auth/*`. Data is mocked in `src/data/mock.ts`.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm start` — serve production build
- `npm run lint` — ESLint
