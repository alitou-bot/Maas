import type { AuthUser, Role } from "@/types";

export const AUTH_COOKIE = "maas_token";

/** Decode NestJS JWT payload (routing only; API verifies signature). */
export function verifyToken(rawToken: string): AuthUser | null {
  try {
    // Cookie may be URI-encoded depending on how it was set
    let token = rawToken;
    try {
      token = decodeURIComponent(rawToken);
    } catch {
      token = rawToken;
    }

    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    let jsonStr: string;
    if (typeof atob === "function") {
      jsonStr = atob(padded);
    } else if (typeof Buffer !== "undefined") {
      jsonStr = Buffer.from(padded, "base64").toString("utf8");
    } else {
      return null;
    }

    const json = JSON.parse(jsonStr) as {
      sub?: string;
      email?: string;
      role?: Role;
      tenantId?: string | null;
      exp?: number;
    };

    if (!json.sub || !json.role) return null;
    if (json.exp && json.exp * 1000 < Date.now()) return null;

    return {
      id: json.sub,
      email: json.email || "",
      role: json.role,
      tenantId: json.tenantId ?? null,
      firstName: "",
      lastName: "",
    };
  } catch {
    return null;
  }
}
