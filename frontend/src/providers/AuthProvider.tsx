"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSWR from "swr";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import { clearTokens, getAccessToken, setTokens } from "@/lib/tokens";
import { roleHome } from "@/lib/utils";
import type { AuthUser } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; redirect?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(!!getAccessToken());
    setReady(true);
  }, []);

  const { data, isLoading, mutate, error } = useSWR<AuthUser>(
    ready && hasToken ? "/auth/me" : null,
    swrFetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );

  // If /auth/me fails while we thought we were logged in, drop the session
  // cookie too — otherwise middleware keeps bouncing us off /login.
  useEffect(() => {
    if (!ready || !hasToken || !error) return;
    let cancelled = false;
    void (async () => {
      await clearTokens();
      if (!cancelled) {
        setHasToken(false);
        await mutate(undefined, false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, hasToken, error, mutate]);

  const user = error || !hasToken ? null : data ?? null;

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { data: res } = await api.post("/auth/login", { email, password });
        await setTokens(res.accessToken, res.refreshToken);
        setHasToken(true);
        await mutate(res.user, false);
        return { ok: true as const, redirect: roleHome(res.user.role) };
      } catch (e: unknown) {
        return {
          ok: false as const,
          error: apiErrorMessage(e, "Invalid email or password"),
        };
      }
    },
    [mutate]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    await clearTokens();
    setHasToken(false);
    await mutate(undefined, false);
    window.location.href = "/login";
  }, [mutate]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: !ready || (hasToken && isLoading),
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
