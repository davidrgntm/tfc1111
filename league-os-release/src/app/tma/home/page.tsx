"use client";

import { useEffect, useState } from "react";

type Tournament = {
  id: string;
  title: string;
  format: string;
  status: string;
  logo_url: string | null;
};

export default function TmaHomePage() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [msg, setMsg] = useState<string>("Yuklanmoqda...");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/tma/tournaments");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMsg(`Xato: ${json?.error ?? "failed"}`);
        return;
      }
      setItems(json.tournaments as Tournament[]);
      setMsg("");
    })();
  }, []);

  return (
    <main className="p-4 space-y-3">
      <div className="text-xl font-semibold">TFC Turnirlar</div>
      {msg && <div className="text-sm">{msg}</div>}

      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="border rounded p-3 flex items-center gap-3">
            {t.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo_url} alt="logo" className="w-10 h-10 rounded object-cover" />
            ) : (
              <div className="w-10 h-10 rounded border flex items-center justify-center text-xs">TFC</div>
            )}
            <div className="flex-1">
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-gray-500">
                {t.format} · {t.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
