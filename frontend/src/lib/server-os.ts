export const SERVER_OS_OPTIONS = [
  { value: "ubuntu", label: "Ubuntu" },
  { value: "debian", label: "Debian" },
  { value: "kali", label: "Kali Linux" },
  { value: "rhel", label: "RHEL / Rocky / AlmaLinux" },
  { value: "windows", label: "Windows" },
  { value: "other", label: "Other (auto-detect)" },
] as const;

export type ServerOsValue = (typeof SERVER_OS_OPTIONS)[number]["value"];

/** Match stored OS (including legacy version strings) to a dropdown value. */
export function normalizeServerOsValue(os: string | null | undefined): ServerOsValue {
  const raw = (os ?? "").trim().toLowerCase();
  if (!raw) return "ubuntu";
  if (raw === "ubuntu" || raw.startsWith("ubuntu")) return "ubuntu";
  if (raw === "debian" || raw.startsWith("debian")) return "debian";
  if (raw === "kali" || raw.includes("kali")) return "kali";
  if (
    raw === "rhel" ||
    raw.startsWith("rhel") ||
    raw.includes("rocky") ||
    raw.includes("alma") ||
    raw.includes("centos")
  ) {
    return "rhel";
  }
  if (raw === "windows" || raw.includes("windows")) return "windows";
  if (raw === "other") return "other";
  return "other";
}

export function isWindowsOs(os: string | null | undefined): boolean {
  return normalizeServerOsValue(os) === "windows";
}
