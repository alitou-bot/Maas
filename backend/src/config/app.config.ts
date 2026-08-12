import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'maas-dev-secret-change-me',
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '8h',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || 'maas-refresh-secret-change-me',
  webhookSecret: process.env.WEBHOOK_SECRET || 'zabbix-webhook-secret',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  reportsDir: process.env.REPORTS_DIR || 'reports',
  zabbix: {
    url: process.env.ZABBIX_URL || '',
    user: process.env.ZABBIX_USER || '',
    password: process.env.ZABBIX_PASSWORD || '',
    mock: process.env.ZABBIX_MOCK !== 'false',
    // Optional override — leave empty to resolve dynamically per request / host IP
    publicIp: process.env.ZABBIX_PUBLIC_IP || '',
  },
  publicApiUrl:
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_API_URL ||
    'http://host.docker.internal:4000/api/v1',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'maas',
    password: process.env.DB_PASSWORD || 'maas',
    database: process.env.DB_NAME || 'maas',
  },
}));
