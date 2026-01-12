// src/lib/session.ts
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export type TgUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type AppSession = {
  tg?: TgUser;
  role?: "admin" | "user";
};

const COOKIE_NAME = "tfc_session";

// .env.local va Vercel env’da bo‘lishi shart
const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "");

function assertSecret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing in env");
  }
}

export async function getSession(): Promise<AppSession | null> {
  assertSecret();
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AppSession;
  } catch {
    return null;
  }
}

// Faqat Route Handler / Server Action’da ishlat (page.tsx ichida set qilib bo‘lmaydi)
export async function setSession(data: AppSession) {
  assertSecret();
  const token = await new SignJWT(data as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const c = await cookies();
  c.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
