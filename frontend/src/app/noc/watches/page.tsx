"use client";

import { MyWatchesPanel } from "@/components/watch/MyWatchesPanel";

export default function NocWatchesPage() {
  return <MyWatchesPanel serversBasePath="/noc/servers" />;
}
