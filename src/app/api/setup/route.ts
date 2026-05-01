export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { appSummary, getSettingsMap, upsertSetting } from "@/lib/db";
import { dbAdmin } from "@/lib/local/admin";

const PRIVATE_KEYS = new Set(["telegram_bot_token"]);

async function canWrite(req: Request) {
  const session = await getSession();
  if (session?.role === "admin") return true;
  const summary = await appSummary();
  const setupSecret = process.env.SETUP_SECRET || "";
  const provided = req.headers.get("x-setup-secret") || "";
  if (summary.admins === 0 && (!setupSecret || provided === setupSecret)) return true;
  return false;
}

export async function GET() {
  const summary = await appSummary();
  const publicSettings = await getSettingsMap(false);
  return NextResponse.json({ ok: true, summary, settings: publicSettings, needsSetup: summary.admins === 0 });
}

export async function POST(req: Request) {
  if (!(await canWrite(req))) {
    return NextResponse.json({ ok: false, error: "Setup uchun admin login yoki SETUP_SECRET kerak" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const settings = body?.settings ?? {};
    const keys = [
      "app_name",
      "app_subtitle",
      "brand_primary",
      "brand_secondary",
      "timezone",
      "default_language",
      "support_contact",
      "telegram_bot_username",
      "telegram_bot_token",
      "telegram_default_chat_id",
      "site_url",
    ];

    for (const key of keys) {
      if (settings[key] !== undefined) {
        await upsertSetting(key, String(settings[key] ?? ""), !PRIVATE_KEYS.has(key));
      }
    }

    const channelTitle = String(body?.channel?.title ?? "Main channel").trim();
    const channelChatId = String(body?.channel?.chat_id ?? settings.telegram_default_chat_id ?? "").trim();
    if (channelChatId) {
      const existing = await dbAdmin.from("telegram_channels").select("id").eq("chat_id", channelChatId).maybeSingle();
      if (existing.data?.id) {
        await dbAdmin.from("telegram_channels").update({ title: channelTitle, is_active: 1, is_default: 1 }).eq("id", existing.data.id);
      } else {
        await dbAdmin.from("telegram_channels").insert({ title: channelTitle, chat_id: channelChatId, is_active: 1, is_default: 1 });
      }
    }

    const adminTgId = String(body?.adminTelegramId ?? "").trim();
    if (adminTgId) {
      const telegram_id = Number(adminTgId);
      if (!Number.isFinite(telegram_id)) throw new Error("Admin Telegram ID noto‘g‘ri");
      await dbAdmin.from("app_users").upsert({ telegram_id, full_name: "Owner", role: "admin", last_login_at: new Date().toISOString() }, { onConflict: "telegram_id" });
    }

    const summary = await appSummary();
    return NextResponse.json({ ok: true, summary, settings: await getSettingsMap(false) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Setup error" }, { status: 500 });
  }
}
