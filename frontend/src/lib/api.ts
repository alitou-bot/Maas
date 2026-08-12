import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./tokens";

/** Prefer the hostname the UI was opened with so install URLs track IP changes. */
export function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
}

export const API_BASE = resolveApiBase();

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = resolveApiBase();
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${resolveApiBase()}/auth/refresh`, {
      refreshToken,
    });
    await setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    await clearTokens();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (
          !path.startsWith("/login") &&
          !path.startsWith("/forgot") &&
          !path.startsWith("/reset")
        ) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown, fallback = "Request failed") {
  const err = error as {
    response?: { data?: { message?: string | string[]; error?: string } };
  };
  const msg = err.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  return err.response?.data?.error || fallback;
}

export const swrFetcher = <T = unknown>(url: string) =>
  api.get<T>(url).then((r) => r.data);

export async function downloadSlaReport(reportId: string, filename?: string) {
  const response = await api.get(`/sla/reports/${reportId}/download`, {
    responseType: "blob",
  });
  const disposition = response.headers["content-disposition"] as
    | string
    | undefined;
  const match = disposition?.match(/filename="([^"]+)"/);
  const name = filename || match?.[1] || `sla-report-${reportId}`;
  const blob = new Blob([response.data], {
    type:
      (response.headers["content-type"] as string) || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
