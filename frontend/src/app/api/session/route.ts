import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-token";

/**
 * Secure cookies only work over HTTPS. Local Docker serves http://localhost,
 * so default to false unless COOKIE_SECURE=true is set explicitly.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.COOKIE_SECURE === "true",
  };
}

/** Store Nest access JWT in an httpOnly cookie for Next.js middleware. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: string;
  } | null;
  const accessToken = body?.accessToken;
  if (!accessToken || typeof accessToken !== "string") {
    return NextResponse.json({ error: "accessToken required" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, accessToken, {
    ...cookieOptions(),
    maxAge: 8 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  // Clear both Secure and non-Secure variants so an old cookie cannot stick.
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 0,
  });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: 0,
  });
  return res;
}
