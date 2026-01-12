"use client";

import Script from "next/script";

export default function LoginPage() {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";

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
          data-auth-url={`${site}/api/auth/telegram`}
        />
      </div>
    </main>
  );
}
