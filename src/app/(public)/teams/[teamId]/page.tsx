"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dbClient } from "@/lib/local/client";

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

type SeasonRow = {
  id: string;
  title: string;
  tournament_id: string;
  created_at: string;
};

type TournamentRow = {
  id: string;
  title: string;
  logo_url: string | null;
  format?: string | null;
  status?: string | null;
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
  home_team_id: string;
  away_team_id: string;
  home: { id: string; name: string; logo_url: string | null } | null;
  away: { id: string; name: string; logo_url: string | null } | null;
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
};

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function normalizeJoin<T>(x: any): T | null {
  if (!x) return null;
  if (Array.isArray(x)) return (x[0] ?? null) as T | null;
  return x as T;
}

function resultChar(teamId: string, m: MatchRow): "W" | "D" | "L" | "-" {
  if (m.status !== "FINISHED") return "-";
  const isHome = m.home_team_id === teamId;
  const isAway = m.away_team_id === teamId;
  if (!isHome && !isAway) return "-";

  const my = isHome ? m.home_score : m.away_score;
  const opp = isHome ? m.away_score : m.home_score;

  if (my > opp) return "W";
  if (my < opp) return "L";
  return "D";
}

export default function PublicTeamPage() {
  const params = useParams();
  const raw = (params as any)?.teamId;
  const teamId: string | undefined = Array.isArray(raw) ? raw[0] : raw;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamRow | null>(null);

  // Team qatnashgan seasonlar (season_teams orqali)
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");

  const [tournament, setTournament] = useState<TournamentRow | null>(null);

  // matches (tanlangan season bo‘yicha)
  const [matches, setMatches] = useState<MatchRow[]>([]);

  // roster (ixtiyoriy: players table bo‘lsa)
  const [players, setPlayers] = useState<any[]>([]);

  async function loadAll(currentTeamId: string) {
    setLoading(true);
    setMsg(null);

    // 1) Team
    const t = await dbClient
      .from("teams")
      .select("id,name,logo_url")
      .eq("id", currentTeamId)
      .single();

    if (t.error) {
      setMsg(`Team topilmadi: ${t.error.message}`);
      setTeam(null);
      setLoading(false);
      return;
    }
    setTeam(t.data as any);

    // 2) Seasons (season_teams orqali)
    const st = await dbClient
      .from("season_teams")
      .select("season:seasons(id,title,tournament_id,created_at)")
      .eq("team_id", currentTeamId);

    if (st.error) {
      setMsg(`Season’lar xato: ${st.error.message}`);
      setSeasons([]);
      setSelectedSeasonId("");
      setLoading(false);
      return;
    }

    const seasonList = (st.data ?? [])
      .map((x: any) => normalizeJoin<SeasonRow>(x.season))
      .filter(Boolean) as SeasonRow[];

    seasonList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setSeasons(seasonList);

    const defaultSeason = seasonList[0]?.id ?? "";
    setSelectedSeasonId((prev) => prev || defaultSeason);

    // 3) Players (agar jadval bo‘lsa — bo‘lmasa jim)
    const pl = await dbClient
      .from("players")
      .select("id,full_name,name,position,number,team_id")
      .eq("team_id", currentTeamId)
      .order("number", { ascending: true });

    if (pl.error) {
      // players jadvali yo‘q bo‘lishi mumkin — MVP’da normal
      setPlayers([]);
    } else {
      setPlayers(pl.data ?? []);
    }

    setLoading(false);
  }

  async function loadSeasonData(currentSeasonId: string) {
    if (!teamId) return;
    if (!currentSeasonId) {
      setTournament(null);
      setMatches([]);
      return;
    }

    setMsg(null);

    // Season
    const s = await dbClient
      .from("seasons")
      .select("id,title,tournament_id,created_at")
      .eq("id", currentSeasonId)
      .single();

    if (s.error) {
      setMsg(`Season xato: ${s.error.message}`);
      setTournament(null);
      setMatches([]);
      return;
    }

    // Tournament
    const tr = await dbClient
      .from("tournaments")
      .select("id,title,logo_url,format,status")
      .eq("id", (s.data as any).tournament_id)
      .single();

    if (!tr.error) setTournament(tr.data as any);

    // Matches (season bo‘yicha, team qatnashganlarini ajratib ko‘rsatamiz)
    const m = await dbClient
      .from("matches")
      .select(
        `
        id,season_id,matchday,kickoff_at,venue,status,home_score,away_score,home_team_id,away_team_id,
        home:teams!matches_home_team_id_fkey(id,name,logo_url),
        away:teams!matches_away_team_id_fkey(id,name,logo_url)
      `
      )
      .eq("season_id", currentSeasonId)
      .order("matchday", { ascending: true, nullsFirst: true })
      .order("kickoff_at", { ascending: true, nullsFirst: true });

    if (m.error) {
      setMsg(`Matches xato: ${m.error.message}`);
      setMatches([]);
      return;
    }

    const rows = (m.data ?? []).map((r: any) => ({
      ...r,
      home: normalizeJoin(r.home),
      away: normalizeJoin(r.away),
    })) as MatchRow[];

    setMatches(rows);
  }

  useEffect(() => {
    if (!teamId) return;
    loadAll(teamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    loadSeasonData(selectedSeasonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId]);

  const myMatches = useMemo(() => {
    if (!teamId) return [];
    return matches.filter((m) => m.home_team_id === teamId || m.away_team_id === teamId);
  }, [matches, teamId]);

  const last5 = useMemo(() => {
    if (!teamId) return [];
    const fin = myMatches
      .filter((m) => m.status === "FINISHED" && m.kickoff_at)
      .slice()
      .sort((a, b) => new Date(b.kickoff_at!).getTime() - new Date(a.kickoff_at!).getTime());
    return fin.slice(0, 5).map((m) => resultChar(teamId, m));
  }, [myMatches, teamId]);

  const standings: Standing[] = useMemo(() => {
    const teamMap = new Map<string, Standing>();

    function ensure(id: string, name: string) {
      if (!teamMap.has(id)) {
        teamMap.set(id, { teamId: id, teamName: name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 });
      }
      return teamMap.get(id)!;
    }

    for (const m of matches) {
      if (m.home?.id && m.home?.name) ensure(m.home.id, m.home.name);
      if (m.away?.id && m.away?.name) ensure(m.away.id, m.away.name);
    }

    for (const m of matches.filter((x) => x.status === "FINISHED")) {
      if (!m.home?.id || !m.away?.id) continue;

      const H = ensure(m.home.id, m.home.name);
      const A = ensure(m.away.id, m.away.name);

      H.P += 1; A.P += 1;
      H.GF += m.home_score; H.GA += m.away_score;
      A.GF += m.away_score; A.GA += m.home_score;

      if (m.home_score > m.away_score) { H.W += 1; A.L += 1; H.PTS += 3; }
      else if (m.home_score < m.away_score) { A.W += 1; H.L += 1; A.PTS += 3; }
      else { H.D += 1; A.D += 1; H.PTS += 1; A.PTS += 1; }
    }

    for (const s of teamMap.values()) s.GD = s.GF - s.GA;

    return Array.from(teamMap.values()).sort((a, b) => {
      if (b.PTS !== a.PTS) return b.PTS - a.PTS;
      if (b.GD !== a.GD) return b.GD - a.GD;
      if (b.GF !== a.GF) return b.GF - a.GF;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [matches]);

  const myStandingIndex = useMemo(() => {
    if (!teamId) return -1;
    return standings.findIndex((s) => s.teamId === teamId);
  }, [standings, teamId]);

  if (!teamId) {
    return (
      <main className="p-4">
        <div className="text-red-400">teamId topilmadi</div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-4">
      {/* Top nav */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link className="underline text-sm" href="/">
            ← Home
          </Link>

          <div className="flex items-center gap-3 mt-2">
            <div className="w-14 h-14 rounded bg-white/10 overflow-hidden flex items-center justify-center">
              {team?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.logo_url} alt={team?.name ?? "team"} className="w-full h-full object-contain" />
              ) : (
                <div className="text-xs text-gray-500">no logo</div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-xl font-semibold truncate">{team?.name ?? "Team"}</div>
              <div className="text-xs text-gray-400">
                {tournament?.title ? `🏆 ${tournament.title}` : ""}{" "}
                {selectedSeasonId ? `· Season: ${seasons.find(s => s.id === selectedSeasonId)?.title ?? ""}` : ""}
              </div>
              <div className="text-xs text-gray-500">
                Form (last 5):{" "}
                {last5.length ? (
                  <span className="font-semibold text-gray-200">{last5.join(" - ")}</span>
                ) : (
                  <span>yo‘q</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <Link className="underline text-sm" href="/admin/teams">
          Admin →
        </Link>
      </div>

      {msg && <div className="text-sm text-red-400">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && (
        <>
          {/* Season selector */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">Season tanlash</div>

            {seasons.length === 0 ? (
              <div className="text-sm text-gray-400">
                Bu jamoa hali hech qaysi season’ga qo‘shilmagan.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="border rounded p-2 text-sm bg-black"
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(e.target.value)}
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>

                {tournament?.id ? (
                  <Link className="underline text-sm" href={`/tournaments/${tournament.id}`}>
                    Tournament page →
                  </Link>
                ) : null}
              </div>
            )}

            <div className="text-xs text-gray-500 break-all">
              Team ID: <code>{teamId}</code>
            </div>
          </section>

          {/* Standings (highlight my team) */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">📊 Standings</div>

            {standings.length === 0 ? (
              <div className="text-sm text-gray-400">Hozircha tablitsa yo‘q.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left py-1 pr-2">#</th>
                      <th className="text-left py-1 pr-2">Team</th>
                      <th className="text-right py-1 px-2">P</th>
                      <th className="text-right py-1 px-2">GD</th>
                      <th className="text-right py-1 pl-2">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, i) => {
                      const isMe = s.teamId === teamId;
                      return (
                        <tr key={s.teamId} className={`border-t border-gray-800 ${isMe ? "bg-white/5" : ""}`}>
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isMe ? "text-white" : ""}`}>{s.teamName}</span>
                              {isMe ? <span className="text-xs text-gray-400">(this team)</span> : null}
                            </div>
                          </td>
                          <td className="py-1 px-2 text-right">{s.P}</td>
                          <td className="py-1 px-2 text-right">{s.GD}</td>
                          <td className="py-1 pl-2 text-right font-semibold">{s.PTS}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {myStandingIndex >= 0 ? (
              <div className="text-xs text-gray-500">
                Sizning o‘rningiz: <span className="font-semibold text-gray-200">{myStandingIndex + 1}</span>
              </div>
            ) : null}
          </section>

          {/* Matches */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">🗓 Matchlar</div>

            {myMatches.length === 0 ? (
              <div className="text-sm text-gray-400">Bu season’da matchlar yo‘q.</div>
            ) : (
              <div className="space-y-2">
                {myMatches.map((m) => (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="block border rounded p-2 hover:bg-white/5 transition"
                  >
                    <div className="font-medium">
                      {m.home?.name ?? "Home"}{" "}
                      <span className="text-gray-400">
                        {m.status === "FINISHED" || m.status === "LIVE" ? `${m.home_score}:${m.away_score}` : "vs"}
                      </span>{" "}
                      {m.away?.name ?? "Away"}
                    </div>
                    <div className="text-xs text-gray-400">
                      MD: {m.matchday ?? "-"} · {m.status} · {fmtDT(m.kickoff_at)} · {m.venue ?? "-"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Roster (ixtiyoriy) */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">👥 Roster</div>
            <div className="text-xs text-gray-400">
              Bu bo‘lim `players` jadvali bo‘lsa avtomatik chiqadi. Bo‘lmasa — keyin qo‘shamiz.
            </div>

            {players.length === 0 ? (
              <div className="text-sm text-gray-400">Hozircha o‘yinchilar yo‘q (yoki players jadvali yo‘q).</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {players.map((p: any) => (
                  <div key={p.id} className="border rounded p-2">
                    <div className="font-medium">
                      {p.full_name ?? p.name ?? "Player"}
                      {p.number != null ? <span className="text-gray-400"> · #{p.number}</span> : null}
                    </div>
                    <div className="text-xs text-gray-500">
                      position: {p.position ?? "-"} · id: <code>{p.id}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick admin links */}
          <section className="border rounded p-3">
            <div className="font-medium">🔧 Admin quick</div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <Link className="underline" href="/admin/teams">Teams</Link>
              <Link className="underline" href="/admin/seasons">Seasons</Link>
              {tournament?.id ? (
                <Link className="underline" href={`/admin/tournaments/${tournament.id}/telegram`}>Telegram</Link>
              ) : null}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
