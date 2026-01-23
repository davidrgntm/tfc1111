import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SignJWT } from "jose";

const COOKIE_NAME = "tfc_session";

function getSessionSecret() {
  const s = process.env.SESSION_SECRET || "dev-secret-change-me";
  return new TextEncoder().encode(s);
}

function makeDataCheckString(params: Record<string, string>) {
  const pairs: string[] = [];
  Object.keys(params)
    .filter((k) => k !== "hash")
    .sort()
    .forEach((k) => pairs.push(`${k}=${params[k]}`));
  return pairs.join("\n");
}

function verifyTelegram(params: Record<string, string>, botToken: string) {
  const hash = params["hash"];
  if (!hash) return false;

  const dataCheckString = makeDataCheckString(params);

  const secretKey = crypto.createHash("sha256").update(botToken).digest(); // Buffer
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return computed === hash;
}

export async function GET(req: NextRequest) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim().replace(/^[<"']+|[>"']+$/g, "");

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Missing env TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (params[k] = v));

  // Telegram hash verify
  if (!verifyTelegram(params, botToken)) {
    return NextResponse.json({ ok: false, error: "Telegram auth invalid (hash mismatch)" }, { status: 401 });
  }

  // auth_date tekshiruvi (ixtiyoriy, tavsiya)
  const authDate = Number(params["auth_date"] || "0");
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 60 * 60 * 24) {
    return NextResponse.json({ ok: false, error: "Auth expired" }, { status: 401 });
  }

  // JWT yaratish
  const token = await new SignJWT({
    sub: params["id"], // user id
    role: "user", // default role
    tg: {
      id: params["id"],
      username: params["username"] || null,
      first_name: params["first_name"] || null,
      last_name: params["last_name"] || null,
      photo_url: params["photo_url"] || null,
    },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime("30d")
    .sign(getSessionSecret());

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
