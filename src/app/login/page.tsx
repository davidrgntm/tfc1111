"use client";

import Script from "next/script";

export default function LoginPage() {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-2">Telegram orqali kirish</h1>
      <p className="text-sm text-gray-500 mb-4">
        “Login” qiling — keyin avtomatik kabinetga o‘tasiz.
      </p>

      <div className="inline-block">
        <Script
          src="https://telegram.org/js/telegram-widget.js?22"
          strategy="afterInteractive"
          data-telegram-login={bot}
          data-size="large"
          data-userpic="true"
          data-request-access="write"
          data-auth-url={`${site}/api/tg/login`}
        />
      </div>

      {isDev && (
        <div className="mt-8 pt-4 border-t border-gray-200">
          <p className="text-xs text-yellow-600 font-bold mb-2 uppercase">
            Development Mode
          </p>
          <a
            href="/api/tg/login?dev=true"
            className="inline-block bg-gray-900 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            ⚡ Quick Admin Login
          </a>
          <p className="text-xs text-gray-400 mt-1">Telegramsiz kirish uchun</p>
        </div>
      )}
    </main>
  );
}
