"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  season_id: string;
  matchday: number | null;
  kickoff_at: string | null;
  venue: string | null;
  status: string;
  home_score: number;
  away_score: number;
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
};

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

export default function AdminMatchesPage() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setMsg(null);

    const res = await supabase
      .from("matches")
      .select(`
        id,season_id,matchday,kickoff_at,venue,status,home_score,away_score,
        home:teams!matches_home_team_id_fkey(id,name),
        away:teams!matches_away_team_id_fkey(id,name)
      `)
      .order("kickoff_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (res.error) {
      setMsg(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // home/away ba’zan array bo‘lib kelishi mumkin — normalize:
    const normalized = (res.data ?? []).map((r: any) => ({
      ...r,
      home: Array.isArray(r.home) ? (r.home[0] ?? null) : (r.home ?? null),
      away: Array.isArray(r.away) ? (r.away[0] ?? null) : (r.away ?? null),
    }));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    async function loadData() {
      await load();
    }
    loadData();
  }, []);

  const qn = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!qn) return rows;
    return rows.filter((m) => {
      const home = (m.home?.name ?? "").toLowerCase();
      const away = (m.away?.name ?? "").toLowerCase();
      const venue = (m.venue ?? "").toLowerCase();
      return home.includes(qn) || away.includes(qn) || venue.includes(qn) || String(m.matchday ?? "").includes(qn);
    });
  }, [rows, qn]);

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Matches</div>
          <div className="text-xs text-gray-400">Global matchlar (tez topish).</div>
        </div>
        <button className="border rounded px-3 py-1 text-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="border rounded px-3 py-2 bg-black w-full md:w-[420px]"
          placeholder="Qidirish: home/away/venue/matchday"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q ? (
          <button className="border rounded px-3 py-2 text-sm" onClick={() => setQ("")}>
            Clear
          </button>
        ) : null}
      </div>

      {msg && <div className="text-sm text-red-400">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div key={m.id} className="border rounded p-3">
              <div className="font-semibold">
                {(m.home?.name ?? "Home")}{" "}
                <span className="text-gray-400">
                  {m.status === "FINISHED" || m.status === "LIVE" ? `${m.home_score}:${m.away_score}` : "vs"}
                </span>{" "}
                {(m.away?.name ?? "Away")}
              </div>
              <div className="text-xs text-gray-400">
                season: {m.season_id} · MD: {m.matchday ?? "-"} · {m.status} · {fmtDT(m.kickoff_at)} · {m.venue ?? "-"}
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link className="underline" href={`/matches/${m.id}`}>Public</Link>
                <Link className="underline" href={`/admin/matches/${m.id}/live`}>Live</Link>
                <Link className="underline" href={`/admin/matches/${m.id}/media`}>Media</Link>
                <Link className="underline" href={`/admin/seasons/${m.season_id}/matches`}>Go to Season Manage</Link>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                ID: <code>{m.id}</code>
              </div>
            </div>
          ))}

          {filtered.length === 0 && <div className="text-sm text-gray-400">Match topilmadi.</div>}
        </div>
      )}
    </main>
  );
}
