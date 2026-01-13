// src/app/api/tma/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { verifyTelegramInitData } from "@/lib/tg/verifyInitData";
import { upsertTelegramUser } from "@/lib/tg/upsertTelegramUser";

const COOKIE_NAME = "tfc_session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const initData = body?.initData as string | undefined;

    if (!initData) {
      return NextResponse.json({ ok: false, error: "initData yo‘q" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.SESSION_SECRET;

    if (!botToken) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN yo‘q" }, { status: 500 });
    if (!secret) return NextResponse.json({ ok: false, error: "SESSION_SECRET yo‘q" }, { status: 500 });

    // 1) initData verify
    const verified = await verifyTelegramInitData(initData, botToken);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, error: "initData verify xato", details: verified.error }, { status: 401 });
    }

    // 2) user parse
    const sp = new URLSearchParams(initData);
    const userJson = sp.get("user");
    if (!userJson) return NextResponse.json({ ok: false, error: "initData user yo‘q" }, { status: 400 });

    const u = JSON.parse(userJson);

    const tg = {
      id: String(u.id),
      username: u.username ?? null,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      photo_url: u.photo_url ?? null,
    };

    // 3) DB upsert (profiles)
    const appUser = await upsertTelegramUser(tg);

    // 4) JWT session
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      typ: "tfc_session",
      role: "user",
      appUserId: appUser.id,
      tg,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(key);

    // 5) cookie
    const c = await cookies();
    c.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ ok: true, appUserId: appUser.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "server error" }, { status: 500 });
  }
}
