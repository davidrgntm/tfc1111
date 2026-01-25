"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type SeasonRow = {
  id: string;
  title: string;
  created_at: string;
  tournament_id: string;
  tournament: { id: string; title: string } | null;
};

export default function AdminSeasonsPage() {
  const [rows, setRows] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);

    const res = await supabase
      .from("seasons")
      .select("id,title,created_at,tournament_id,tournament:tournaments(id,title)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (res.error) {
      setMsg(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((res.data ?? []) as SeasonRow[]);
    setLoading(false);
  }

  useEffect(() => {
    async function loadData() {
      await load();
    }
    loadData();
  }, []);

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Seasons</div>
          <div className="text-xs text-gray-400">Barcha seasonlar (tez manage qilish uchun).</div>
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
            <div className="p-3 text-sm text-gray-400">Season yo‘q.</div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {rows.map((s) => (
                <li key={s.id} className="p-3">
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-xs text-gray-400">
                    Tournament: {s.tournament?.title ?? "-"} · created:{" "}
                    {new Date(s.created_at).toLocaleString()}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link className="underline" href={`/admin/seasons/${s.id}/matches`}>
                      Manage (Teams + Schedule + Matches)
                    </Link>
                    {s.tournament_id ? (
                      <Link className="underline" href={`/admin/tournaments/${s.tournament_id}/seasons`}>
                        Tournament seasons
                      </Link>
                    ) : null}
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    ID: <code>{s.id}</code>
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
