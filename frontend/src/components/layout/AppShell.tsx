"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Moon,
  Server,
  Settings,
  ShieldAlert,
  Sun,
  Star,
  Users,
  CreditCard,
  KeyRound,
  UserCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { cn, timeAgo } from "@/lib/utils";
import type { NotificationInbox, Role } from "@/types";
import { StatusDot } from "@/components/ui/Badge";
import useSWR, { mutate } from "swr";
import { api, swrFetcher } from "@/lib/api";
import { LIVE_SWR } from "@/lib/live";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function adminNav(): NavItem[] {
  return [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/tenants", label: "Tenants", icon: Building2 },
    { href: "/admin/users", label: "Users", icon: Users },

    { href: "/admin/plans", label: "Subscription plans", icon: CreditCard },
    { href: "/admin/settings", label: "System settings", icon: Settings },
    { href: "/admin/audit-logs", label: "Audit logs", icon: ClipboardList },
  ];
}

export function nocNav(): NavItem[] {
  return [
    { href: "/noc/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/noc/incidents", label: "Incidents", icon: ShieldAlert },
    { href: "/noc/servers", label: "Servers", icon: Server },
    { href: "/noc/alerts", label: "Alerts", icon: Activity },
    { href: "/noc/watches", label: "My Watches", icon: Star },
    { href: "/noc/sla", label: "SLA reports", icon: FileBarChart },
  ];
}

export function clientNav(role: Role): NavItem[] {
  const items: NavItem[] = [
    { href: "/client/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/client/servers", label: "My servers", icon: Server },
    { href: "/client/incidents", label: "Incidents", icon: ShieldAlert },
    { href: "/client/watches", label: "My Watches", icon: Star },
    { href: "/client/sla", label: "SLA & reports", icon: FileBarChart },
  ];
  if (role === "TENANT_ADMIN") {
    items.push({ href: "/client/team", label: "Team", icon: Users });
  }
  items.push({ href: "/client/settings", label: "Settings", icon: Settings });
  return items;
}

export function navForRole(role: Role): NavItem[] {
  if (role === "SUPER_ADMIN") return adminNav();
  if (role === "NOC_OPERATOR") return nocNav();
  return clientNav(role);
}

function breadcrumbFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((p, i) => ({
    label: p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "),
    href: "/" + parts.slice(0, i + 1).join("/"),
  }));
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border-subtle bg-surface-raised">
      <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg font-bold text-sm">
          Z
        </div>
        <div>
          <p className="text-sm font-bold text-text-primary leading-tight">MAAS</p>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">by ZTC</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer",
                active
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const visible = items.slice(0, 5);
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border-subtle bg-surface-raised/95 backdrop-blur">
      <ul className="flex items-stretch justify-around">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium cursor-pointer",
                  active ? "text-accent" : "text-text-muted"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[4.5rem]">{item.label.split(" ")[0]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, mutate: refreshInbox } = useSWR<NotificationInbox>(
    "/notifications/inbox",
    swrFetcher,
    LIVE_SWR
  );
  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;
  const viewAllHref =
    user?.role === "SUPER_ADMIN"
      ? "/admin/dashboard"
      : user?.role === "NOC_OPERATOR"
        ? "/noc/incidents"
        : "/client/incidents";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-text-secondary hover:bg-surface-overlay hover:text-text-primary transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-down px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border-subtle bg-surface-raised shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <p className="text-sm font-semibold">Open incidents</p>
            <button
              type="button"
              className="text-xs text-accent cursor-pointer hover:underline disabled:opacity-50"
              disabled={marking || unread === 0}
              onClick={async () => {
                setMarking(true);
                try {
                  await api.post("/notifications/read-all");
                  await refreshInbox();
                  void mutate(
                    (key) =>
                      typeof key === "string" && key.includes("/notifications/inbox")
                  );
                } finally {
                  setMarking(false);
                }
              }}
            >
              Mark all as read
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-text-muted">
                No open incidents
              </li>
            )}
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex gap-3 border-b border-border-subtle px-4 py-3 last:border-0",
                  !n.read && "bg-accent-muted/30"
                )}
              >
                <StatusDot
                  status={
                    n.severity === "CRITICAL"
                      ? "critical"
                      : n.severity === "WARNING"
                        ? "warn"
                        : "ok"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{n.title}</p>
                  <p className="text-xs text-text-muted">{timeAgo(n.openedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border-subtle px-4 py-2 text-center">
            <Link
              href={viewAllHref}
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;
  const initials = `${user.firstName[0]}${user.lastName[0]}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-surface-overlay transition-colors cursor-pointer"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-xs font-bold text-accent">
          {initials}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border-subtle bg-surface-raised shadow-xl z-50 py-1"
        >
          <div className="border-b border-border-subtle px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-text-muted truncate">{user.email}</p>
          </div>
          <Link
            href="/account/profile"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-overlay cursor-pointer"
            onClick={() => setOpen(false)}
          >
            <UserCircle className="h-4 w-4" /> Profile
          </Link>
          <Link
            href="/account/password"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-overlay cursor-pointer"
            onClick={() => setOpen(false)}
          >
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-status-down hover:bg-surface-overlay cursor-pointer"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const crumbs = breadcrumbFromPath(pathname);
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface-raised/90 px-4 backdrop-blur">
      <div className="flex md:hidden items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg text-xs font-bold">
          Z
        </div>
        <span className="font-bold text-sm">MAAS</span>
      </div>

      <nav className="hidden sm:flex flex-1 items-center justify-center gap-1 text-sm text-text-muted min-w-0">
        {crumbs.map((c, i) => (
          <span key={c.href} className="inline-flex items-center gap-1 truncate">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            <Link
              href={c.href}
              className={cn(
                "truncate hover:text-text-primary transition-colors cursor-pointer",
                i === crumbs.length - 1 && "text-text-primary font-medium"
              )}
            >
              {c.label}
            </Link>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-overlay hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

export function AppShell({
  children,
  nav,
}: {
  children: React.ReactNode;
  nav: NavItem[];
}) {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <Sidebar items={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
