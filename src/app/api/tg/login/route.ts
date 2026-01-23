import { NextResponse } from "next/server";
import crypto from "crypto";
import { SignJWT } from "jose";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function getSessionSecret() {
  const s = process.env.SESSION_SECRET || "dev-secret-change-me";
  if (!s) throw new Error("SESSION_SECRET missing");
  // jose kutubxonasi uchun Uint8Array kerak
  return new TextEncoder().encode(s);
}

// Telegram Login Widget yuboradigan kalitlar (boshqa parametrlar hashni buzmasligi uchun)
const TG_KEYS = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);

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
  if (!hash) {
    console.error("[TG_LOGIN] Hash parameter missing in URL");
    return { ok: false as const, error: "hash missing" };
  }

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    if (!TG_KEYS.has(key)) return; // Faqat Telegram parametrlarini olamiz
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  try {
    // Timing safe compare
    const a = Buffer.from(computed);
    const b = Buffer.from(hash);
    
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.error("[TG_LOGIN] Hash mismatch!");
      console.error(`Computed: ${computed}`);
      console.error(`Received: ${hash}`);
      console.error(`DataString: ${dataCheckString}`);
      return { ok: false as const, error: "hash mismatch" };
    }
  } catch (err) {
    console.error("[TG_LOGIN] Hash compare error:", err);
    return { ok: false as const, error: "hash format error" };
  }

  const authDate = Number(params.get("auth_date") || "0");
  if (!authDate) {
    console.error("[TG_LOGIN] auth_date missing");
    return { ok: false as const, error: "auth_date missing" };
  }

  // 24 soatdan eski bo‘lsa reject
  const now = Math.floor(Date.now() / 1000);
  const diff = now - authDate;
  
  if (diff > 86400) {
    console.error(`[TG_LOGIN] Expired. AuthDate: ${authDate}, Now: ${now}, Diff: ${diff}`);
    return { ok: false as const, error: "expired" };
  }

  return { ok: true as const };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // --- DEV LOGIN (Localhost only) ---
  if (process.env.NODE_ENV !== "production" && params.get("dev") === "true") {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: "dev-admin-id",
      role: "admin",
      tg: {
        id: "777000",
        first_name: "Dev",
        last_name: "Admin",
        username: "dev_admin",
      },
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60 * 24) // 1 kun
      .sign(getSessionSecret());

    const res = NextResponse.redirect(new URL("/admin", url.origin));
    res.cookies.set({
      name: "tfc_session",
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res;
  }
  // ----------------------------------

  // Tokenni tozalab olamiz (bo'sh joylar yoki qo'shtirnoqlar bo'lsa)
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim().replace(/^["']|["']$/g, "");
  
  if (!botToken) {
    console.error("[TG_LOGIN] TELEGRAM_BOT_TOKEN is missing in .env");
    return NextResponse.json({ ok: false, error: "bot token missing" }, { status: 500 });
  }

  const v = verifyTelegramLogin(params, botToken);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });

  const telegram_id = params.get("id"); // String sifatida olamiz
  const username = params.get("username");
  const first_name = params.get("first_name");
  const last_name = params.get("last_name");
  const photo_url = params.get("photo_url");

  if (!telegram_id) return NextResponse.json({ ok: false, error: "id missing" }, { status: 400 });

  const full_name = `${first_name ?? ""} ${last_name ?? ""}`.trim() || null;

  // 1) Avval user borligini tekshiramiz (rolni saqlab qolish uchun)
  const existing = await supabaseAdmin
    .from("app_users")
    .select("id, role")
    .eq("telegram_id", Number(telegram_id)) // DB da bigint/int bo'lsa numberga o'tkazamiz
    .maybeSingle();

  const roleToSave = existing.data?.role ?? "user";

  const up = await supabaseAdmin
    .from("app_users")
    .upsert(
      {
        telegram_id: Number(telegram_id),
        telegram_username: username ?? null,
        full_name,
        role: roleToSave,
      },
      { onConflict: "telegram_id" }
    )
    .select("id,role")
    .single();

  if (up.error || !up.data) {
    console.error("[TG_LOGIN] DB Upsert Error:", up.error);
    return NextResponse.json(
      { ok: false, error: "db_upsert_failed", details: up.error?.message },
      { status: 500 }
    );
  }

  const appUserId = up.data.id as string;
  const role = up.data.role as string;

  // create session cookie
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sub: appUserId,
    role,
    tg: {
      id: telegram_id,
      username: username ?? undefined,
      first_name: first_name ?? undefined,
      last_name: last_name ?? undefined,
      photo_url: photo_url ?? undefined,
    },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime("30d")
    .sign(getSessionSecret());

  // redirect to /admin if admin, else /tma/home
  const target = role === "admin" ? "/admin" : "/tma/home";
  const res = NextResponse.redirect(new URL(target, url.origin));
  
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
