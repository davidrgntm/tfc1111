// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "tfc_session";

async function verifySession(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    // minimal check
    if (payload?.typ !== "tfc_session") return null;
    // @ts-ignore
    if (!payload?.tg?.id) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  // session yaratish endpointini bloklamaymiz
  if (pathname.startsWith("/api/tma/session")) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    // TMA’ni faqat Telegram ichida ishlatamiz
    if (pathname.startsWith("/tma")) {
      url.pathname = "/tma";
      url.searchParams.set("e", "no_session");
      return NextResponse.redirect(url);
    }
    return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
  }

  const payload = await verifySession(token);
  if (!payload) {
    const res = NextResponse.redirect(new URL("/tma?e=bad_session", req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/tma/:path*", "/api/tma/:path*"],
};
