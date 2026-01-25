// src/app/(admin)/admin/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type TournamentRow = {
  id: string;
  title: string;
  status: string;
  format: string;
  logo_url?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  logo_url?: string | null;
};

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
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");

  const [counts, setCounts] = useState({
    tournaments: 0,
    seasons: 0,
    teams: 0,
    matches: 0,
  });

  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  async function loadAll() {
    setLoading(true);
    setMsg(null);

    try {
      // counts (tez)
      const [ct, cs, cteam, cm] = await Promise.all([
        supabase.from("tournaments").select("id", { count: "exact", head: true }),
        supabase.from("seasons").select("id", { count: "exact", head: true }),
        supabase.from("teams").select("id", { count: "exact", head: true }),
        supabase.from("matches").select("id", { count: "exact", head: true }),
      ]);

      setCounts({
        tournaments: ct.count ?? 0,
        seasons: cs.count ?? 0,
        teams: cteam.count ?? 0,
        matches: cm.count ?? 0,
      });

      // tournaments (list)
      const t = await supabase
        .from("tournaments")
        .select("id,title,status,format,logo_url")
        .order("title", { ascending: true })
        .limit(50);

      if (t.error) throw new Error(`Tournaments: ${t.error.message}`);
      setTournaments((t.data ?? []) as TournamentRow[]);

      // teams (list)
      const te = await supabase
        .from("teams")
        .select("id,name,logo_url")
        .order("name", { ascending: true })
        .limit(50);

      if (te.error) throw new Error(`Teams: ${te.error.message}`);
      setTeams((te.data ?? []) as TeamRow[]);

      // recent matches (list)
      const m = await supabase
        .from("matches")
        .select(`
          id,season_id,matchday,kickoff_at,venue,status,home_score,away_score,
          home:teams!matches_home_team_id_fkey(id,name),
          away:teams!matches_away_team_id_fkey(id,name)
        `)
        .order("kickoff_at", { ascending: false, nullsFirst: false })
        .limit(30);

      if (m.error) throw new Error(`Matches: ${m.error.message}`);
      setMatches((m.data ?? []) as MatchRow[]);

      setLoading(false);
    } catch (e) {
      let message = "Unknown error";
      if (e instanceof Error) message = e.message;
      setMsg(message);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const qNorm = q.trim().toLowerCase();

  const filteredTournaments = useMemo(() => {
    if (!qNorm) return tournaments;
    return tournaments.filter((x) => x.title.toLowerCase().includes(qNorm));
  }, [tournaments, qNorm]);

  const filteredTeams = useMemo(() => {
    if (!qNorm) return teams;
    return teams.filter((x) => x.name.toLowerCase().includes(qNorm));
  }, [teams, qNorm]);

  const filteredMatches = useMemo(() => {
    if (!qNorm) return matches;
    return matches.filter((m) => {
      const home = (m.home?.name ?? "").toLowerCase();
      const away = (m.away?.name ?? "").toLowerCase();
      const venue = (m.venue ?? "").toLowerCase();
      return home.includes(qNorm) || away.includes(qNorm) || venue.includes(qNorm);
    });
  }, [matches, qNorm]);

  return (
    <main className="p-4 space-y-4">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Admin Dashboard</div>
          <div className="text-xs text-gray-400">
            Barcha boshqaruv shu yerdan: tournament/season, team, match, poster/telegram.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link className="underline text-sm" href="/admin/tournaments">
            Tournaments
          </Link>
          <Link className="underline text-sm" href="/admin/teams">
            Teams
          </Link>
          <Link className="underline text-sm" href="/admin/matches">
            Matches
          </Link>
          <button
            className="border rounded px-3 py-1 text-sm"
            onClick={loadAll}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-red-400">{msg}</div>}

      {/* Quick stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="border rounded p-3">
          <div className="text-xs text-gray-400">Tournaments</div>
          <div className="text-2xl font-semibold">{counts.tournaments}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-400">Seasons</div>
          <div className="text-2xl font-semibold">{counts.seasons}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-400">Teams</div>
          <div className="text-2xl font-semibold">{counts.teams}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-400">Matches</div>
          <div className="text-2xl font-semibold">{counts.matches}</div>
        </div>
      </section>

      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          className="w-full md:w-[420px] border rounded px-3 py-2 bg-black"
          placeholder="Qidirish: tournament / team / match (home-away / venue)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q ? (
          <button className="border rounded px-3 py-2 text-sm" onClick={() => setQ("")}>
            Clear
          </button>
        ) : null}
      </div>

      {/* Tournaments */}
      <section className="border rounded p-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">🏆 Tournaments</div>
          <Link className="underline text-sm" href="/admin/tournaments">
            All tournaments →
          </Link>
        </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredTournaments.slice(0, 6).map((t) => (
            <div key={t.id} className="border rounded p-3">
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs text-gray-400">
                status: {t.status} · format: {t.format}
              </div>
              <div className="text-xs text-gray-500 break-all mt-1">
                logo: {t.logo_url ? t.logo_url : "yo‘q"}
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link className="underline" href={`/tournaments/${t.id}`}>
                  Public
                </Link>
                <Link className="underline" href={`/admin/tournaments/${t.id}/seasons`}>
                  Seasons
                </Link>
                <Link className="underline" href={`/admin/tournaments/${t.id}/telegram`}>
                  Telegram
                </Link>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                ID: <code>{t.id}</code>
              </div>
            </div>
          ))}
          {filteredTournaments.length === 0 && (
            <div className="text-sm text-gray-400">Tournament topilmadi.</div>
          )}
        </div>
      </section>

      {/* Teams */}
      <section className="border rounded p-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">🧩 Teams</div>
          <Link className="underline text-sm" href="/admin/teams">
            All teams →
          </Link>
        </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredTeams.slice(0, 6).map((t) => (
            <div key={t.id} className="border rounded p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{t.name}</div>
                <div className="text-xs text-gray-500 break-all">
                  logo: {t.logo_url ? t.logo_url : "yo‘q"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  ID: <code>{t.id}</code>
                </div>
              </div>

              <div className="shrink-0 flex flex-col gap-1 text-sm">
                <Link className="underline" href={`/admin/teams/${t.id}`}>
                  Edit
                </Link>
              </div>
            </div>
          ))}
          {filteredTeams.length === 0 && (
            <div className="text-sm text-gray-400">Team topilmadi.</div>
          )}
        </div>
      </section>

      {/* Recent Matches */}
      <section className="border rounded p-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">⚽ Recent matches</div>
          <Link className="underline text-sm" href="/admin/matches">
            All matches →
          </Link>
        </div>

        <div className="mt-2 space-y-2">
          {filteredMatches.slice(0, 10).map((m) => (
            <div key={m.id} className="border rounded p-3">
              <div className="font-semibold">
                {(m.home?.name ?? "Home")}{" "}
                <span className="text-gray-400">
                  {m.status === "FINISHED" || m.status === "LIVE"
                    ? `${m.home_score}:${m.away_score}`
                    : "vs"}
                </span>{" "}
                {(m.away?.name ?? "Away")}
              </div>

              <div className="text-xs text-gray-400">
                MD: {m.matchday ?? "-"} · {m.status} · {fmtDT(m.kickoff_at)} ·{" "}
                {m.venue ? m.venue : "-"}
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link className="underline" href={`/matches/${m.id}`}>
                  Public view
                </Link>
                <Link className="underline" href={`/admin/matches/${m.id}/live`}>
                  Live Console
                </Link>
                <Link className="underline" href={`/admin/matches/${m.id}/media`}>
                  Media
                </Link>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                ID: <code>{m.id}</code>
              </div>
            </div>
          ))}

          {filteredMatches.length === 0 && (
            <div className="text-sm text-gray-400">Match topilmadi.</div>
          )}
        </div>
      </section>
    </main>
  );
}
