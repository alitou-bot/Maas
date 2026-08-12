import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth-token";
import type { Role } from "@/types";

const PUBLIC = ["/login", "/forgot-password", "/reset-password"];

function roleHome(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin/dashboard";
    case "NOC_OPERATOR":
      return "/noc/dashboard";
    case "TENANT_ADMIN":
    case "CLIENT_VIEWER":
      return "/client/dashboard";
    default:
      return "/login";
  }
}

function allowedPrefix(role: Role): string {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "NOC_OPERATOR") return "/noc";
  return "/client";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js API routes through (session cookie helper, etc.)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const user = token ? verifyToken(token) : null;

  const isPublic = PUBLIC.some((p) => pathname === p);
  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".");

  if (isStatic) return NextResponse.next();

  if (!user && !isPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (isPublic || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = roleHome(user.role);
    return NextResponse.redirect(url);
  }

  if (user) {
    // Shared account pages are available to every authenticated role
    if (pathname.startsWith("/account")) {
      return NextResponse.next();
    }

    // Legacy admin network URL lived under /noc — keep bookmarks working
    if (
      user.role === "SUPER_ADMIN" &&
      pathname.startsWith("/noc/network")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace(/^\/noc\/network/, "/admin/network");
      return NextResponse.redirect(url);
    }

    const prefix = allowedPrefix(user.role);
    if (
      (pathname.startsWith("/admin") ||
        pathname.startsWith("/noc") ||
        pathname.startsWith("/client")) &&
      !pathname.startsWith(prefix)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = roleHome(user.role);
      return NextResponse.redirect(url);
    }

    if (user.role === "CLIENT_VIEWER" && pathname.startsWith("/client/team")) {
      const url = request.nextUrl.clone();
      url.pathname = "/client/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
