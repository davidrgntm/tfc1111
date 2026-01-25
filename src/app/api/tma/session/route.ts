import { NextResponse } from "next/server";
import crypto from "crypto";
import { SignJWT } from "jose";
import { verifyTelegramWebAppInitData } from "../../../../lib/telegram-webapp";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";

function uuidToBytes(uuid: string) {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}
function bytesToUuid(buf: Buffer) {
  const hex = buf.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
function uuidv5(name: string, namespaceUuid: string) {
  const ns = uuidToBytes(namespaceUuid);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = crypto.createHash("sha1").update(Buffer.concat([ns, nameBytes])).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return bytesToUuid(hash.subarray(0, 16));
}

const TG_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

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

  // Tokenni tozalaymiz
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim().replace(/^[<"']+|[>"']+$/g, "");
  const v = verifyTelegramWebAppInitData(initData || "", botToken);

  if (!v.ok || !v.user) {
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
  const userIdToWrite = uuidv5(`tg:${tgId}`, TG_NAMESPACE);
  const upsertPayload: {
    id?: string;
    telegram_id: number;
    telegram_username: string | null;
    full_name: string | null;
    role: string;
    last_login_at: string;
  } = {
    telegram_id: tgId,
    telegram_username: username,
    full_name: fullName,
    role: roleToWrite,
    last_login_at: new Date().toISOString(),
  };

  if (!existing.data?.id) {
    upsertPayload.id = userIdToWrite;
  }

  const up = await (supabaseAdmin.from("app_users") as any)
    .upsert(upsertPayload, { onConflict: "telegram_id" })
    .select("id, role")
    .single();

  let warning: string | null = null;
  if (up.error || !up.data?.id) {
    console.error("tma_session_upsert_failed", up.error);
    warning = up.error?.message ?? "db_upsert_failed";
    userId = existing.data?.id ?? userIdToWrite;
    role = existing.data?.role ?? roleToWrite;
  } else {
    userId = up.data.id;
    role = up.data.role ?? roleToWrite;
  }

  // 2) jwt session
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30; // 30 kun

  const token = await new SignJWT({
    sub: userId,
    role,
    tg: {
      id: String(tgId),
      username: username ?? undefined,
      first_name: v.user.first_name ?? undefined,
      last_name: v.user.last_name ?? undefined,
    },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey());

  const res = NextResponse.json({ ok: true, role, warning });

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
