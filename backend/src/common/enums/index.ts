export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  NOC_OPERATOR = 'NOC_OPERATOR',
  TENANT_ADMIN = 'TENANT_ADMIN',
  CLIENT_VIEWER = 'CLIENT_VIEWER',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum ServerStatus {
  UP = 'UP',
  DOWN = 'DOWN',
  WARNING = 'WARNING',
  UNKNOWN = 'UNKNOWN',
}

export enum IncidentSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export enum IncidentStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

export enum ReportFormat {
  PDF = 'PDF',
  CSV = 'CSV',
}

export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  DISCORD = 'discord',
}

export enum WatchedEntityType {
  CONTAINER = 'CONTAINER',
  SERVICE = 'SERVICE',
  PROCESS = 'PROCESS',
  NETWORK_DEVICE = 'NETWORK_DEVICE',
  NETWORK_INTERFACE = 'NETWORK_INTERFACE',
  SYSTEM_METRIC = 'SYSTEM_METRIC',
}

export enum WatchStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}
