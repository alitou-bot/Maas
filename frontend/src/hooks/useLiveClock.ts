"use client";

import { useEffect, useState } from "react";
import { LIVE_REFRESH_MS } from "@/lib/live";

/** Advances on an interval so relative time windows (from/to) stay current. */
export function useLiveClock(intervalMs: number = LIVE_REFRESH_MS) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
