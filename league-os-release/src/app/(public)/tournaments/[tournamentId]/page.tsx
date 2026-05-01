"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dbClient } from "@/lib/local/client";

type TournamentRow = {
  id: string;
  title: string;
  format: string;
  status: string;
};

type SeasonRow = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  season_id: string;
  matchday: number | null;
  kickoff_at: string | null;
  venue: string | null;
  status: string; // SCHEDULED | LIVE | FINISHED
  home_score: number;
  away_score: number;
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
};

type Standing = {
  teamId: string;
  teamName: string;
  P: number;
  W: number;
  D: number;
  L: number;
  GF: number;
  GA: number;
  GD: number;
  PTS: number;
  form: ("W" | "D" | "L")[]; // last 5
};

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function resultLetter(homeScore: number, awayScore: number, isHome: boolean): "W" | "D" | "L" {
  if (homeScore === awayScore) return "D";
  const homeWon = homeScore > awayScore;
  if (isHome) return homeWon ? "W" : "L";
  return homeWon ? "L" : "W";
}

export default function TournamentPage() {
  const params = useParams();
  const raw = (params as any)?.tournamentId;
  const tournamentId: string | undefined = Array.isArray(raw) ? raw[0] : raw;

  const [tab, setTab] = useState<"standings" | "matches">("standings");

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(currentTournamentId: string) {
    setLoading(true);
    setErr(null);

    // 1) Tournament
    const t = await dbClient
      .from("tournaments")
      .select("id,title,format,status")
      .eq("id", currentTournamentId)
      .single();

    if (t.error) {
      setErr(t.error.message);
      setLoading(false);
      return;
    }
    setTournament(t.data as any);

    // 2) Latest season for this tournament
    const s = await dbClient
      .from("seasons")
      .select("id,title,start_date,end_date,created_at")
      .eq("tournament_id", currentTournamentId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (s.error) {
      setErr(s.error.message);
      setLoading(false);
      return;
    }

    const latestSeason = (s.data ?? [])[0] as any as SeasonRow | undefined;
    if (!latestSeason) {
      setSeason(null);
      setMatches([]);
      setLoading(false);
      return;
    }
    setSeason(latestSeason);

    // 3) Matches in this season
    const m = await dbClient
      .from("matches")
      .select(
        `
        id,season_id,matchday,kickoff_at,venue,status,home_score,away_score,
        home:teams!matches_home_team_id_fkey(id,name),
        away:teams!matches_away_team_id_fkey(id,name)
      `
      )
      .eq("season_id", latestSeason.id)
      .order("kickoff_at", { ascending: true, nullsFirst: false });

    if (m.error) {
      setErr(m.error.message);
      setLoading(false);
      return;
    }

    setMatches((m.data ?? []) as any);
    setLoading(false);
  }

  // initial load
  useEffect(() => {
    if (!tournamentId) return;
    loadAll(tournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // realtime: matches changed -> reload
  useEffect(() => {
    if (!season?.id) return;

    const ch = dbClient
      .channel(`rt:season-matches:${season.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `season_id=eq.${season.id}` },
        () => {
          // season o‘zgarmaydi, faqat matchlar yangilanadi
          if (tournamentId) loadAll(tournamentId);
        }
      )
      .subscribe();

    return () => {
      dbClient.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.id]);

  const standings: Standing[] = useMemo(() => {
    // Teams list from matches (distinct home/away)
    const teamMap = new Map<string, Standing>();

    function ensureTeam(id: string, name: string) {
      if (!teamMap.has(id)) {
        teamMap.set(id, {
          teamId: id,
          teamName: name,
          P: 0,
          W: 0,
          D: 0,
          L: 0,
          GF: 0,
          GA: 0,
          GD: 0,
          PTS: 0,
          form: [],
        });
      }
      return teamMap.get(id)!;
    }

    // sort finished matches by kickoff_at (for form)
    const finished = matches
      .filter((m) => m.status === "FINISHED")
      .slice()
      .sort((a, b) => {
        const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
        const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
        return ta - tb;
      });

    // ensure all teams appear (even if no finished matches yet)
    for (const m of matches) {
      if (m.home?.id && m.home?.name) ensureTeam(m.home.id, m.home.name);
      if (m.away?.id && m.away?.name) ensureTeam(m.away.id, m.away.name);
    }

    // apply stats from finished matches
    for (const m of finished) {
      const homeId = m.home?.id;
      const awayId = m.away?.id;
      const homeName = m.home?.name;
      const awayName = m.away?.name;
      if (!homeId || !awayId || !homeName || !awayName) continue;

      const H = ensureTeam(homeId, homeName);
      const A = ensureTeam(awayId, awayName);

      H.P += 1;
      A.P += 1;

      H.GF += m.home_score;
      H.GA += m.away_score;

      A.GF += m.away_score;
      A.GA += m.home_score;

      if (m.home_score > m.away_score) {
        H.W += 1;
        A.L += 1;
        H.PTS += 3;
      } else if (m.home_score < m.away_score) {
        A.W += 1;
        H.L += 1;
        A.PTS += 3;
      } else {
        H.D += 1;
        A.D += 1;
        H.PTS += 1;
        A.PTS += 1;
      }

      // form (chronological)
      H.form.push(resultLetter(m.home_score, m.away_score, true));
      A.form.push(resultLetter(m.home_score, m.away_score, false));
      // keep last 5
      if (H.form.length > 5) H.form = H.form.slice(-5);
      if (A.form.length > 5) A.form = A.form.slice(-5);
    }

    // compute GD
    for (const s of teamMap.values()) {
      s.GD = s.GF - s.GA;
    }

    // sort: PTS desc, GD desc, GF desc, name asc
    return Array.from(teamMap.values()).sort((a, b) => {
      if (b.PTS !== a.PTS) return b.PTS - a.PTS;
      if (b.GD !== a.GD) return b.GD - a.GD;
      if (b.GF !== a.GF) return b.GF - a.GF;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [matches]);

  if (!tournamentId) {
    return (
      <main className="p-4">
        <div className="text-red-600">
          URL’dan tournamentId olinmadi. To‘g‘ri format:
          <br />
          <code>/tournaments/&lt;tournamentId&gt;</code>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link className="underline" href="/tournaments">
          ← Turnirlar
        </Link>
        <Link className="underline" href="/admin/matches">
          Admin
        </Link>
      </div>

      {loading && <div>Yuklanmoqda...</div>}
      {err && <div className="text-red-600">Xatolik: {err}</div>}

      {!loading && !err && (
        <>
          <div className="border rounded p-3">
            <div className="text-lg font-semibold">{tournament?.title ?? "Turnir"}</div>
            <div className="text-sm text-gray-600">
              Format: {tournament?.format ?? "-"} · Status: {tournament?.status ?? "-"}
            </div>

            <div className="text-sm text-gray-600 mt-1">
              Season: {season?.title ?? "Season yo‘q"}
              {season?.start_date ? ` · ${season.start_date}` : ""}
              {season?.end_date ? ` → ${season.end_date}` : ""}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              className={`border rounded px-3 py-2 text-sm ${tab === "standings" ? "font-semibold" : ""}`}
              onClick={() => setTab("standings")}
            >
              Tablitsa
            </button>
            <button
              className={`border rounded px-3 py-2 text-sm ${tab === "matches" ? "font-semibold" : ""}`}
              onClick={() => setTab("matches")}
            >
              Matchlar
            </button>
            <Link className="border rounded px-3 py-2 text-sm" href={`/tournaments/${tournamentId}/stats`}>
              Statistika
            </Link>

            <button
              className="border rounded px-3 py-2 text-sm ml-auto"
              onClick={() => loadAll(tournamentId)}
            >
              Refresh
            </button>
          </div>

          {/* Standings */}
          {tab === "standings" && (
            <div className="border rounded p-3">
              <div className="font-medium mb-2">Tablitsa (MVP)</div>

              {season == null ? (
                <div className="text-gray-600 text-sm">
                  Bu turnirda season topilmadi. Avval `seasons` jadvaliga season qo‘shing.
                </div>
              ) : standings.length === 0 ? (
                <div className="text-gray-600 text-sm">
                  Hozircha match yo‘q. Match yaratilsa tablitsa avtomatik hisoblanadi.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-2">#</th>
                        <th className="py-2 pr-2">Team</th>
                        <th className="py-2 pr-2">P</th>
                        <th className="py-2 pr-2">W</th>
                        <th className="py-2 pr-2">D</th>
                        <th className="py-2 pr-2">L</th>
                        <th className="py-2 pr-2">GF</th>
                        <th className="py-2 pr-2">GA</th>
                        <th className="py-2 pr-2">GD</th>
                        <th className="py-2 pr-2">PTS</th>
                        <th className="py-2 pr-2">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s, idx) => (
                        <tr key={s.teamId} className="border-b">
                          <td className="py-2 pr-2">{idx + 1}</td>
                          <td className="py-2 pr-2 font-medium">{s.teamName}</td>
                          <td className="py-2 pr-2">{s.P}</td>
                          <td className="py-2 pr-2">{s.W}</td>
                          <td className="py-2 pr-2">{s.D}</td>
                          <td className="py-2 pr-2">{s.L}</td>
                          <td className="py-2 pr-2">{s.GF}</td>
                          <td className="py-2 pr-2">{s.GA}</td>
                          <td className="py-2 pr-2">{s.GD}</td>
                          <td className="py-2 pr-2 font-semibold">{s.PTS}</td>
                          <td className="py-2 pr-2">
                            <div className="flex gap-1">
                              {s.form.length === 0 ? (
                                <span className="text-gray-500">-</span>
                              ) : (
                                s.form.map((r, i) => (
                                  <span key={i} className="border rounded px-1">
                                    {r}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="text-xs text-gray-500 mt-2">
                    Hisoblash: Win=3, Draw=1, Loss=0. Faqat FINISHED matchlar tablitsaga kiradi.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Matches */}
          {tab === "matches" && (
            <div className="border rounded p-3 space-y-2">
              <div className="font-medium">Matchlar</div>

              {season == null ? (
                <div className="text-gray-600 text-sm">Season yo‘q.</div>
              ) : matches.length === 0 ? (
                <div className="text-gray-600 text-sm">Hozircha match yo‘q.</div>
              ) : (
                <div className="space-y-2">
                  {matches.map((m) => (
                    <div key={m.id} className="border rounded p-3">
                      <div className="font-medium">
                        {m.home?.name ?? "Home"} vs {m.away?.name ?? "Away"}
                      </div>

                      <div className="text-sm text-gray-600">
                        Status: {m.status}
                        {m.venue ? ` · ${m.venue}` : ""}
                        {m.kickoff_at ? ` · ${formatDateTime(m.kickoff_at)}` : ""}
                        {m.matchday != null ? ` · Matchday ${m.matchday}` : ""}
                      </div>

                      <div className="text-lg font-semibold mt-1">
                        {m.home_score} : {m.away_score}
                      </div>

                      <div className="mt-2 flex gap-4 text-sm">
                        <Link className="underline" href={`/matches/${m.id}`}>
                          Open match →
                        </Link>
                        <Link className="underline" href={`/admin/matches/${m.id}/live`}>
                          Live Console
                        </Link>
                        <Link className="underline" href={`/admin/matches/${m.id}/media`}>
                          Media
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
