import "server-only";
import { dbAdmin } from "@/lib/local/admin";
import { getSetting } from "@/lib/db";

export type TelegramConfig = {
  token: string;
  defaultChatId: string;
  botUsername: string;
};

function clean(v: string | null | undefined) {
  return String(v ?? "").trim().replace(/^[<"']+|[>"']+$/g, "");
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const token = clean(process.env.TELEGRAM_BOT_TOKEN) || clean(await getSetting("telegram_bot_token"));
  const defaultChatId = clean(process.env.TELEGRAM_CHAT_ID) || clean(await getSetting("telegram_default_chat_id"));
  const botUsername = clean(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME) || clean(await getSetting("telegram_bot_username"));

  if (!defaultChatId) {
    const ch = await dbAdmin
      .from("telegram_channels")
      .select("chat_id")
      .eq("is_active", 1)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return { token, defaultChatId: clean(ch.data?.chat_id), botUsername };
  }

  return { token, defaultChatId, botUsername };
}

export async function telegramApi<T = any>(method: string, payload?: Record<string, unknown>) {
  const cfg = await getTelegramConfig();
  if (!cfg.token) throw new Error("TELEGRAM_BOT_TOKEN yoki Settings > Telegram bot token kiritilmagan");

  const res = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.description || json?.error || `Telegram ${method} failed`);
  }
  return json.result as T;
}

export function htmlEscape(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
