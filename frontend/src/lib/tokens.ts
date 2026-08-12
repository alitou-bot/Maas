export const ACCESS_KEY = "maas_access_token";
export const REFRESH_KEY = "maas_refresh_token";
export const AUTH_COOKIE = "maas_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

/** Persist tokens for API calls + sync httpOnly cookie for middleware. */
export async function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
}

export async function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  try {
    await fetch("/api/session", { method: "DELETE" });
  } catch {
    /* ignore */
  }
}
