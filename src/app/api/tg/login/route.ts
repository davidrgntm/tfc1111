import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Tokenni tozalaymiz
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim().replace(/^[<"']+|[>"']+$/g, "");
const ADMIN_IDS = (process.env.ADMIN_TG_IDS || "").split(",").map((x) => x.trim());

// Sizning IDingizni hardcode qilib qo'yamiz (Super Admin)
const SUPER_ADMIN_ID = "806860624";

async function send(method: string, payload: any) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Telegram send error:", e);
  }
}

export async function POST(req: Request) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "Bot token missing" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.message) return NextResponse.json({ ok: true });

  const msg = body.message;
  const chatId = msg.chat.id;
  const text = msg.text;

  // 1. /start bosilganda
  if (text === "/start") {
    await send("sendMessage", {
      chat_id: chatId,
      text: "Xush kelibsiz! 🤖\n\nTizimdan to‘liq foydalanish uchun, iltimos, telefon raqamingizni yuboring (pastdagi tugmani bosing).",
      reply_markup: {
        keyboard: [
          [
            {
              text: "📱 Telefon raqamni yuborish",
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // 2. Contact (Telefon raqam) yuborilganda
  if (msg.contact) {
    const contact = msg.contact;

    // Birovning kontaktini yubormadimi?
    if (contact.user_id !== msg.from.id) {
      await send("sendMessage", {
        chat_id: chatId,
        text: "Iltimos, faqat o‘zingizning raqamingizni yuboring.",
      });
      return NextResponse.json({ ok: true });
    }

    const telegramId = contact.user_id;
    const phone = contact.phone_number;
    const fullName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
    const username = msg.from.username;

    // Adminlikni tekshiramiz
    const isSuperAdmin = String(telegramId) === SUPER_ADMIN_ID;
    const isEnvAdmin = ADMIN_IDS.includes(String(telegramId));
    
    // Bazadan oldingi rolini olamiz (agar bor bo'lsa)
    const existing = await supabaseAdmin
      .from("app_users")
      .select("role")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    // Agar user allaqachon admin bo'lsa yoki endi admin bo'lishi kerak bo'lsa
    let role = existing.data?.role ?? "user";
    if (isSuperAdmin || isEnvAdmin) {
      role = "admin";
    }

    // Upsert (Yaratish yoki Yangilash)
    const { error } = await supabaseAdmin.from("app_users").upsert(
      {
        telegram_id: telegramId,
        telegram_username: username,
        full_name: fullName,
        phone_number: phone, 
        role: role,
      },
      { onConflict: "telegram_id" }
    );

    if (error) {
      console.error("Register error:", error);
      await send("sendMessage", { chat_id: chatId, text: "Xatolik: " + error.message });
    } else {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tfc.uz";
      await send("sendMessage", { 
        chat_id: chatId, 
        text: `Rahmat! Siz muvaffaqiyatli ro‘yxatdan o‘tdingiz.\nRolingiz: ${role}`, 
        reply_markup: { 
          remove_keyboard: true, // Eski klaviaturani o'chiramiz
          inline_keyboard: [
            [{ text: "⚽ Ilovani ochish", web_app: { url: `${siteUrl}/tma/home` } }]
          ]
        } 
      });
    }
  }

  return NextResponse.json({ ok: true });
}