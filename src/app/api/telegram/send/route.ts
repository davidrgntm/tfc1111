export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { dbAdmin } from "@/lib/local/admin";
import { getTelegramConfig, telegramApi } from "@/lib/telegram";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tg?.id || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin huquqi kerak" }, { status: 403 });
  }

  try {
    const cfg = await getTelegramConfig();
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? body?.body ?? "").trim();
    const target = String(body?.target ?? "channel").trim();
    const chat_id = String(body?.chat_id ?? cfg.defaultChatId ?? "").trim();
    const parse_mode = body?.parse_mode ?? "HTML";
    const disable_web_page_preview = body?.disable_web_page_preview ?? true;
    const title = String(body?.title ?? "Telegram announcement").trim();

    if (!cfg.token) return NextResponse.json({ ok: false, error: "Bot token kiritilmagan" }, { status: 400 });
    if (!text) return NextResponse.json({ ok: false, error: "Matn bo‘sh" }, { status: 400 });

    let result: any = null;
    let resultTarget = chat_id;

    if (target === "users") {
      const users = await dbAdmin.from("app_users").select("telegram_id,full_name").order("created_at", { ascending: false });
      const rows = users.data ?? [];
      const sent: any[] = [];
      for (const u of rows) {
        try {
          const r = await telegramApi("sendMessage", {
            chat_id: String(u.telegram_id),
            text,
            parse_mode,
            disable_web_page_preview,
          });
          sent.push({ telegram_id: u.telegram_id, ok: true, message_id: r?.message_id });
        } catch (e: any) {
          sent.push({ telegram_id: u.telegram_id, ok: false, error: e?.message ?? "failed" });
        }
      }
      result = { total: rows.length, sent };
      resultTarget = "users";
    } else {
      if (!chat_id) return NextResponse.json({ ok: false, error: "Kanal/chat ID kiritilmagan" }, { status: 400 });
      result = await telegramApi("sendMessage", { chat_id, text, parse_mode, disable_web_page_preview });
    }

    await dbAdmin.from("notification_campaigns").insert({
      title,
      body: text,
      target: resultTarget,
      status: "SENT",
      sent_at: new Date().toISOString(),
      result_json: result,
      created_by: session.tg.id,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
