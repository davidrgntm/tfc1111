"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home: { name: string } | null;
  away: { name: string } | null;
};

type PlayerRow = { id: string; full_name: string };

type LineupRow = {
  team_id: string;
  goalkeeper_player_id: string | null;
};

export default function MatchLineupsPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [match, setMatch] = useState<MatchRow | null>(null);

  const [homePlayers, setHomePlayers] = useState<PlayerRow[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<PlayerRow[]>([]);

  const [homeGk, setHomeGk] = useState<string>("");
  const [awayGk, setAwayGk] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!match) return "GK / Lineups";
    return `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"} · GK`;
  }, [match]);

  async function loadAll(currentMatchId: string) {
    setLoading(true);
    setMsg(null);

    const m = await supabase
      .from("matches")
      .select(
        `
        id,home_team_id,away_team_id,
        home:teams!matches_home_team_id_fkey(name),
        away:teams!matches_away_team_id_fkey(name)
      `
      )
      .eq("id", currentMatchId)
      .single();

    if (m.error) {
      setMsg(`Match xato: ${m.error.message}`);
      setLoading(false);
      return;
    }

    const row = m.data as MatchRow;
    setMatch(row);

    const hp = await supabase
      .from("players")
      .select("id,full_name")
      .eq("team_id", row.home_team_id)
      .order("full_name", { ascending: true });

    const ap = await supabase
      .from("players")
      .select("id,full_name")
      .eq("team_id", row.away_team_id)
      .order("full_name", { ascending: true });

    if (hp.error) setMsg(`Home players xato: ${hp.error.message}`);
    if (ap.error) setMsg(`Away players xato: ${ap.error.message}`);

    setHomePlayers(hp.data ?? []);
    setAwayPlayers(ap.data ?? []);

    // existing GK from match_lineups
    const lu = await supabase
      .from("match_lineups")
      .select("team_id,goalkeeper_player_id")
      .eq("match_id", currentMatchId);

    if (lu.error) {
      setMsg(`match_lineups xato: ${lu.error.message}`);
      setHomeGk("");
      setAwayGk("");
      setLoading(false);
      return;
    }

    const arr = (lu.data ?? []) as LineupRow[];
    const homeRow = arr.find((x) => x.team_id === row.home_team_id);
    const awayRow = arr.find((x) => x.team_id === row.away_team_id);

    setHomeGk(homeRow?.goalkeeper_player_id ?? "");
    setAwayGk(awayRow?.goalkeeper_player_id ?? "");

    setLoading(false);
  }

  useEffect(() => {
    if (!matchId) return;

    async function load() {
      await loadAll(matchId);
    }

    load();
  }, [matchId]);

  async function saveGk(teamId: string, gkId: string | null) {
    if (!matchId) return;
    setMsg(null);

    const { error } = await supabase
      .from("match_lineups")
      .upsert(
        {
          match_id: matchId,
          team_id: teamId,
          goalkeeper_player_id: gkId,
        },
        { onConflict: "match_id,team_id" }
      );

    if (error) return setMsg(`Saqlash xato: ${error.message}`);
    setMsg("GK saqlandi ✅");
  }

  if (!matchId) {
    return <main className="p-4 text-red-600">matchId topilmadi</main>;
  }

  return (
    <main className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/admin/matches">
            Matches
          </Link>
          <Link className="underline" href={`/admin/matches/${matchId}/live`}>
            Live
          </Link>
          <Link className="underline" href={`/matches/${matchId}`}>
            Public
          </Link>
        </div>
      </div>

      {loading && <div>Yuklanmoqda...</div>}
      {msg && <div className="text-sm">{msg}</div>}

      {match && (
        <>
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">Home GK: {match.home?.name ?? "Home"}</div>
            <select
              className="border rounded w-full p-2"
              value={homeGk}
              onChange={(e) => setHomeGk(e.target.value)}
            >
              <option value="">Tanlanmagan</option>
              {homePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>

            <button
              className="border rounded px-3 py-2"
              onClick={() => saveGk(match.home_team_id, homeGk || null)}
            >
              Home GK saqlash
            </button>
          </section>

          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">Away GK: {match.away?.name ?? "Away"}</div>
            <select
              className="border rounded w-full p-2"
              value={awayGk}
              onChange={(e) => setAwayGk(e.target.value)}
            >
              <option value="">Tanlanmagan</option>
              {awayPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>

            <button
              className="border rounded px-3 py-2"
              onClick={() => saveGk(match.away_team_id, awayGk || null)}
            >
              Away GK saqlash
            </button>
          </section>
        </>
      )}
    </main>
  );
}
