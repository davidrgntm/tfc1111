"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  home: { name: string } | null;
  away: { name: string } | null;
};

type TeamRow = { id: string; name: string };
type PlayerRow = { id: string; full_name: string };

const EVENT_TYPES = ["GOAL", "YELLOW", "RED", "FOUL"] as const;

export default function LiveConsolePage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // form
  const [teamId, setTeamId] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>(""); // non-goal uchun majburiy (goal uchun ixtiyoriy)
  const [assistPlayerId, setAssistPlayerId] = useState<string>(""); // goal detail bo‘lsa ixtiyoriy
  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>("GOAL");
  const [minute, setMinute] = useState<number>(1);
  const [extra, setExtra] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  // ✅ GOAL’da scorer/assist “so‘ralmaydi” (default off). Xohlasangiz yoqasiz.
  const [goalDetails, setGoalDetails] = useState(false);

  const title = useMemo(() => {
    if (!match) return "Live Console";
    return `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`;
  }, [match]);

  useEffect(() => {
    if (!matchId) return;

    let cancelled = false;

    async function loadMatch() {
      setLoading(true);
      setMsg(null);

      const m = await supabase
        .from("matches")
        .select(
          `
          id,status,home_team_id,away_team_id,home_score,away_score,
          home:teams!matches_home_team_id_fkey(name),
          away:teams!matches_away_team_id_fkey(name)
        `
        )
        .eq("id", matchId)
        .single();

      if (cancelled) return;

      if (m.error) {
        setMsg(`Match xato: ${m.error.message}`);
        setLoading(false);
        return;
      }

      const row = m.data as MatchRow;
      setMatch(row);

      const t: TeamRow[] = [
        { id: row.home_team_id, name: row.home?.name ?? "Home" },
        { id: row.away_team_id, name: row.away?.name ?? "Away" },
      ];
      setTeams(t);
      setTeamId(t[0]?.id ?? "");
      setLoading(false);
    }

    loadMatch();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;

    async function loadPlayers() {
      const { data, error } = await supabase
        .from("players")
        .select("id,full_name")
        .eq("team_id", teamId)
        .order("full_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        setMsg(`Players xato: ${error.message}`);
        setPlayers([]);
        setPlayerId("");
        setAssistPlayerId("");
        return;
      }

      setPlayers(data ?? []);

      // Non-goal eventlar uchun tezlik: default birinchi o‘yinchi
      // (GOAL’da ishlatmaymiz, goalDetails off bo‘lsa baribir null ketadi)
      setPlayerId(data?.[0]?.id ?? "");
      setAssistPlayerId("");
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // Type o‘zgarsa: GOAL bo‘lsa detallarni default o‘chirib qo‘yamiz
  useEffect(() => {
    if (type === "GOAL") {
      setGoalDetails(false);
      setAssistPlayerId("");
      // playerId’ni o‘chirib yubormaymiz (agar keyin detail yoqsa, tanlab qo‘yish oson bo‘lsin)
    } else {
      setGoalDetails(false);
      setAssistPlayerId("");
    }
  }, [type]);

  async function setStatus(nextStatus: string) {
    if (!matchId) return;
    setMsg(null);

    const { error } = await supabase.from("matches").update({ status: nextStatus }).eq("id", matchId);

    if (error) return setMsg(`Status xato: ${error.message}`);
    setMsg(`Status yangilandi: ${nextStatus}`);
  }

  async function addEvent() {
    if (!matchId) return setMsg("matchId topilmadi");
    if (!match) return setMsg("Match hali yuklanmadi");
    if (!teamId) return setMsg("Team tanlang");

    // ✅ GOAL’da player majburiy emas
    if (type !== "GOAL" && !playerId) return setMsg("Player tanlang");

    setMsg(null);

    const scorerToSave =
      type === "GOAL"
        ? goalDetails
          ? (playerId || null) // detail yoqilgan bo‘lsa ham “no scorer” mumkin
          : null // detail o‘chiq bo‘lsa: umuman scorer saqlamaymiz
        : playerId;

    const assistToSave =
      type === "GOAL" && goalDetails
        ? assistPlayerId && scorerToSave && assistPlayerId !== scorerToSave
          ? assistPlayerId
          : null
        : null;

    const insert = await supabase.from("match_events").insert({
      match_id: matchId,
      team_id: teamId,
      player_id: scorerToSave, // ✅ endi null bo‘lishi mumkin
      assist_player_id: assistToSave, // ✅ endi null bo‘lishi mumkin
      type,
      minute,
      extra_minute: extra,
      note: note || null,
    });

    if (insert.error) return setMsg(`Event xato: ${insert.error.message}`);

    // GOAL bo‘lsa score yangilanadi (MVP)
    if (type === "GOAL") {
      const isHome = teamId === match.home_team_id;
      const newHome = match.home_score + (isHome ? 1 : 0);
      const newAway = match.away_score + (isHome ? 0 : 1);

      const upd = await supabase
        .from("matches")
        .update({ home_score: newHome, away_score: newAway })
        .eq("id", matchId);

      if (upd.error) return setMsg(`Score update xato: ${upd.error.message}`);

      setMatch({ ...match, home_score: newHome, away_score: newAway });
    }

    setMsg("Event qo‘shildi ✅");
    setNote("");
    setAssistPlayerId("");
    setGoalDetails(false); // keyingi gol tez kiritilishi uchun
  }

  if (!matchId) {
    return (
      <main className="p-4">
        <div className="text-red-600">
          URL’dan matchId olinmadi. To‘g‘ri format:
          <br />
          <code>/admin/matches/&lt;id&gt;/live</code>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          {match && (
            <div className="text-sm text-gray-600">
              Status: {match.status} · Score: {match.home_score}:{match.away_score}
            </div>
          )}
        </div>

        <div className="flex gap-3 text-sm">
          <Link className="underline" href={`/matches/${matchId}`}>
            Public view
          </Link>
          <Link className="underline" href="/admin/matches">
            Matches
          </Link>
          <Link className="underline" href={`/admin/matches/${matchId}/lineups`}>
            GK
          </Link>
        </div>
      </div>

      {loading && <div>Yuklanmoqda...</div>}
      {msg && <div className="text-sm">{msg}</div>}

      {match && (
        <div className="border rounded p-3 space-y-3">
          <div className="flex gap-2">
            <button className="border rounded px-3 py-1" onClick={() => setStatus("LIVE")}>
              LIVE
            </button>
            <button className="border rounded px-3 py-1" onClick={() => setStatus("FINISHED")}>
              FINISHED
            </button>
          </div>

          <label className="text-sm">
            Team:
            <select
              className="border rounded w-full p-2 mt-1"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Type:
            <select
              className="border rounded w-full p-2 mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as (typeof EVENT_TYPES)[number])}
            >
              {EVENT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          {/* ✅ GOAL uchun scorer/assist so‘ralmaydi */}
          {type === "GOAL" ? (
            <div className="border rounded p-2 text-sm space-y-2">
              <div className="text-gray-600">
                GOAL qo‘shishda hozircha <b>scorer/assist</b> so‘ralmaydi. Xohlasangiz pastdan “detal”ni yoqib,
                ixtiyoriy kiritasiz.
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={goalDetails}
                  onChange={(e) => setGoalDetails(e.target.checked)}
                />
                Scorer/assist kiritish (ixtiyoriy)
              </label>

              {goalDetails && (
                <>
                  <label className="text-sm">
                    Scorer (ixtiyoriy):
                    <select
                      className="border rounded w-full p-2 mt-1"
                      value={playerId}
                      onChange={(e) => setPlayerId(e.target.value)}
                    >
                      <option value="">No scorer</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    Assist (ixtiyoriy):
                    <select
                      className="border rounded w-full p-2 mt-1"
                      value={assistPlayerId}
                      onChange={(e) => setAssistPlayerId(e.target.value)}
                      disabled={!playerId}
                      title={!playerId ? "Avval scorer tanlang (yoki No scorer qoldiring)" : ""}
                    >
                      <option value="">No assist</option>
                      {players
                        .filter((p) => p.id !== playerId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          ) : (
            <label className="text-sm">
              Player (majburiy):
              <select
                className="border rounded w-full p-2 mt-1"
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
              >
                <option value="">- tanlang -</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Minute:
              <input
                className="border rounded w-full p-2 mt-1"
                type="number"
                min={0}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              />
            </label>

            <label className="text-sm">
              Extra:
              <input
                className="border rounded w-full p-2 mt-1"
                type="number"
                min={0}
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="text-sm">
            Note (ixtiyoriy):
            <input
              className="border rounded w-full p-2 mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="masalan: penalti, jarohat..."
            />
          </label>

          <button className="border rounded px-3 py-2" onClick={addEvent}>
            Event qo‘shish
          </button>
        </div>
      )}
    </div>
  );
}
