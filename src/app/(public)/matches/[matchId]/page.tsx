"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dbClient } from "@/lib/local/client";

type TeamMini = { id: string; name: string; logo_url?: string | null };

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
  home: TeamMini | null;
  away: TeamMini | null;
};

type SeasonRow = { id: string; title: string; tournament_id: string };
type TournamentRow = { id: string; title: string; logo_url: string | null };

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function safeStr(x: any) {
  if (x == null) return "";
  return String(x);
}

function eventLabel(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("goal")) return "⚽ Goal";
  if (t.includes("yellow")) return "🟨 Yellow";
  if (t.includes("red")) return "🟥 Red";
  if (t.includes("foul")) return "🚫 Foul";
  if (t.includes("sub")) return "🔁 Sub";
  if (t.includes("pen")) return "🥅 Penalty";
  return "• Event";
}

export default function PublicMatchPage() {
  const params = useParams();
  const raw = (params as any)?.matchId;
  const matchId: string | undefined = Array.isArray(raw) ? raw[0] : raw;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);

  const [events, setEvents] = useState<any[]>([]);

  async function loadAll(id: string) {
    setLoading(true);
    setMsg(null);

    // Match
    const m = await dbClient
      .from("matches")
      .select(
        `
        id,season_id,matchday,kickoff_at,venue,status,home_score,away_score,home_team_id,away_team_id,
        home:teams!matches_home_team_id_fkey(id,name,logo_url),
        away:teams!matches_away_team_id_fkey(id,name,logo_url)
      `
      )
      .eq("id", id)
      .single();

    if (m.error) {
      setMsg(`Match topilmadi: ${m.error.message}`);
      setLoading(false);
      return;
    }

    const mRow = m.data as any as MatchRow;
    setMatch(mRow);

    // Season
    const s = await dbClient
      .from("seasons")
      .select("id,title,tournament_id")
      .eq("id", mRow.season_id)
      .single();

    if (!s.error) setSeason(s.data as any);

    // Tournament
    if (!s.error) {
      const t = await dbClient
        .from("tournaments")
        .select("id,title,logo_url")
        .eq("id", (s.data as any).tournament_id)
        .single();
      if (!t.error) setTournament(t.data as any);
    }

    // Events (agar jadval bo‘lsa)
    // select("*") – schema farq qilsa ham eng mos
    const ev = await dbClient
      .from("match_events")
      .select("*")
      .eq("match_id", id)
      .order("minute", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true, nullsFirst: true });

    if (ev.error) {
      // match_events yo‘q bo‘lsa ham match sahifa ishlayversin
      setEvents([]);
    } else {
      setEvents(ev.data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!matchId) return;
    loadAll(matchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Real-time: match_events o‘zgarsa yangilansin (ixtiyoriy)
  useEffect(() => {
    if (!matchId) return;

    const ch = dbClient
      .channel(`rt:public:match:${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${matchId}` },
        () => loadAll(matchId)
      )
      .subscribe();

    return () => {
      dbClient.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const title = useMemo(() => {
    const h = match?.home?.name ?? "Home";
    const a = match?.away?.name ?? "Away";
    const mid = match?.status === "LIVE" || match?.status === "FINISHED" ? `${match?.home_score}:${match?.away_score}` : "vs";
    return `${h} ${mid} ${a}`;
  }, [match]);

  const timeline = useMemo(() => {
    // eventlarda minute/type/player_name etc bo‘lishi mumkin
    return (events ?? []).map((e) => {
      const minute = e.minute ?? e.min ?? e.time_minute ?? null;
      const type = e.type ?? e.event_type ?? e.kind ?? "";
      const teamId = e.team_id ?? e.teamId ?? null;
      const player = e.player_name ?? e.player ?? e.player_full_name ?? e.playerId ?? "";
      const assist = e.assist_name ?? e.assist ?? e.assist_player_name ?? "";
      const note = e.note ?? e.details ?? "";

      return { raw: e, minute, type, teamId, player, assist, note };
    });
  }, [events]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMsg("Link nusxa olindi ✅");
      setTimeout(() => setMsg(null), 1200);
    } catch {
      setMsg("Linkni nusxa qilib bo‘lmadi");
    }
  }

  if (!matchId) {
    return (
      <main className="p-4">
        <div className="text-red-400">matchId topilmadi</div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-4">
      {/* Top nav */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="underline" href="/">← Home</Link>
            {tournament ? (
              <Link className="underline" href={`/tournaments/${tournament.id}`}>
                ← Tournament
              </Link>
            ) : null}
          </div>

          <div className="text-xs text-gray-400">
            {tournament?.title ? `🏆 ${tournament.title}` : " "}{" "}
            {season?.title ? `· ${season.title}` : ""}{" "}
            {match?.matchday ? `· ${match.matchday}-tur` : ""}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <button className="border rounded px-3 py-1" onClick={copyLink}>
            Share
          </button>
          <Link className="underline" href={`/admin/matches/${matchId}/live`}>
            Admin Live →
          </Link>
        </div>
      </div>

      {msg && <div className="text-sm text-red-400">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && match && (
        <>
          {/* Scoreboard */}
          <section className="border rounded p-3">
            <div className="text-xs text-gray-400">
              {match.status} · {fmtDT(match.kickoff_at)} · {match.venue ?? "-"}
            </div>

            <div className="mt-2 grid grid-cols-3 items-center gap-2">
              <TeamBlock team={match.home} align="left" />
              <div className="text-center">
                <div className="text-2xl font-semibold">
                  {match.status === "LIVE" || match.status === "FINISHED"
                    ? `${match.home_score}:${match.away_score}`
                    : "vs"}
                </div>
                <div className="text-xs text-gray-400">{match.matchday ? `${match.matchday}-tur` : ""}</div>
              </div>
              <TeamBlock team={match.away} align="right" />
            </div>

            <div className="text-xs text-gray-500 mt-2">
              Match ID: <code>{match.id}</code>
            </div>
          </section>

          {/* Timeline */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">🕒 Timeline</div>

            {events.length === 0 ? (
              <div className="text-sm text-gray-400">
                Hozircha event yo‘q (yoki match_events jadvali bo‘sh).
              </div>
            ) : (
              <div className="space-y-2">
                {timeline.map((e, idx) => {
                  const isHome = e.teamId && match.home_team_id === e.teamId;
                  const isAway = e.teamId && match.away_team_id === e.teamId;

                  return (
                    <div key={idx} className="border rounded p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">
                          {e.minute != null ? `${e.minute}' ` : ""}{eventLabel(e.type)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {isHome ? (match.home?.name ?? "Home") : isAway ? (match.away?.name ?? "Away") : ""}
                        </div>
                      </div>

                      <div className="text-sm mt-1">
                        {safeStr(e.player)}
                        {e.assist ? <span className="text-gray-400"> · assist: {safeStr(e.assist)}</span> : null}
                      </div>

                      {e.note ? <div className="text-xs text-gray-500 mt-1">{safeStr(e.note)}</div> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick links */}
          <section className="border rounded p-3">
            <div className="font-medium">🔗 Quick</div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <Link className="underline" href={`/admin/matches/${matchId}/media`}>
                Admin Media
              </Link>
              {tournament ? (
                <Link className="underline" href={`/admin/tournaments/${tournament.id}/telegram`}>
                  Admin Telegram
                </Link>
              ) : null}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function TeamBlock({ team, align }: { team: TeamMini | null; align: "left" | "right" }) {
  const cls = align === "right" ? "text-right" : "text-left";

  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : "justify-start"}`}>
      {align === "right" ? null : <TeamLogo team={team} />}
      <div className={`min-w-0 ${cls}`}>
        <div className="font-semibold truncate">{team?.name ?? "-"}</div>
        {team?.id ? (
          <Link className="text-xs underline text-gray-300" href={`/teams/${team.id}`}>
            Team page →
          </Link>
        ) : (
          <div className="text-xs text-gray-500"> </div>
        )}
      </div>
      {align === "right" ? <TeamLogo team={team} /> : null}
    </div>
  );
}

function TeamLogo({ team }: { team: TeamMini | null }) {
  return (
    <div className="w-10 h-10 rounded bg-white/10 overflow-hidden flex items-center justify-center">
      {team?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt={team?.name ?? "team"} className="w-full h-full object-contain" />
      ) : (
        <div className="text-[10px] text-gray-500">no logo</div>
      )}
    </div>
  );
}
