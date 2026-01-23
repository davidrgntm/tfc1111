// src/lib/telegram-webapp.ts
import crypto from "crypto";

export type TelegramWebAppUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export function verifyTelegramWebAppInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) return { ok: false as const, error: "hash yo‘q" };

  params.delete("hash");

  const pairs = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computed !== hash) return { ok: false as const, error: "hash mos emas" };

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return { ok: false as const, error: "auth_date yo‘q" };

  // ixtiyoriy: juda eski bo‘lsa reject (masalan 7 kun)
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 60 * 60 * 24 * 7) {
    return { ok: false as const, error: "initData eskirgan" };
  }

  let user: TelegramWebAppUser | null = null;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = null;
    }
  }

  return { ok: true as const, user, authDate };
}