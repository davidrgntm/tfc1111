import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Admin yo'llarini himoyalaymiz
const ADMIN_PATHS = ["/admin"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdminPath = ADMIN_PATHS.some((p) => path.startsWith(p));

  if (!isAdminPath) {
    return NextResponse.next();
  }

  const token = req.cookies.get("tfc_session")?.value;

  if (!token) {
    // Token yo'q bo'lsa, Home ga otamiz
    return NextResponse.redirect(new URL("/", req.url));
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.SESSION_SECRET || "dev-secret-change-me"
    );
    const { payload } = await jwtVerify(token, secret);

    // Role tekshirish
    if (payload.role !== "admin") {
      // User login qilgan, lekin admin emas
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  } catch (e) {
    // Token yaroqsiz
    return NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = {
  // Faqat admin yo'llarida ishlasin (optimallashtirish)
  matcher: ["/admin/:path*"],
};