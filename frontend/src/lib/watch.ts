import type { Role } from "@/types";

export function canUseWatch(role: Role | undefined): boolean {
  return role !== undefined && role !== "NOC_OPERATOR";
}
