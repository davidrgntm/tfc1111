import { NextResponse } from "next/server";
import crypto from "crypto";
import { SignJWT } from "jose";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET missing");
  return new TextEncoder().encode(s);
}

/**
 * Telegram login verification:
 * - take all fields except hash
 * - sort by key
 * - join as "key=value\n"
 * - secret = sha256(bot_token)
 * - computed_hash = HMAC_SHA256(data_check_string, secret)
 */
function verifyTelegramLogin(params: URLSearchParams, botToken: string) {
  const hash = params.get("hash");
  if (!hash) return { ok: false as const, error: "hash missing" };

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return { ok: false as const, error: "hash mismatch" };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false as const, error: "hash mismatch" };

  const authDate = Number(params.get("auth_date") || "0");
  if (!authDate) return { ok: false as const, error: "auth_date missing" };

  // ixtiyoriy: 24 soatdan eski bo‘lsa reject
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 24 * 60 * 60) return { ok: false as const, error: "expired" };

  return { ok: true as const };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!botToken) return NextResponse.json({ ok: false, error: "bot token missing" }, { status: 500 });

  const v = verifyTelegramLogin(params, botToken);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });

  const telegram_id = Number(params.get("id") || "0");
  const username = params.get("username");
  const first_name = params.get("first_name");
  const last_name = params.get("last_name");

  if (!telegram_id) return NextResponse.json({ ok: false, error: "id missing" }, { status: 400 });

  const full_name = `${first_name ?? ""} ${last_name ?? ""}`.trim() || null;

  // app_users upsert
  const up = await supabaseAdmin
    .from("app_users")
    .upsert(
      {
        telegram_id,
        telegram_username: username ?? null,
        full_name,
        role: "user",
      },
      { onConflict: "telegram_id" }
    )
    .select("id,role")
    .single();

  if (up.error || !up.data) {
    return NextResponse.json(
      { ok: false, error: "db_upsert_failed", details: up.error?.message },
      { status: 500 }
    );
  }

  const appUserId = up.data.id as string;
  const role = up.data.role as string;

  // create session cookie
  const token = await new SignJWT({ typ: "tfc_session", appUserId, telegramId: telegram_id, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  // redirect to /tma/home yoki /me
  const res = NextResponse.redirect(new URL("/tma/home", url.origin));
  res.cookies.set({
    name: "tfc_session",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
