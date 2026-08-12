"use client";

import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/api";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        keepPreviousData: true,
        dedupingInterval: 5_000,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
