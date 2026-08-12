/** Socket-driven live updates — background revalidation only, no polling. */
export const REALTIME_SWR = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  keepPreviousData: true,
  dedupingInterval: 5_000,
} as const;

/** @deprecated Use REALTIME_SWR — kept for existing imports. */
export const LIVE_SWR = REALTIME_SWR;

/** Server detail tabs — same socket-driven behavior. */
export const TAB_REFRESH = REALTIME_SWR;

/** Backend live sync interval (see RealtimeService.syncLiveData). */
export const LIVE_REFRESH_MS = 15_000;

/** True only on first fetch — not during background socket revalidation. */
export function isInitialLoad(isLoading: boolean, data: unknown): boolean {
  return isLoading && data === undefined;
}
