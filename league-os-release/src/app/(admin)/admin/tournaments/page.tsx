"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dbClient } from "@/lib/local/client";

type TournamentRow = {
  id: string;
  title: string;
  format: string;
  status: string;
  logo_url: string | null;
};

export default function AdminTournamentsPage() {
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);

    const res = await dbClient
      .from("tournaments")
      .select("id,title,format,status,logo_url")
      .order("title", { ascending: true });

    if (res.error) {
      setMsg(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((res.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Tournaments</div>
          <div className="text-xs text-gray-400">Turnirlar ro‘yxati va boshqaruv.</div>
        </div>
        <button className="border rounded px-3 py-1 text-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {msg && <div className="text-sm text-red-400">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && (
        <div className="border rounded overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-3 text-sm text-gray-400">Hali tournament yo‘q.</div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {rows.map((t) => (
                <li key={t.id} className="p-3">
                  <div className="font-semibold">{t.title}</div>
                  <div className="text-xs text-gray-400">
                    status: {t.status} · format: {t.format}
                  </div>
                  <div className="text-xs text-gray-500 break-all">
                    logo_url: {t.logo_url ?? "yo‘q"}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link className="underline" href={`/tournaments/${t.id}`}>Public</Link>
                    <Link className="underline" href={`/admin/tournaments/${t.id}/seasons`}>Seasons</Link>
                    <Link className="underline" href={`/admin/tournaments/${t.id}/telegram`}>Telegram</Link>
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    ID: <code>{t.id}</code>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
