export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTelegramConfig, telegramApi } from "@/lib/telegram";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tg?.id || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin huquqi kerak" }, { status: 403 });
  }

  try {
    const cfg = await getTelegramConfig();
    const body = await req.json().catch(() => ({}));
    const chat_id = String(body?.chat_id ?? cfg.defaultChatId ?? "").trim();
    if (!chat_id) return NextResponse.json({ ok: false, error: "Chat ID kiritilmagan" }, { status: 400 });
    const result = await telegramApi("sendMessage", {
      chat_id,
      text: "✅ League OS test xabari. Bot va kanal ulanishi ishlayapti.",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Telegram test error" }, { status: 500 });
  }
}
