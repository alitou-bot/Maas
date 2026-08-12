ALTER TABLE servers ALTER COLUMN "ipAddress" DROP NOT NULL;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "pskIdentity" character varying NULL;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "pskKey" character varying NULL;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "installToken" character varying NULL;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "tokenExpiresAt" timestamptz NULL;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "tokenUsed" boolean NOT NULL DEFAULT false;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "installStatus" character varying NOT NULL DEFAULT 'PENDING';
