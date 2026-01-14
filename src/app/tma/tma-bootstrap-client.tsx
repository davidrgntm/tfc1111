"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeNextPath(v: string | null) {
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}

export default function TmaBootstrapClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [msg, setMsg] = useState("Telegram’dan initData olinmoqda...");

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;

    if (!tg) {
      setMsg("Bu sahifani Telegram ichida (Mini App) ochish kerak.");
      return;
    }

    try {
      tg.ready?.();
      tg.expand?.();
    } catch {}

    const initData: string = tg.initData;

    if (!initData) {
      setMsg("initData topilmadi. Mini App noto‘g‘ri ochilgan.");
      return;
    }

    const next = safeNextPath(sp.get("next"));

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

      // json.role = "admin" | "user"
      const role = json?.role ?? "user";

      setMsg("OK ✅");

      if (next) {
        router.replace(next);
        return;
      }

      if (role === "admin") router.replace("/admin");
      else router.replace("/tma/home");
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
