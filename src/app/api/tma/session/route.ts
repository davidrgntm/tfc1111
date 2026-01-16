import { NextResponse } from "next/server";
import crypto from "crypto";
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

  const updateExistingUser = async (targetUserId: string, currentRole?: string | null) => {
    const roleToWrite =
      isAdminEnv && currentRole && currentRole !== "admin" ? "admin" : currentRole ?? "user";

    const upd = await supabaseAdmin
      .from("app_users")
      .update({
        telegram_username: username,
        full_name: fullName,
        role: roleToWrite,
        last_login_at: new Date().toISOString(),
      })
      .eq("id", targetUserId)
      .select("role")
      .single();

    if (upd.error) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { ok: false, error: "db_update_failed", details: upd.error.message },
          { status: 500 }
        ),
      };
    }

    return {
      ok: true as const,
      role: upd.data?.role ?? roleToWrite ?? currentRole ?? "user",
    };
  };

  if (existing.data?.id) {
    userId = existing.data.id;
    role = existing.data.role ?? "user";

    const updated = await updateExistingUser(userId, role);
    if (!updated.ok) return updated.response;

    role = updated.role;
  } else {
    // yangi user
    const roleToWrite = isAdminEnv ? "admin" : "user";

    const ins = await supabaseAdmin
      .from("app_users")
      .insert({
        id: crypto.randomUUID(),
        telegram_id: tgId,
        telegram_username: username,
        full_name: fullName,
        role: roleToWrite,
        last_login_at: new Date().toISOString(),
      })
      .select("id, role")
      .single();

    if (ins.error) {
      const isDuplicate =
        ins.error.code === "23505" || ins.error.message?.toLowerCase().includes("duplicate");

      if (isDuplicate) {
        const refetch = await supabaseAdmin
          .from("app_users")
          .select("id, role")
          .eq("telegram_id", tgId)
          .maybeSingle();

        if (refetch.error || !refetch.data?.id) {
          return NextResponse.json(
            { ok: false, error: "db_select_failed", details: refetch.error?.message },
            { status: 500 }
          );
        }

        userId = refetch.data.id;
        role = refetch.data.role ?? "user";

        const updated = await updateExistingUser(userId, role);
        if (!updated.ok) return updated.response;

        role = updated.role;
      } else {
        return NextResponse.json(
          { ok: false, error: "db_insert_failed", details: ins.error.message },
          { status: 500 }
        );
      }
    } else {
      userId = ins.data.id;
      role = ins.data.role ?? roleToWrite;
    }
  }

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
