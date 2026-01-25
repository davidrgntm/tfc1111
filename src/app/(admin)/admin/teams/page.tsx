"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

export default function AdminTeamsPage() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);

    const res = await supabase
      .from("teams")
      .select("id,name,logo_url")
      .order("name", { ascending: true });

    if (res.error) {
      setMsg(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((res.data ?? []) as TeamRow[]);
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
        <div className="text-lg font-semibold">Teams</div>
        <div className="flex gap-2">
          <button className="border rounded px-3 py-1 text-sm" onClick={load} disabled={loading}>
            Refresh
          </button>
          <Link className="border rounded px-3 py-1 text-sm" href="/admin/teams/new">
            + New Team
          </Link>
        </div>
      </div>

      {msg && <div className="text-sm text-red-500">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && (
        <div className="border rounded overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">Hali team yo‘q.</div>
          ) : (
            <ul className="divide-y">
              {rows.map((t) => (
                <li key={t.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center overflow-hidden">
                      {t.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logo_url} alt={t.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-xs text-gray-500">no logo</div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-gray-500">{t.id}</div>
                    </div>
                  </div>

                  <Link className="underline text-sm" href={`/admin/teams/${t.id}`}>
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
