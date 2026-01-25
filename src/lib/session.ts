// src/lib/session.ts
import "server-only";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export type TgSessionUser = {
  id: string; // telegram user id (string qilib saqlaymiz)
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

export type Session = {
  tg: TgSessionUser;
  iat: number; // created time (ms)
  role: string;
};

type JwtPayload = {
  sub: string;
  role: string;
  tg: TgSessionUser;
  iat: number;
  exp: number;
};

const COOKIE_NAME = "tfc_session";

function getSecretKey() {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function decodeSession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const p = payload as unknown as JwtPayload;
    return { tg: p.tg, iat: p.iat * 1000, role: p.role };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await decodeSession(token);
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.set(COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
}

export function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 kun
    },
  };
}
