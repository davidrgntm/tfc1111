import crypto from "crypto";

export type TgWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type VerifiedInitData = {
  ok: true;
  user: TgWebAppUser;
  auth_date: number;
  raw: Record<string, string>;
};

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const raw: Record<string, string> = {};
  params.forEach((v, k) => (raw[k] = v));
  return raw;
}

function buildDataCheckString(raw: Record<string, string>) {
  const keys = Object.keys(raw)
    .filter((k) => k !== "hash")
    .sort();

  return keys.map((k) => `${k}=${raw[k]}`).join("\n");
}

function safeEqualHex(a: string, b: string) {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/**
 * Telegram WebApp initData verification:
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * hash = HMAC_SHA256(data_check_string, secret_key)
 */
export function verifyTelegramInitData(initData: string, botToken: string): VerifiedInitData | { ok: false; error: string } {
  if (!initData) return { ok: false, error: "initData empty" };
  if (!botToken) return { ok: false, error: "bot token missing" };

  const raw = parseInitData(initData);
  const hash = raw.hash;
  if (!hash) return { ok: false, error: "hash missing" };

  const dataCheckString = buildDataCheckString(raw);

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!safeEqualHex(computed, hash)) {
    return { ok: false, error: "initData hash mismatch" };
  }

  const auth_date = Number(raw.auth_date || "0");
  if (!auth_date) return { ok: false, error: "auth_date missing" };

  // ixtiyoriy: 24 soatdan eski bo‘lsa rad etish (xohlasangiz 7 kun qilamiz)
  const now = Math.floor(Date.now() / 1000);
  if (now - auth_date > 24 * 60 * 60) {
    return { ok: false, error: "initData expired" };
  }

  if (!raw.user) return { ok: false, error: "user missing" };
  let user: TgWebAppUser;
  try {
    user = JSON.parse(raw.user);
  } catch {
    return { ok: false, error: "user json invalid" };
  }

  if (!user?.id) return { ok: false, error: "telegram user id missing" };

  return { ok: true, user, auth_date, raw };
}
