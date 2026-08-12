"use client";

import { useEffect } from "react";
import { AppShell, clientNav } from "@/components/layout/AppShell";
import { useAuth } from "@/providers/AuthProvider";
import { clearTokens } from "@/lib/tokens";
import { Skeleton } from "@/components/ui/EmptyState";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    void (async () => {
      await clearTokens();
      window.location.href = "/login";
    })();
  }, [loading, user]);

  if (loading || !user) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <AppShell nav={clientNav(user.role)}>{children}</AppShell>;
}
