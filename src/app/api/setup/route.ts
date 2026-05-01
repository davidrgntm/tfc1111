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
  const setupSecret = (process.env.SETUP_SECRET || "").trim();
  const provided = (req.headers.get("x-setup-secret") || "").trim();

  if (setupSecret && provided === setupSecret) return true;
  if (summary.admins === 0 && !setupSecret) return true;

  return false;
}

function cleanUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "");
}

async function must<T>(result: { data: T | null; error: { message: string } | null }, action: string) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data;
}

export async function GET() {
  try {
    const summary = await appSummary();
    const publicSettings = await getSettingsMap(false);

    return NextResponse.json({
      ok: true,
      summary,
      settings: publicSettings,
      needsSetup: summary.admins === 0,
      hasSetupSecret: Boolean(process.env.SETUP_SECRET),
    });
  } catch (e: any) {
    console.error("SETUP_GET_FAILED", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Setup GET failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const allowed = await canWrite(req);

    if (!allowed) {
      const summary = await appSummary();
      return NextResponse.json(
        {
          ok: false,
          error: "SETUP_SECRET noto‘g‘ri yoki admin login kerak",
          debug: {
            admins: summary.admins,
            hasSetupSecret: Boolean(process.env.SETUP_SECRET),
            providedSecretLength: (req.headers.get("x-setup-secret") || "").length,
          },
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => {
      throw new Error("Body JSON noto‘g‘ri yuborildi");
    });

    const settings = body?.settings ?? {};

    const normalizedSettings: Record<string, string> = {
      app_name: String(settings.app_name ?? "League OS").trim(),
      app_subtitle: String(settings.app_subtitle ?? "").trim(),
      brand_primary: String(settings.brand_primary ?? "#22c55e").trim(),
      brand_secondary: String(settings.brand_secondary ?? "#0ea5e9").trim(),
      timezone: String(settings.timezone ?? "Asia/Tashkent").trim(),
      default_language: String(settings.default_language ?? "uz").trim(),
      support_contact: String(settings.support_contact ?? "").trim(),
      telegram_bot_username: String(settings.telegram_bot_username ?? "").replace(/^@/, "").trim(),
      telegram_bot_token: String(settings.telegram_bot_token ?? "").trim(),
      telegram_default_chat_id: String(settings.telegram_default_chat_id ?? "").trim(),
      site_url: cleanUrl(settings.site_url ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""),
    };

    for (const [key, value] of Object.entries(normalizedSettings)) {
      await upsertSetting(key, value, !PRIVATE_KEYS.has(key));
    }

    const channelTitle = String(body?.channel?.title ?? "Main channel").trim();
    const channelChatId = normalizedSettings.telegram_default_chat_id;

    if (channelChatId) {
      const existing = await must(
        dbAdmin.from("telegram_channels").select("id").eq("chat_id", channelChatId).maybeSingle(),
        "Telegram kanalni tekshirish"
      );

      if ((existing as any)?.id) {
        await must(
          dbAdmin
            .from("telegram_channels")
            .update({
              title: channelTitle,
              chat_id: channelChatId,
              is_active: 1,
              is_default: 1,
            })
            .eq("id", (existing as any).id),
          "Telegram kanalni yangilash"
        );
      } else {
        await must(
          dbAdmin.from("telegram_channels").insert({
            title: channelTitle,
            chat_id: channelChatId,
            is_active: 1,
            is_default: 1,
          }),
          "Telegram kanalni qo‘shish"
        );
      }
    }

    const adminTgIdRaw = String(body?.adminTelegramId ?? "").trim();

    if (adminTgIdRaw) {
      const telegram_id = Number(adminTgIdRaw);
      if (!Number.isFinite(telegram_id)) throw new Error("Admin Telegram ID noto‘g‘ri");

      await must(
        dbAdmin.from("app_users").upsert(
          {
            telegram_id,
            full_name: "Owner",
            role: "admin",
            last_login_at: new Date().toISOString(),
          },
          { onConflict: "telegram_id" }
        ),
        "Admin foydalanuvchini yaratish"
      );
    }

    const summary = await appSummary();

    return NextResponse.json({
      ok: true,
      summary,
      settings: await getSettingsMap(false),
    });
  } catch (e: any) {
    console.error("SETUP_POST_FAILED", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Setup error",
      },
      { status: 500 }
    );
  }
}