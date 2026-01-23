import { NextResponse } from "next/server";
import crypto from "crypto";
import { SignJWT } from "jose";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function getSessionSecret() {
  const s = process.env.SESSION_SECRET || "dev-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // 1. DEV LOGIN (Faqat localhostda ishlash uchun)
  if (process.env.NODE_ENV !== "production" && params.get("dev") === "true") {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: "dev-admin-id",
      role: "admin",
      tg: { id: "806860624", first_name: "Dev", last_name: "Admin", username: "dev_admin" },
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime("30d")
      .sign(getSessionSecret());

    const res = NextResponse.redirect(new URL("/admin", url.origin));
    res.cookies.set("tfc_session", token, { httpOnly: true, path: "/" });
    return res;
  }

  // 2. TELEGRAM LOGIN WIDGET VERIFICATION
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "Bot token missing" }, { status: 500 });

  const hash = params.get("hash");
  if (!hash) return NextResponse.json({ error: "Hash missing" }, { status: 400 });

  // Hash tekshirish
  const dataCheckArr: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") {
      dataCheckArr.push(`${key}=${value}`);
    }
  }
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (hmac !== hash) {
    return NextResponse.json({ error: "Hash mismatch" }, { status: 401 });
  }

  // 3. USERNI BAZAGA YOZISH
  const telegram_id = Number(params.get("id"));
  const username = params.get("username");
  const first_name = params.get("first_name");
  const last_name = params.get("last_name");
  const photo_url = params.get("photo_url");
  const full_name = [first_name, last_name].filter(Boolean).join(" ");

  // Rolni aniqlash
  const existing = await supabaseAdmin
    .from("app_users")
    .select("id, role")
    .eq("telegram_id", telegram_id)
    .maybeSingle();

  const role = existing.data?.role ?? "user";

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .upsert({
      telegram_id,
      telegram_username: username,
      full_name,
      role,
    }, { onConflict: "telegram_id" })
    .select("id")
    .single();

  if (error || !user) {
    console.error("Login upsert error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // 4. SESSION YARATISH
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sub: user.id,
    role,
    tg: { id: String(telegram_id), username, first_name, last_name, photo_url }
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime("30d")
    .sign(getSessionSecret());

  // 5. REDIRECT
  const target = role === "admin" ? "/admin" : "/tma/home";
  const res = NextResponse.redirect(new URL(target, url.origin));
  res.cookies.set("tfc_session", token, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 });
  
  return res;
}