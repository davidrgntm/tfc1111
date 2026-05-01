"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { dbClient } from "@/lib/local/client";

export default function LoginPage() {
  const [bot, setBot] = useState(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "");
  const [site, setSite] = useState(process.env.NEXT_PUBLIC_SITE_URL || "");
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    dbClient.from("platform_settings").select("key,value").in("key", ["telegram_bot_username", "site_url"]).then((r) => {
      if (r.error) return;
      const map: Record<string, string> = {};
      for (const row of r.data ?? []) map[row.key] = row.value ?? "";
      if (!bot && map.telegram_bot_username) setBot(map.telegram_bot_username);
      if (!site && map.site_url) setSite(map.site_url);
    });
  }, [bot, site]);

  return (
    <main className="min-h-screen bg-[#07110d] text-white grid place-items-center p-5">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
        <Link href="/" className="text-sm text-white/50 hover:text-white">← Public site</Link>
        <h1 className="mt-5 text-3xl font-black">Telegram orqali kirish</h1>
        <p className="mt-2 text-white/55">Admin panel va shaxsiy kabinetga xavfsiz kirish uchun Telegram Login ishlatiladi.</p>

        <div className="mt-6 rounded-3xl border border-white/10 bg-black/25 p-5 text-center min-h-[86px] grid place-items-center">
          {bot && site ? (
            <Script
              key={`${bot}-${site}`}
              src="https://telegram.org/js/telegram-widget.js?22"
              strategy="afterInteractive"
              data-telegram-login={bot}
              data-size="large"
              data-userpic="true"
              data-request-access="write"
              data-auth-url={`${site}/api/tg/login`}
            />
          ) : (
            <div className="text-sm text-amber-200">Bot username yoki site URL kiritilmagan. /setup yoki /admin/settings orqali sozlang.</div>
          )}
        </div>

        {isDev && (
          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="text-xs text-amber-300 font-bold uppercase tracking-widest mb-2">Development Mode</p>
            <a href="/api/tg/login?dev=true" className="inline-block rounded-2xl bg-white px-4 py-3 text-sm font-black text-black hover:bg-emerald-200">⚡ Quick Admin Login</a>
          </div>
        )}
      </div>
    </main>
  );
}
