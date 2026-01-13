// src/lib/session.ts
import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

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
};

const COOKIE_NAME = "tfc_session";

function b64urlEncode(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecodeToString(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function hmac(data: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  return b64urlEncode(crypto.createHmac("sha256", secret).update(data).digest());
}

export function encodeSession(session: Session) {
  const payload = b64urlEncode(JSON.stringify(session));
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function decodeSession(token: string): Session | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = hmac(payload);
  // timing safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const json = b64urlDecodeToString(payload);
    const s = JSON.parse(json) as Session;
    if (!s?.tg?.id) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSession(token);
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
