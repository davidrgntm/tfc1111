import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "tfc_session";

async function verifySession(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    // @ts-ignore
    if (payload?.typ !== "tfc_session") return null;
    // @ts-ignore
    if (!payload?.tg?.id) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;

  // session yaratish endpointini bloklamaymiz
  if (p === "/api/tma/session") return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });

  const payload = await verifySession(token);
  if (!payload) {
    const res = NextResponse.json({ ok: false, error: "bad_session" }, { status: 401 });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/tma/:path*"], // ✅ faqat API himoyalanadi
};
