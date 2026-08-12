export type Role =
  | "SUPER_ADMIN"
  | "NOC_OPERATOR"
  | "TENANT_ADMIN"
  | "CLIENT_VIEWER";

export type TenantStatus = "active" | "suspended";
export type ServerStatus = "UP" | "DOWN" | "WARNING" | "UNKNOWN";
export type IncidentStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type Severity = "CRITICAL" | "WARNING" | "INFO";
export type UserStatus = "active" | "suspended";
export type ReportFormat = "PDF" | "CSV";

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  tenantId: string | null;
  tenantName?: string | null;
  status?: UserStatus;
  lastLogin?: string | null;
  createdAt?: string | null;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  tenantId: string | null;
  status: UserStatus;
  lastLogin: string | null;
  createdAt?: string;
  tenantName?: string | null;
}

export interface Plan {
  id: string;
  name: string;
  maxServers: number;
  retentionDays: number;
  features: string[];
  priceMonthly: number;
}

export interface Tenant {
  id: string;
  name: string;
  contactEmail?: string;
  planId: string;
  planName: string | null;
  plan?: Plan | null;
  serverLimit: number;
  serversUsed: number;
  userCount: number;
  status: TenantStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Server {
  id: string;
  tenantId: string;
  tenantName: string | null;
  hostname: string;
  ipAddress: string | null;
  os: string;
  groupId: string | null;
  groupName: string | null;
  status: ServerStatus;
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
  uptime: string | number;
  lastCheck: string | null;
  zabbixHostId?: string | null;
  notes?: string | null;
}

export interface IncidentNote {
  id: string;
  incidentId?: string;
  authorId?: string;
  authorName?: string;
  author?: string;
  content: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  tenantId: string;
  tenantName: string | null;
  serverId: string;
  hostname: string | null;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  assignedToUserId: string | null;
  assignedToName: string | null;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  zabbixEventId?: string | null;
  notes?: IncidentNote[];
}

export interface NotificationInboxItem {
  id: string;
  title: string;
  severity: Severity;
  openedAt: string;
  read: boolean;
}

export interface NotificationInbox {
  items: NotificationInboxItem[];
  unreadCount: number;
}

export interface Alert {
  zabbixEventId: string;
  tenantId: string;
  tenantName: string | null;
  serverId: string;
  hostname: string | null;
  severity: Severity;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  durationSeconds: number;
  linkedIncidentId: string | null;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  tenantId: string | null;
  ipAddress: string | null;
  result: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SlaSummary {
  tenantId: string;
  tenantName: string;
  period: string;
  overallUptimePercent: number;
  totalDowntimeMinutes: number;
  incidentCount: number;
  mttrMinutes: number;
  services: Array<{
    serverId: string;
    hostname: string;
    uptimePercent: number;
    downtimeMinutes: number;
    incidentCount: number;
  }>;
}

export interface SlaReportMeta {
  id: string;
  reportId?: string;
  tenantId: string;
  year: number;
  month: number;
  format: ReportFormat;
  generatedAt: string;
  downloadUrl?: string;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  emailRecipients: string[];
  slackWebhookUrl: string | null;
  discordWebhookUrl: string | null;
  minSeverity: Severity;
}

export interface ServerGroup {
  id: string;
  tenantId: string;
  name: string;
  serverCount?: number;
  createdAt?: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface MetricSeries {
  metric: string;
  serverId: string;
  hostname: string;
  from: string;
  to: string;
  dataPoints: Array<{ timestamp: string; value: number }>;
}

export interface ServerProcess {
  name: string;
  instances: number;
  cpuPercent: number;
  memoryBytes: number;
  status: string;
}

export interface ServerProcessesResponse {
  processes: ServerProcess[];
  total: number;
  lastUpdated: string;
}

export interface ServerService {
  name: string;
  port: number;
  status: "UP" | "DOWN" | "UNKNOWN";
  responseTimeMs: number | null;
  lastChecked: string | null;
}

export interface ServerServicesResponse {
  services: ServerService[];
}

export interface ServerContainer {
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memoryUsed: number;
  memoryLimit: number;
  uptime: string;
}

export interface ServerContainersResponse {
  available: boolean;
  containers: ServerContainer[];
}

export interface ServerNetworkRates {
  bytesInPerSec: number;
  bytesOutPerSec: number;
}

export interface ServerNetworkInterface {
  name: string;
  bitsInPerSec: number;
  bitsOutPerSec: number;
  inErrors: number;
  outErrors: number;
  inDropped: number;
  outDropped: number;
}

export interface ServerFilesystem {
  mount: string;
  fstype: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  inodesFreePercent: number | null;
}

export interface ServerSystemInfo {
  system: {
    cpuCount: number | null;
    load1: number | null;
    load5: number | null;
    load15: number | null;
    contextSwitches: number | null;
    interrupts: number | null;
    kernelMaxFiles: number | null;
    kernelMaxProc: number | null;
    agentVersion: string | null;
    agentHostname: string | null;
    memTotalBytes: number | null;
    memAvailableBytes: number | null;
    memUtilization: number | null;
    swapFreePercent: number | null;
    processes: number | null;
    runningProcesses: number | null;
  };
  interfaces: ServerNetworkInterface[];
  filesystems: ServerFilesystem[];
  lastUpdated: string;
}

export type NetworkDeviceStatus = "UP" | "DOWN" | "UNKNOWN";
export type NetworkDeviceType = "router" | "switch" | "ap" | "printer" | "unknown";

export interface NetworkDevice {
  zabbixHostId: string;
  name: string;
  ip: string;
  type: NetworkDeviceType;
  status: NetworkDeviceStatus;
  lastSeen: string | null;
  description: string | null;
  groupName: string;
}

export interface NetworkDevicesResponse {
  data: NetworkDevice[];
  total: number;
}

export interface NetworkInterface {
  key: string;
  name: string;
  status: "UP" | "DOWN";
}

export interface NetworkBandwidth {
  key: string;
  name: string;
  bytesIn: number;
  bytesOut: number;
}

export interface NetworkDeviceDetail {
  zabbixHostId: string;
  name: string;
  ip: string;
  status: NetworkDeviceStatus;
  description: string | null;
  groupName: string;
  lastSeen: string | null;
  snmp: {
    description: string | null;
    systemName: string | null;
    location: string | null;
    uptime: number | null;
    interfaces: NetworkInterface[];
    bandwidth: NetworkBandwidth[];
  };
  alerts: NetworkDeviceAlert[];
}

export interface NetworkDeviceAlert {
  zabbixEventId: string;
  severity: Severity;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  durationSeconds: number;
}

export interface DiscoveryRule {
  id: string;
  name: string;
  ipRange: string;
  interval: string;
  status: "active" | "disabled";
  nextScan: string | null;
}

export type WatchedEntityType =
  | "CONTAINER"
  | "SERVICE"
  | "PROCESS"
  | "NETWORK_DEVICE"
  | "NETWORK_INTERFACE"
  | "SYSTEM_METRIC";

export type TriggerStatus = "OK" | "PROBLEM" | "UNKNOWN";

export interface WatchKey {
  id: string;
  entityType: WatchedEntityType;
  entityName: string;
  entityMeta?: Record<string, unknown> | null;
}

export interface WatchedEntity {
  id: string;
  entityType: WatchedEntityType;
  entityName: string;
  entityMeta?: Record<string, unknown> | null;
  serverId: string;
  hostname: string;
  zabbixHostId: string;
  status: "ACTIVE" | "DISABLED";
  triggerStatus: {
    down: TriggerStatus;
    removed: TriggerStatus;
  };
  createdAt: string;
}

export interface WatchListResponse {
  watches: WatchedEntity[];
  total: number;
}
