export const SERVER_OS_TYPES = [
  'ubuntu',
  'debian',
  'kali',
  'rhel',
  'windows',
  'other',
] as const;

export type ServerOsType = (typeof SERVER_OS_TYPES)[number];

const OS_LABELS: Record<ServerOsType, string> = {
  ubuntu: 'Ubuntu',
  debian: 'Debian',
  kali: 'Kali Linux',
  rhel: 'RHEL / Rocky / AlmaLinux',
  windows: 'Windows',
  other: 'Other (auto-detect)',
};

/** Map stored / legacy OS strings to an install family. */
export function normalizeServerOs(os: string | null | undefined): ServerOsType {
  const raw = (os ?? '').trim().toLowerCase();
  if (!raw) return 'ubuntu';

  if (raw === 'ubuntu' || raw.startsWith('ubuntu')) return 'ubuntu';
  if (raw === 'debian' || raw.startsWith('debian')) return 'debian';
  if (raw === 'kali' || raw.includes('kali')) return 'kali';
  if (
    raw === 'rhel' ||
    raw.startsWith('rhel') ||
    raw.includes('rocky') ||
    raw.includes('alma') ||
    raw.includes('centos')
  ) {
    return 'rhel';
  }
  if (raw === 'windows' || raw.includes('windows')) return 'windows';
  if (raw === 'other') return 'other';

  return 'other';
}

export function getServerOsLabel(os: string | null | undefined): string {
  return OS_LABELS[normalizeServerOs(os)];
}

export function buildInstallCommand(
  backendPublicUrl: string,
  installToken: string,
  os: string,
): string {
  const url = `${backendPublicUrl}/api/v1/servers/install/${installToken}`;
  if (normalizeServerOs(os) === 'windows') {
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '${url}' | iex"`;
  }
  return `curl -fsSL ${url} | sudo bash`;
}

export function isWindowsOs(os: string | null | undefined): boolean {
  return normalizeServerOs(os) === 'windows';
}
