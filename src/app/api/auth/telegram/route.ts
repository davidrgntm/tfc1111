import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "tfc_session";

function makeDataCheckString(params: Record<string, string>) {
  const pairs: string[] = [];
  Object.keys(params)
    .filter((k) => k !== "hash")
    .sort()
    .forEach((k) => pairs.push(`${k}=${params[k]}`));
  return pairs.join("\n");
}

function verifyTelegram(params: Record<string, string>, botToken: string) {
  const hash = params.hash;
  if (!hash) return false;

  const dataCheckString = makeDataCheckString(params);

  const secretKey = crypto.createHash("sha256").update(botToken).digest(); // Buffer
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return computed === hash;
}

function signSession(payload: any, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function GET(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.SESSION_SECRET;

  if (!botToken || !secret) {
    return NextResponse.json({ ok: false, error: "Missing env TELEGRAM_BOT_TOKEN or SESSION_SECRET" }, { status: 500 });
  }

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (params[k] = v));

  // Telegram hash verify
  if (!verifyTelegram(params, botToken)) {
    return NextResponse.json({ ok: false, error: "Telegram auth invalid (hash mismatch)" }, { status: 401 });
  }

  // auth_date tekshiruvi (ixtiyoriy, tavsiya)
  const authDate = Number(params.auth_date || "0");
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 60 * 60 * 24) {
    return NextResponse.json({ ok: false, error: "Auth expired" }, { status: 401 });
  }

  const sessionPayload = {
    tg: {
      id: params.id,
      username: params.username ?? null,
      first_name: params.first_name ?? null,
      last_name: params.last_name ?? null,
      photo_url: params.photo_url ?? null,
    },
    auth_date: authDate,
  };

  const token = signSession(sessionPayload, secret);

  const res = NextResponse.redirect(new URL("/me", req.url));
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 kun
  });
  return res;
}
