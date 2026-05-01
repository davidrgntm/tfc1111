export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTelegramConfig, telegramApi } from "@/lib/telegram";

export async function GET() {
  const session = await getSession();
  if (!session?.tg?.id || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin huquqi kerak" }, { status: 403 });
  }

  try {
    const cfg = await getTelegramConfig();
    const bot = cfg.token ? await telegramApi("getMe") : null;
    return NextResponse.json({ ok: true, config: { hasToken: Boolean(cfg.token), defaultChatId: cfg.defaultChatId, botUsername: cfg.botUsername }, bot });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Telegram status error" }, { status: 500 });
  }
}
