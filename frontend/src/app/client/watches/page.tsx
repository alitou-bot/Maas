"use client";

import { MyWatchesPanel } from "@/components/watch/MyWatchesPanel";

export default function ClientWatchesPage() {
  return <MyWatchesPanel serversBasePath="/client/servers" />;
}
