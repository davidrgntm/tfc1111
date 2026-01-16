import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { verifyTelegramInitData } from "@/lib/tg/verifyInitData";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET missing");
  return new TextEncoder().encode(s);
}

function adminIdsFromEnv(): string[] {
  const raw = process.env.ADMIN_TG_IDS || "";
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const initData = body?.initData as string | undefined;

  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const v = verifyTelegramInitData(initData || "", botToken);

  if (!("ok" in v) || v.ok !== true) {
    return NextResponse.json(
      { ok: false, error: (v as any).error ?? "verify_failed" },
      { status: 401 }
    );
  }

  const tgId = v.user.id;
  const username = v.user.username ?? null;
  const fullName = `${v.user.first_name ?? ""} ${v.user.last_name ?? ""}`.trim() || null;

  // 1) avval mavjud user bor-yo‘qligini tekshiramiz
  const existing = await supabaseAdmin
    .from("app_users")
    .select("id, role")
    .eq("telegram_id", tgId)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json(
      { ok: false, error: "db_select_failed", details: existing.error.message },
      { status: 500 }
    );
  }

  const envAdmins = adminIdsFromEnv();
  const isAdminEnv = envAdmins.includes(String(tgId));

  let userId: string;
  let role: string;

  const roleToWrite = isAdminEnv ? "admin" : existing.data?.role ?? "user";

  const up = await supabaseAdmin
    .from("app_users")
    .upsert(
      {
        telegram_id: tgId,
        telegram_username: username,
        full_name: fullName,
        role: roleToWrite,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" }
    )
    .select("id, role")
    .single();

  if (up.error || !up.data?.id) {
    return NextResponse.json(
      { ok: false, error: "db_upsert_failed", details: up.error?.message },
      { status: 500 }
    );
  }

  userId = up.data.id;
  role = up.data.role ?? roleToWrite;

  // 2) jwt session
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30; // 30 kun

  const token = await new SignJWT({
    sub: userId,
    role,
    tg: {
      id: tgId,
      username: username ?? undefined,
      first_name: v.user.first_name ?? undefined,
      last_name: v.user.last_name ?? undefined,
    },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey());

  const res = NextResponse.json({ ok: true, role });

  // agar iPhone Telegram’da “no session” qolaversa:
  // sameSite: "none" qilib ko‘rasiz (secure bo‘lishi shart)
  res.cookies.set({
    name: "tfc_session",
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
