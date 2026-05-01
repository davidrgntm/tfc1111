"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dbClient } from "@/lib/local/client";

type Tournament = {
  id: string;
  title: string;
  format: string;
  status: string;
  created_at: string;
};

export default function TournamentsPage() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data, error } = await dbClient
      .from("tournaments")
      .select("id,title,format,status,created_at")
      .order("created_at", { ascending: false });

    if (error) setErr(error.message);
    setItems((data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Turnirlar</h1>
        <Link className="underline" href="/admin/matches">
          Admin
        </Link>
      </div>

      <button className="border rounded px-3 py-2 text-sm" onClick={load}>
        Refresh
      </button>

      {loading && <div>Yuklanmoqda...</div>}
      {err && <div className="text-red-600">Xatolik: {err}</div>}

      {!loading && !err && (
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="text-gray-600">
              Turnir yo‘q. SQLite bazada `tournaments` jadvaliga bitta qo‘shing.
            </div>
          ) : (
            items.map((t) => (
              <div key={t.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-sm text-gray-600">
                    Format: {t.format} · Status: {t.status}
                  </div>
                </div>

                <Link className="underline text-sm" href={`/tournaments/${t.id}`}>
                  Open →
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
