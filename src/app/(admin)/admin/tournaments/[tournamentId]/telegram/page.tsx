// src/app/(admin)/admin/tournaments/[tournamentId]/telegram/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type TournamentRow = {
  id: string;
  title: string;
  format: string;
  status: string;
  logo_url: string | null;
};

type SeasonRow = { id: string; title: string; created_at: string };

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
};

function pad(s: string, n: number) {
  const x = s ?? "";
  if (x.length >= n) return x.slice(0, n);
  return x + " ".repeat(n - x.length);
}

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function stripHtml(input: string) {
  return input.replace(/<[^>]*>/g, "");
}

export default function TournamentTelegramPage() {
  const params = useParams();
  const raw = (params as any)?.tournamentId;
  const tournamentId: string | undefined = Array.isArray(raw) ? raw[0] : raw;

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teamLogoById, setTeamLogoById] = useState<Record<string, string | null>>({}); // ✅ team logo map

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [sendingText, setSendingText] = useState(false);
  const [sendingStandingsPhoto, setSendingStandingsPhoto] = useState(false);
  const [sendingMatchdayPhoto, setSendingMatchdayPhoto] = useState(false);
  const [sendingRoundPoster, setSendingRoundPoster] = useState(false);
  const [sendingRoundPosterPro, setSendingRoundPosterPro] = useState(false);

  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);

  async function loadAll(currentTournamentId: string) {
    setLoading(true);
    setMsg(null);

    // Tournament (logo_url ham olinadi)
    const t = await supabase
      .from("tournaments")
      .select("id,title,format,status,logo_url")
      .eq("id", currentTournamentId)
      .single();

    if (t.error) {
      setMsg(`Tournament xato: ${t.error.message}`);
      setLoading(false);
      return;
    }
    setTournament(t.data as TournamentRow);

    // Latest season
    const s = await supabase
      .from("seasons")
      .select("id,title,created_at")
      .eq("tournament_id", currentTournamentId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (s.error) {
      setMsg(`Season xato: ${s.error.message}`);
      setLoading(false);
      return;
    }

    const latestSeason = (s.data ?? [])[0] as SeasonRow | undefined;
    if (!latestSeason) {
      setSeason(null);
      setMatches([]);
      setTeamLogoById({});
      setSelectedMatchday(null);
      setLoading(false);
      return;
    }
    setSeason(latestSeason);

    // Matches in season
    const m = await supabase
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
      setMsg(`Matches xato: ${m.error.message}`);
      setLoading(false);
      return;
    }

    const rows: MatchRow[] = (m.data ?? []).map((match: any) => ({
      ...match,
      home: Array.isArray(match.home) ? match.home[0] : match.home,
      away: Array.isArray(match.away) ? match.away[0] : match.away,
    }));


    // ✅ Team logo map (teams table’dan logo_url olib kelamiz)
    const ids = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.home?.id, r.away?.id])
          .filter((x): x is string => typeof x === "string" && x.length > 0)
      )
    );

    if (ids.length) {
      const tm = await supabase.from("teams").select("id,logo_url").in("id", ids);
      if (!tm.error) {
        const map: Record<string, string | null> = {};
        for (const r of (tm.data ?? []) as any[]) {
          map[r.id] = r.logo_url ?? null;
        }
        setTeamLogoById(map);
      } else {
        // logo bo‘lmasa ham ishlayveradi
        setTeamLogoById({});
      }
    } else {
      setTeamLogoById({});
    }

    const mdList = Array.from(
      new Set(rows.map((x) => x.matchday).filter((x): x is number => typeof x === "number"))
    ).sort((a, b) => a - b);

    setSelectedMatchday((prev) => {
      if (prev != null && mdList.includes(prev)) return prev;
      return mdList.length ? mdList[0] : null;
    });

    setLoading(false);
  }

  useEffect(() => {
    if (!tournamentId) return;
    loadAll(tournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // Realtime: matches o‘zgarsa reload
  useEffect(() => {
    if (!season?.id || !tournamentId) return;

    const ch = supabase
      .channel(`rt:tg:${season.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `season_id=eq.${season.id}` },
        () => loadAll(tournamentId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.id, tournamentId]);

  const standings: Standing[] = useMemo(() => {
    const teamMap = new Map<string, Standing>();

    function ensure(id: string, name: string) {
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
        });
      }
      return teamMap.get(id)!;
    }

    // Ensure teams appear
    for (const m of matches) {
      if (m.home?.id && m.home?.name) ensure(m.home.id, m.home.name);
      if (m.away?.id && m.away?.name) ensure(m.away.id, m.away.name);
    }

    // Apply only FINISHED
    const finished = matches.filter((m) => m.status === "FINISHED");
    for (const m of finished) {
      if (!m.home?.id || !m.away?.id) continue;

      const H = ensure(m.home.id, m.home.name);
      const A = ensure(m.away.id, m.away.name);

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
    }

    for (const s of teamMap.values()) s.GD = s.GF - s.GA;

    return Array.from(teamMap.values()).sort((a, b) => {
      if (b.PTS !== a.PTS) return b.PTS - a.PTS;
      if (b.GD !== a.GD) return b.GD - a.GD;
      if (b.GF !== a.GF) return b.GF - a.GF;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [matches]);

  const matchdays = useMemo(() => {
    return Array.from(
      new Set(matches.map((x) => x.matchday).filter((x): x is number => typeof x === "number"))
    ).sort((a, b) => a - b);
  }, [matches]);

  const matchdayMatches = useMemo(() => {
    if (selectedMatchday == null) return [];
    return matches
      .filter((m) => m.matchday === selectedMatchday)
      .slice()
      .sort((a, b) => {
        const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
        const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
        return ta - tb;
      });
  }, [matches, selectedMatchday]);

  const standingsText = useMemo(() => {
    const title = tournament?.title ?? "TFC";
    const seasonTitle = season?.title ?? "Season";

    const header = `🏆 <b>${title}</b>\n<b>Tablitsa</b> · ${seasonTitle}\n\n`;

    if (standings.length === 0) {
      return header + "Hozircha tablitsa yo‘q (FINISHED matchlar yo‘q yoki season yo‘q).\n\n#TFC";
    }

    const teamCol = 16;
    const lines: string[] = [];
    lines.push(
      `${pad("#", 2)} ${pad("Team", teamCol)} ${pad("P", 2)} ${pad("W", 2)} ${pad("D", 2)} ${pad(
        "L",
        2
      )} ${pad("GF", 2)}:${pad("GA", 2)} ${pad("GD", 3)} ${pad("PTS", 3)}`
    );

    standings.slice(0, 24).forEach((s, i) => {
      const team = pad(s.teamName, teamCol);
      lines.push(
        `${pad(String(i + 1), 2)} ${team} ` +
          `${pad(String(s.P), 2)} ${pad(String(s.W), 2)} ${pad(String(s.D), 2)} ${pad(
            String(s.L),
            2
          )} ` +
          `${pad(String(s.GF), 2)}:${pad(String(s.GA), 2)} ${pad(String(s.GD), 3)} ${pad(
            String(s.PTS),
            3
          )}`
      );
    });

    return header + `<pre>${lines.join("\n")}</pre>\n#TFC`;
  }, [tournament, season, standings]);

  const matchdayText = useMemo(() => {
    const title = tournament?.title ?? "TFC";
    const seasonTitle = season?.title ?? "Season";
    const md = selectedMatchday != null ? selectedMatchday : "-";

    const header = `📅 <b>${title}</b>\n<b>Matchday ${md}</b> · ${seasonTitle}\n\n`;

    if (selectedMatchday == null) return header + "Matchday topilmadi.\n\n#TFC";
    if (matchdayMatches.length === 0) return header + "Bu matchday’da match yo‘q.\n\n#TFC";

    const lines: string[] = [];
    matchdayMatches.slice(0, 30).forEach((m, idx) => {
      const home = m.home?.name ?? "Home";
      const away = m.away?.name ?? "Away";

      let row = `${idx + 1}) ${home} `;
      if (m.status === "FINISHED" || m.status === "LIVE") row += `${m.home_score}:${m.away_score} `;
      else row += `vs `;
      row += `${away}`;

      const statusPart = ` · ${m.status}`;
      const timePart = m.kickoff_at ? ` · ${fmtDT(m.kickoff_at)}` : "";
      const venuePart = m.venue ? ` · ${m.venue}` : "";

      lines.push(row + statusPart + timePart + venuePart);
    });

    return header + lines.join("\n") + `\n\n#TFC`;
  }, [tournament, season, selectedMatchday, matchdayMatches]);

  async function sendToTelegram(text: string) {
    setMsg(null);
    setSendingText(true);

    const res = await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, parse_mode: "HTML", disable_web_page_preview: true }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setMsg(
        `Telegram xato: ${json?.error ?? "failed"} ${
          json?.details ? JSON.stringify(json.details) : ""
        }`
      );
      setSendingText(false);
      return;
    }

    setMsg("Telegramga yuborildi ✅");
    setSendingText(false);
  }

  async function sendStandingsPhoto() {
    if (!tournament) return;

    setMsg(null);
    setSendingStandingsPhoto(true);

    // ✅ logoUrl (TFC) + subtitle + teamLogoUrl (har jamoa) yuboramiz
    const payload = {
      title: tournament.title,
      subtitle: season?.title ?? "",
      logoUrl: tournament.logo_url ?? null,
      standings: standings.map((s) => ({
        teamName: s.teamName,
        teamLogoUrl: teamLogoById[s.teamId] ?? null, // ✅ team logo
        P: s.P,
        W: s.W,
        D: s.D,
        L: s.L,
        GF: s.GF,
        GA: s.GA,
        GD: s.GD,
        PTS: s.PTS,
      })),
    };

    const res = await fetch("/api/telegram/standings-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setMsg(
        `JPG xato: ${json?.error ?? "failed"} ${
          json?.details ? JSON.stringify(json.details) : ""
        }`
      );
      setSendingStandingsPhoto(false);
      return;
    }

    setMsg("Tablitsa JPG (TFC + team logo) Telegramga yuborildi ✅");
    setSendingStandingsPhoto(false);
  }

  async function sendMatchdayPhoto() {
    if (!tournament) return;
    if (selectedMatchday == null) {
      setMsg("Matchday tanlanmagan");
      return;
    }

    setMsg(null);
    setSendingMatchdayPhoto(true);

    const payload = {
      title: tournament.title,
      seasonTitle: season?.title ?? "Season",
      matchday: selectedMatchday,
      matches: matchdayMatches.map((m) => ({
        home: m.home?.name ?? "Home",
        away: m.away?.name ?? "Away",
        kickoff_at: m.kickoff_at ?? null,
        venue: m.venue ?? null,
        status: m.status,
        home_score: m.home_score,
        away_score: m.away_score,
      })),
    };

    const res = await fetch("/api/telegram/matchday-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setMsg(
        `Matchday JPG xato: ${json?.error ?? "failed"} ${
          json?.details ? JSON.stringify(json.details) : ""
        }`
      );
      setSendingMatchdayPhoto(false);
      return;
    }

    setMsg("Matchday JPG Telegramga yuborildi ✅");
    setSendingMatchdayPhoto(false);
  }

  async function sendRoundPoster() {
    if (!tournament) return;
    if (selectedMatchday == null) {
      setMsg("Matchday tanlanmagan");
      return;
    }

    setMsg(null);
    setSendingRoundPoster(true);

    const payload = {
      title: tournament.title,
      seasonTitle: season?.title ?? "Season",
      roundLabel: `${selectedMatchday}-TUR`,
      standings: standings.map((s) => ({
        teamName: s.teamName,
        P: s.P,
        GD: s.GD,
        PTS: s.PTS,
      })),
      results: matchdayMatches.map((m) => ({
        home: m.home?.name ?? "Home",
        away: m.away?.name ?? "Away",
        kickoff_at: m.kickoff_at ?? null,
        venue: m.venue ?? null,
        status: m.status,
        home_score: m.home_score,
        away_score: m.away_score,
      })),
      scorers: [],
      assists: [],
    };

    const res = await fetch("/api/telegram/round-poster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setMsg(
        `Round poster xato: ${json?.error ?? "failed"} ${
          json?.details ? JSON.stringify(json.details) : ""
        }`
      );
      setSendingRoundPoster(false);
      return;
    }

    setMsg("Round Poster (1080x1080) Telegramga yuborildi ✅");
    setSendingRoundPoster(false);
  }

  async function sendRoundPosterPro() {
    if (!tournamentId) return;
    if (!season?.id) return setMsg("Season topilmadi");
    if (selectedMatchday == null) return setMsg("Matchday tanlanmagan");

    setMsg(null);
    setSendingRoundPosterPro(true);

    const res = await fetch("/api/telegram/round-poster-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId,
        seasonId: season.id,
        matchday: selectedMatchday,
        theme: "dark", // yoki "white"
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setMsg(
        `Poster xato: ${json?.error ?? "failed"} ${
          json?.details ? JSON.stringify(json.details) : ""
        }`
      );
      setSendingRoundPosterPro(false);
      return;
    }

    setMsg("Round Poster PRO Telegramga yuborildi ✅");
    setSendingRoundPosterPro(false);
  }

  if (!tournamentId) {
    return (
      <main className="p-4">
        <div className="text-red-600">
          URL’dan tournamentId olinmadi:
          <br />
          <code>/admin/tournaments/&lt;tournamentId&gt;/telegram</code>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/admin/tournaments">
            ← Admin Tournaments
          </Link>
          <Link className="underline" href={`/tournaments/${tournamentId}`}>
            Public
          </Link>
        </div>

        <button
          className="border rounded px-3 py-1 text-sm"
          onClick={() => loadAll(tournamentId)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && <div>Yuklanmoqda...</div>}
      {msg && <div className="text-sm">{msg}</div>}

      {!loading && (
        <>
          <div className="border rounded p-3">
            <div className="font-semibold">{tournament?.title ?? "Tournament"}</div>
            <div className="text-sm text-gray-600">
              Season: {season?.title ?? "Season yo‘q"} · Matches: {matches.length} · Matchdays:{" "}
              {matchdays.length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              TFC Logo URL: {tournament?.logo_url ? tournament.logo_url : "yo‘q"}
            </div>
          </div>

          {/* Tablitsa */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">🏆 Telegram: Tablitsa</div>
            <div className="text-xs text-gray-500">
              Text varianti monospace (&lt;pre&gt;). JPG varianti: TFC logo + team logo bilan.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="border rounded px-3 py-2"
                disabled={sendingText}
                onClick={() => sendToTelegram(standingsText)}
              >
                {sendingText ? "Yuborilyapti..." : "Tablitsani (TEXT) yuborish"}
              </button>

              <button
                className="border rounded px-3 py-2"
                disabled={sendingStandingsPhoto}
                onClick={sendStandingsPhoto}
              >
                {sendingStandingsPhoto ? "JPG tayyorlanyapti..." : "Tablitsa (JPG) yuborish (logo)"}
              </button>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer underline">Preview (TEXT)</summary>
              <div className="mt-2 border rounded p-2 whitespace-pre-wrap">
                {stripHtml(standingsText)}
              </div>
            </details>
          </section>

          {/* Matchday */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">📅 Telegram: Matchday</div>

            <div className="flex items-center gap-2">
              <div className="text-sm">Matchday:</div>
              <select
                className="border rounded p-2 text-sm"
                value={selectedMatchday ?? ""}
                onChange={(e) =>
                  setSelectedMatchday(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">-</option>
                {matchdays.map((md) => (
                  <option key={md} value={md}>
                    {md}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="border rounded px-3 py-2"
                disabled={sendingText}
                onClick={() => sendToTelegram(matchdayText)}
              >
                {sendingText ? "Yuborilyapti..." : "Matchday’ni (TEXT) yuborish"}
              </button>

              <button
                className="border rounded px-3 py-2"
                disabled={sendingRoundPosterPro}
                onClick={sendRoundPosterPro}
              >
                {sendingRoundPosterPro ? "Yuborilyapti..." : "Round Poster PRO (JPG) yuborish"}
              </button>

              <button
                className="border rounded px-3 py-2"
                disabled={sendingMatchdayPhoto}
                onClick={sendMatchdayPhoto}
              >
                {sendingMatchdayPhoto ? "JPG tayyorlanyapti..." : "Matchday (JPG) yuborish"}
              </button>

              <button
                className="border rounded px-3 py-2"
                disabled={sendingRoundPoster}
                onClick={sendRoundPoster}
              >
                {sendingRoundPoster ? "Poster tayyorlanyapti..." : "Round Poster (JPG) yuborish"}
              </button>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer underline">Preview (TEXT)</summary>
              <div className="mt-2 border rounded p-2 whitespace-pre-wrap">
                {stripHtml(matchdayText)}
              </div>
            </details>
          </section>
        </>
      )}
    </main>
  );
}
