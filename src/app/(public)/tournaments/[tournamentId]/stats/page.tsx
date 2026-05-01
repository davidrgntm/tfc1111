"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dbClient } from "@/lib/local/client";

type TournamentRow = { id: string; title: string; format: string; status: string };
type SeasonRow = { id: string; title: string; created_at: string };

type MatchRow = {
  id: string;
  status: string;
  kickoff_at: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
};

type GoalEventRow = {
  id: string;
  match_id: string;
  team_id: string | null;
  player_id: string | null;
  assist_player_id: string | null;
  minute: number | null;
  extra_minute: number | null;
  created_at: string;
  scorer: { full_name: string } | null;
  assist: { full_name: string } | null;
};

type LineupRow = {
  match_id: string;
  team_id: string;
  goalkeeper_player_id: string | null;
  gk: { full_name: string } | null;
};

type StandingForm = {
  teamId: string;
  teamName: string;
  form: ("W" | "D" | "L")[];
  PTS: number;
};

function resultLetter(homeScore: number, awayScore: number, isHome: boolean): "W" | "D" | "L" {
  if (homeScore === awayScore) return "D";
  const homeWon = homeScore > awayScore;
  if (isHome) return homeWon ? "W" : "L";
  return homeWon ? "L" : "W";
}

export default function TournamentStatsPage() {
  const params = useParams();
  const raw = (params as any)?.tournamentId;
  const tournamentId: string | undefined = Array.isArray(raw) ? raw[0] : raw;

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [goals, setGoals] = useState<GoalEventRow[]>([]);
  const [lineups, setLineups] = useState<LineupRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(currentTournamentId: string) {
    setLoading(true);
    setErr(null);

    // Tournament
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

    // Latest season
    const s = await dbClient
      .from("seasons")
      .select("id,title,created_at")
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
      setGoals([]);
      setLineups([]);
      setLoading(false);
      return;
    }
    setSeason(latestSeason);

    // Matches (this season)
    const m = await dbClient
      .from("matches")
      .select(
        `
        id,status,kickoff_at,home_team_id,away_team_id,home_score,away_score,
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

    const matchRows = (m.data ?? []) as any as MatchRow[];
    setMatches(matchRows);

    const matchIds = matchRows.map((x) => x.id);

    // Goal events (type=GOAL) for these matches
    if (matchIds.length > 0) {
      const e = await dbClient
        .from("match_events")
        .select(
          `
          id,match_id,team_id,player_id,assist_player_id,minute,extra_minute,created_at,
          scorer:players!match_events_player_id_fkey(full_name),
          assist:players!match_events_assist_player_id_fkey(full_name)
        `
        )
        .in("match_id", matchIds)
        .eq("type", "GOAL");

      if (e.error) {
        setErr(e.error.message);
        setLoading(false);
        return;
      }
      setGoals((e.data ?? []) as any);
    } else {
      setGoals([]);
    }

    // Lineups (GK) – agar jadval bo‘lsa ishlaydi, bo‘lmasa xato berishi mumkin
    // Shuning uchun xatoni "hard fail" qilmaymiz, faqat ko‘rsatamiz.
    if (matchIds.length > 0) {
      const l = await dbClient
        .from("match_lineups")
        .select(
          `
          match_id,team_id,goalkeeper_player_id,
          gk:players!match_lineups_goalkeeper_player_id_fkey(full_name)
        `
        )
        .in("match_id", matchIds);

      if (!l.error) {
        setLineups((l.data ?? []) as any);
      } else {
        // match_lineups bo‘lmasa – clean sheets blokida yozib qo‘yamiz
        setLineups([]);
      }
    } else {
      setLineups([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!tournamentId) return;
    loadAll(tournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // realtime: matches/events/lineups o‘zgarsa reload
  useEffect(() => {
    if (!season?.id || !tournamentId) return;

    const ch = dbClient
      .channel(`rt:stats:${season.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `season_id=eq.${season.id}` },
        () => loadAll(tournamentId)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events" },
        () => loadAll(tournamentId)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_lineups" },
        () => loadAll(tournamentId)
      )
      .subscribe();

    return () => {
      dbClient.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.id]);

  const finishedMatches = useMemo(
    () => matches.filter((m) => m.status === "FINISHED"),
    [matches]
  );

  const topScorers = useMemo(() => {
    const map = new Map<string, { playerId: string; name: string; goals: number }>();
    for (const g of goals) {
      if (!g.player_id) continue;
      const name = g.scorer?.full_name ?? "Unknown";
      const prev = map.get(g.player_id) ?? { playerId: g.player_id, name, goals: 0 };
      prev.goals += 1;
      map.set(g.player_id, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.goals - a.goals).slice(0, 20);
  }, [goals]);

  const topAssists = useMemo(() => {
    const map = new Map<string, { playerId: string; name: string; assists: number }>();
    for (const g of goals) {
      if (!g.assist_player_id) continue;
      const name = g.assist?.full_name ?? "Unknown";
      const prev = map.get(g.assist_player_id) ?? { playerId: g.assist_player_id, name, assists: 0 };
      prev.assists += 1;
      map.set(g.assist_player_id, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.assists - a.assists).slice(0, 20);
  }, [goals]);

  const cleanSheets = useMemo(() => {
    // lineup index: matchId + teamId => GK
    const gkMap = new Map<string, { gkId: string; gkName: string; count: number }>();

    const lineupIndex = new Map<string, LineupRow>();
    for (const l of lineups) {
      lineupIndex.set(`${l.match_id}:${l.team_id}`, l);
    }

    for (const m of finishedMatches) {
      const homeId = m.home_team_id;
      const awayId = m.away_team_id;

      // home conceded = away_score
      if (m.away_score === 0) {
        const l = lineupIndex.get(`${m.id}:${homeId}`);
        const gkId = l?.goalkeeper_player_id;
        const gkName = l?.gk?.full_name;
        if (gkId && gkName) {
          const prev = gkMap.get(gkId) ?? { gkId, gkName, count: 0 };
          prev.count += 1;
          gkMap.set(gkId, prev);
        }
      }

      // away conceded = home_score
      if (m.home_score === 0) {
        const l = lineupIndex.get(`${m.id}:${awayId}`);
        const gkId = l?.goalkeeper_player_id;
        const gkName = l?.gk?.full_name;
        if (gkId && gkName) {
          const prev = gkMap.get(gkId) ?? { gkId, gkName, count: 0 };
          prev.count += 1;
          gkMap.set(gkId, prev);
        }
      }
    }

    return Array.from(gkMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [finishedMatches, lineups]);

  const teamForm = useMemo<StandingForm[]>(() => {
    // last 5 based on FINISHED matches chronologically
    const teamMap = new Map<string, StandingForm>();

    function ensure(teamId: string, teamName: string) {
      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, { teamId, teamName, form: [], PTS: 0 });
      }
      return teamMap.get(teamId)!;
    }

    const finished = finishedMatches
      .slice()
      .sort((a, b) => {
        const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
        const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
        return ta - tb;
      });

    for (const m of matches) {
      if (m.home?.id && m.home?.name) ensure(m.home.id, m.home.name);
      if (m.away?.id && m.away?.name) ensure(m.away.id, m.away.name);
    }

    for (const m of finished) {
      const homeId = m.home?.id;
      const awayId = m.away?.id;
      const homeName = m.home?.name;
      const awayName = m.away?.name;
      if (!homeId || !awayId || !homeName || !awayName) continue;

      const H = ensure(homeId, homeName);
      const A = ensure(awayId, awayName);

      const hRes = resultLetter(m.home_score, m.away_score, true);
      const aRes = resultLetter(m.home_score, m.away_score, false);

      H.form.push(hRes);
      A.form.push(aRes);
      if (H.form.length > 5) H.form = H.form.slice(-5);
      if (A.form.length > 5) A.form = A.form.slice(-5);

      // PTS simple
      if (m.home_score > m.away_score) {
        H.PTS += 3;
      } else if (m.home_score < m.away_score) {
        A.PTS += 3;
      } else {
        H.PTS += 1;
        A.PTS += 1;
      }
    }

    return Array.from(teamMap.values()).sort((a, b) => b.PTS - a.PTS);
  }, [matches, finishedMatches]);

  if (!tournamentId) {
    return (
      <main className="p-4">
        <div className="text-red-600">
          URL’dan tournamentId olinmadi:
          <br />
          <code>/tournaments/&lt;tournamentId&gt;/stats</code>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link className="underline" href={`/tournaments/${tournamentId}`}>
          ← Turnir
        </Link>
        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={() => loadAll(tournamentId)}
        >
          Refresh
        </button>
      </div>

      {loading && <div>Yuklanmoqda...</div>}
      {err && <div className="text-red-600">Xatolik: {err}</div>}

      {!loading && !err && (
        <>
          <div className="border rounded p-3">
            <div className="text-lg font-semibold">{tournament?.title ?? "Statistika"}</div>
            <div className="text-sm text-gray-600">
              Season: {season?.title ?? "Season yo‘q"} · Matches: {matches.length} · Finished:{" "}
              {finishedMatches.length}
            </div>
          </div>

          {/* Top scorers */}
          <div className="border rounded p-3">
            <div className="font-medium mb-2">🏆 Top Scorers</div>
            {topScorers.length === 0 ? (
              <div className="text-gray-600 text-sm">Hozircha gol yo‘q.</div>
            ) : (
              <div className="space-y-1 text-sm">
                {topScorers.map((x, i) => (
                  <div key={x.playerId} className="flex justify-between">
                    <div>
                      {i + 1}. {x.name}
                    </div>
                    <div className="font-semibold">{x.goals}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top assists */}
          <div className="border rounded p-3">
            <div className="font-medium mb-2">🅰️ Top Assists</div>
            {topAssists.length === 0 ? (
              <div className="text-gray-600 text-sm">Hozircha assist yo‘q.</div>
            ) : (
              <div className="space-y-1 text-sm">
                {topAssists.map((x, i) => (
                  <div key={x.playerId} className="flex justify-between">
                    <div>
                      {i + 1}. {x.name}
                    </div>
                    <div className="font-semibold">{x.assists}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clean sheets */}
          <div className="border rounded p-3">
            <div className="font-medium mb-2">🧤 Clean Sheets (GK)</div>
            {finishedMatches.length === 0 ? (
              <div className="text-gray-600 text-sm">Clean sheet FINISHED matchlarda hisoblanadi.</div>
            ) : cleanSheets.length === 0 ? (
              <div className="text-gray-600 text-sm">
                Clean sheets hozircha chiqmayapti. Sabablar:
                <ul className="list-disc ml-5 mt-1">
                  <li>match_lineups’da GK kiritilmagan</li>
                  <li>yoki match_lineups jadvali yo‘q (bo‘lsa yuqoridagi SQL bilan yarating)</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {cleanSheets.map((x, i) => (
                  <div key={x.gkId} className="flex justify-between">
                    <div>
                      {i + 1}. {x.gkName}
                    </div>
                    <div className="font-semibold">{x.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team form */}
          <div className="border rounded p-3">
            <div className="font-medium mb-2">📈 Team Form (last 5)</div>
            {teamForm.length === 0 ? (
              <div className="text-gray-600 text-sm">Jamoalar topilmadi.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {teamForm.map((t) => (
                  <div key={t.teamId} className="flex items-center justify-between border rounded p-2">
                    <div className="font-medium">{t.teamName}</div>
                    <div className="flex gap-1">
                      {t.form.length === 0 ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        t.form.map((r, i) => (
                          <span key={i} className="border rounded px-1">
                            {r}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rating placeholder */}
          <div className="border rounded p-3">
            <div className="font-medium mb-1">🔥 Player heat-level (match rating)</div>
            <div className="text-sm text-gray-600">
              Bu modulni keyingi bosqichda qo‘shamiz: user 1–10 baho beradi → o‘rtacha rating chiqadi.
              Hozir Auth (login) yo‘q bo‘lgani uchun “toza” variantini keyin qilamiz.
            </div>
          </div>
        </>
      )}
    </main>
  );
}
