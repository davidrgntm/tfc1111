import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PREFIXES = ["/admin", "/api/telegram"];

function isProtected(path: string) {
  return PROTECTED_PREFIXES.some((p) => path.startsWith(p));
}

function isApi(path: string) {
  return path.startsWith("/api/");
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!isProtected(path)) return NextResponse.next();

  const token = req.cookies.get("tfc_session")?.value;
  const fail = (message: string, status = 401) => {
    if (isApi(path)) return NextResponse.json({ ok: false, error: message }, { status });
    return NextResponse.redirect(new URL("/login", req.url));
  };

  if (!token) return fail("Login kerak", 401);

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "admin") return fail("Admin huquqi kerak", 403);
    return NextResponse.next();
  } catch {
    return fail("Session yaroqsiz", 401);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/telegram/:path*"],
};
