"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function TmaBootstrapClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [msg, setMsg] = useState<string>(
    "Telegram’dan initData olinmoqda..."
  );

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;

    if (!tg) {
      setMsg("Bu sahifani Telegram ichida (TMA) ochish kerak.");
      return;
    }

    try {
      tg.ready?.();
      tg.expand?.();
    } catch {}

    const initData = tg.initData;

    if (!initData) {
      setMsg("initData topilmadi. Telegram WebApp noto‘g‘ri ochilgan.");
      return;
    }

    (async () => {
      setMsg("Session yaratilmoqda...");
      const res = await fetch("/api/tma/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setMsg(`Session xato: ${json?.error ?? "failed"}`);
        return;
      }

      setMsg("OK ✅");
      router.replace("/tma/home");
    })();
  }, [router, sp]);

  return (
    <main className="p-4 space-y-2">
      <div className="text-xl font-semibold">TFC TMA</div>
      <div className="text-sm">{msg}</div>
      <div className="text-xs text-gray-500">
        Agar Telegram ichida ochgan bo‘lsangiz-u baribir ishlamasa:
        bot ichidan “Open App” tugmasi bilan oching.
      </div>
    </main>
  );
}
