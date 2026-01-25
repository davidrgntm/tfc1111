"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type SeasonRow = {
  id: string;
  title: string;
  tournament_id: string;
  created_at?: string;
};

type TournamentRow = {
  id: string;
  title: string;
  logo_url: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

type SeasonTeamRow = {
  team_id: string;
  team: TeamRow | null;
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
  home: TeamRow | null;
  away: TeamRow | null;
};

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalInputValue(v: string) {
  // "YYYY-MM-DDTHH:mm" -> ISO
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Round Robin (Circle method)
 * - agar toq bo‘lsa BYE (null) qo‘shiladi
 * - 1-pozitsiya qotadi, qolganlari rotate
 */
function buildRoundRobin(teamIds: string[], doubleRoundRobin: boolean) {
  const ids: (string | null)[] = [...teamIds];

  // BYE
  if (ids.length % 2 === 1) ids.push(null);

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;

  let arr = [...ids];
  const result: { matchday: number; home: string; away: string }[] = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (!a || !b) continue; // BYE

      // home/away balans (oddiy)
      const evenRound = r % 2 === 0;
      const home = evenRound ? a : b;
      const away = evenRound ? b : a;

      result.push({ matchday: r + 1, home, away });
    }

    // rotate (1st stays)
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as string | null);
    arr = [fixed, ...rest];
  }

  if (!doubleRoundRobin) return result;

  // 2-leg (home/away swap), matchday davomiga qo‘shamiz
  const offset = rounds;
  const second = result.map((m) => ({
    matchday: m.matchday + offset,
    home: m.away,
    away: m.home,
  }));

  return [...result, ...second];
}

export default function SeasonMatchesAdminPage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = params.seasonId;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);

  const [allTeams, setAllTeams] = useState<TeamRow[]>([]);
  const [seasonTeams, setSeasonTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  // UI states
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);

  // add/remove season teams
  const [addTeamId, setAddTeamId] = useState<string>("");

  // manual create
  const [homeId, setHomeId] = useState<string>("");
  const [awayId, setAwayId] = useState<string>("");
  const [kickoffLocal, setKickoffLocal] = useState<string>("");
  const [venue, setVenue] = useState<string>("");
  const [allowSecondLeg, setAllowSecondLeg] = useState<boolean>(false);

  // generate schedule
  const [doubleRR, setDoubleRR] = useState<boolean>(false);

  // actions loading
  const [savingTeam, setSavingTeam] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  async function loadAll(currentSeasonId: string) {
    setLoading(true);
    setMsg(null);

    // season
    const s = await supabase
      .from("seasons")
      .select("id,title,tournament_id,created_at")
      .eq("id", currentSeasonId)
      .single();

    if (s.error) {
      setMsg(`Season xato: ${s.error.message}`);
      setLoading(false);
      return;
    }
    const sRow = s.data as SeasonRow;
    setSeason(sRow);

    // tournament
    const t = await supabase
      .from("tournaments")
      .select("id,title,logo_url")
      .eq("id", sRow.tournament_id)
      .single();

    if (!t.error) setTournament(t.data as TournamentRow);

    // all teams (add uchun)
    const at = await supabase
      .from("teams")
      .select("id,name,logo_url")
      .order("name", { ascending: true })
      .limit(500);

    if (at.error) {
      setMsg(`Teams xato: ${at.error.message}`);
      setLoading(false);
      return;
    }
    setAllTeams((at.data ?? []) as TeamRow[]);

    // season teams
    const st = await supabase
      .from("season_teams")
      .select("team_id, team:teams(id,name,logo_url)")
      .eq("season_id", currentSeasonId);

    if (st.error) {
      setMsg(`Season teams xato: ${st.error.message}`);
      setLoading(false);
      return;
    }

    const stRows = (st.data ?? []) as SeasonTeamRow[];
    const teams = stRows.map((x) => x.team).filter(Boolean) as TeamRow[];
    teams.sort((a, b) => a.name.localeCompare(b.name));
    setSeasonTeams(teams);

    // matches
    const m = await supabase
      .from("matches")
      .select(
        `
        id,season_id,matchday,kickoff_at,venue,status,home_score,away_score,
        home_team_id,away_team_id,
        home:teams!matches_home_team_id_fkey(id,name,logo_url),
        away:teams!matches_away_team_id_fkey(id,name,logo_url)
      `
      )
      .eq("season_id", currentSeasonId)
      .order("matchday", { ascending: true, nullsFirst: true })
      .order("kickoff_at", { ascending: true, nullsFirst: true });

    if (m.error) {
      setMsg(`Matches xato: ${m.error.message}`);
      setLoading(false);
      return;
    }

    const rows = (m.data ?? []) as MatchRow[];
    setMatches(rows);

    // default matchday
    const mdList = Array.from(
      new Set(rows.map((x) => x.matchday).filter((x): x is number => typeof x === "number"))
    ).sort((a, b) => a - b);

    setSelectedMatchday((prev) => {
      if (prev != null && mdList.includes(prev)) return prev;
      // agar match yo‘q bo‘lsa 1-tur default
      return mdList.length ? mdList[0] : 1;
    });

    setLoading(false);
  }

  useEffect(() => {
    if (!seasonId) return;
    async function loadData() {
      await loadAll(seasonId);
    }
    loadData();
  }, [seasonId]);

  const matchdays = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches) if (typeof m.matchday === "number") set.add(m.matchday);
    const list = Array.from(set).sort((a, b) => a - b);
    // match bo‘lmasa ham 1 chiqsin
    if (list.length === 0) return [1];
    return list;
  }, [matches]);

  const matchesOfSelected = useMemo(() => {
    if (selectedMatchday == null) return [];
    return matches.filter((m) => m.matchday === selectedMatchday);
  }, [matches, selectedMatchday]);

  const usedTeamIds = useMemo(() => {
    const used = new Set<string>();
    for (const m of matchesOfSelected) {
      if (m.home_team_id) used.add(m.home_team_id);
      if (m.away_team_id) used.add(m.away_team_id);
    }
    return used;
  }, [matchesOfSelected]);

  const availableTeamsThisRound = useMemo(() => {
    return seasonTeams.filter((t) => !usedTeamIds.has(t.id));
  }, [seasonTeams, usedTeamIds]);

  // home/away dropdown options
  const homeOptions = availableTeamsThisRound;
  const awayOptions = availableTeamsThisRound.filter((t) => t.id !== homeId);

  // matchday ni o‘zgartirganda form reset (band bo‘lganlar chiqib qolmasin)
  useEffect(() => {
    setHomeId("");
    setAwayId("");
    setKickoffLocal("");
    setVenue("");
    setAllowSecondLeg(false);
  }, [selectedMatchday]);

  async function addTeamToSeason() {
    if (!seasonId) return;
    if (!addTeamId) return setMsg("Team tanlanmagan");
    setMsg(null);
    setSavingTeam(true);

    const res = await supabase.from("season_teams").insert({
      season_id: seasonId,
      team_id: addTeamId,
    });

    if (res.error) {
      setMsg(`Season team add xato: ${res.error.message}`);
      setSavingTeam(false);
      return;
    }

    setAddTeamId("");
    setSavingTeam(false);
    await loadAll(seasonId);
  }

  async function removeTeamFromSeason(teamId: string) {
    if (!seasonId) return;
    setMsg(null);
    setSavingTeam(true);

    const res = await supabase
      .from("season_teams")
      .delete()
      .eq("season_id", seasonId)
      .eq("team_id", teamId);

    if (res.error) {
      setMsg(`Season team remove xato: ${res.error.message}`);
      setSavingTeam(false);
      return;
    }

    setSavingTeam(false);
    await loadAll(seasonId);
  }

  async function generateSchedule() {
    if (!seasonId) return;
    if (seasonTeams.length < 2) return setMsg("Schedule uchun kamida 2 ta team kerak");
    if (matches.length > 0) return setMsg("Generate bo‘lmadi: season’da matchlar bor (hozircha overwrite yo‘q)");

    setMsg(null);
    setGenerating(true);

    const teamIds = seasonTeams.map((t) => t.id);
    const plan = buildRoundRobin(teamIds, doubleRR);

    const rows = plan.map((p) => ({
      season_id: seasonId,
      matchday: p.matchday,
      home_team_id: p.home,
      away_team_id: p.away,
      status: "SCHEDULED",
      kickoff_at: null,
      venue: null,
      home_score: 0,
      away_score: 0,
    }));

    // chunk insert (xavfsiz)
    const chunkSize = 150;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const ins = await supabase.from("matches").insert(chunk);
      if (ins.error) {
        setMsg(`Generate insert xato: ${ins.error.message}`);
        setGenerating(false);
        return;
      }
    }

    setGenerating(false);
    setMsg(`✅ Schedule generate bo‘ldi: ${rows.length} ta match`);
    await loadAll(seasonId);
  }

  async function createMatchManual() {
    if (!seasonId) return;
    if (selectedMatchday == null) return setMsg("Matchday tanlanmagan");
    if (!homeId || !awayId) return setMsg("Home/Away tanlanmagan");

    if (homeId === awayId) return setMsg("Xato: jamoa o‘ziga qarshi bo‘lmaydi");

    // shu season’ga biriktirilganmi?
    const seasonTeamSet = new Set(seasonTeams.map((t) => t.id));
    if (!seasonTeamSet.has(homeId) || !seasonTeamSet.has(awayId)) {
      return setMsg("Xato: Home/Away team shu season’ga biriktirilmagan");
    }

    setMsg(null);
    setCreatingMatch(true);

    // 1) Turda bitta jamoa 1 marta: DB dan tekshiramiz (real-time sug‘urta)
    const checkRound = await supabase
      .from("matches")
      .select("id,home_team_id,away_team_id")
      .eq("season_id", seasonId)
      .eq("matchday", selectedMatchday);

    if (checkRound.error) {
      setMsg(`Tekshiruv xato: ${checkRound.error.message}`);
      setCreatingMatch(false);
      return;
    }

    const used = new Set<string>();
    for (const r of (checkRound.data ?? [])) {
      if (r.home_team_id) used.add(r.home_team_id);
      if (r.away_team_id) used.add(r.away_team_id);
    }

    if (used.has(homeId) || used.has(awayId)) {
      setMsg("Xato: bu turda jamoa allaqachon matchga kiritilgan (band)");
      setCreatingMatch(false);
      return;
    }

    // 2) Duplicate pair (ixtiyoriy)
    // allowSecondLeg=false bo‘lsa: umuman qaytarilmasin
    // allowSecondLeg=true bo‘lsa: aynan shu pair 2 martagacha (home/away swap) bo‘lishi mumkin
    const pairCheck = await supabase
      .from("matches")
      .select("id,home_team_id,away_team_id")
      .eq("season_id", seasonId)
      .or(
        `and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`
      );

    if (pairCheck.error) {
      setMsg(`Duplicate tekshiruv xato: ${pairCheck.error.message}`);
      setCreatingMatch(false);
      return;
    }

    const existingPairCount = (pairCheck.data ?? []).length;
    if (!allowSecondLeg && existingPairCount >= 1) {
      setMsg("Xato: bu ikki jamoa season’da allaqachon o‘ynagan (duplicate pair)");
      setCreatingMatch(false);
      return;
    }
    if (allowSecondLeg && existingPairCount >= 2) {
      setMsg("Xato: bu pair 2 marta bo‘lib bo‘lgan (2-leg limit)");
      setCreatingMatch(false);
      return;
    }

    const kickoff_at = fromLocalInputValue(kickoffLocal);

    const ins = await supabase
      .from("matches")
      .insert({
        season_id: seasonId,
        matchday: selectedMatchday,
        home_team_id: homeId,
        away_team_id: awayId,
        status: "SCHEDULED",
        kickoff_at,
        venue: venue || null,
        home_score: 0,
        away_score: 0,
      })
      .select("id")
      .single();

    if (ins.error) {
      setMsg(`Create match xato: ${ins.error.message}`);
      setCreatingMatch(false);
      return;
    }

    setCreatingMatch(false);
    setMsg("✅ Match yaratildi");
    await loadAll(seasonId);
  }

  async function saveMatchMeta(matchId: string, kickoff_at_iso: string | null, venueVal: string) {
    setMsg(null);
    setSavingMatchId(matchId);

    const up = await supabase
      .from("matches")
      .update({
        kickoff_at: kickoff_at_iso,
        venue: venueVal || null,
      })
      .eq("id", matchId);

    if (up.error) {
      setMsg(`Match update xato: ${up.error.message}`);
      setSavingMatchId(null);
      return;
    }

    setSavingMatchId(null);
    setMsg("✅ Match yangilandi");
    if (seasonId) await loadAll(seasonId);
  }

  async function deleteMatch(matchId: string) {
    if (!confirm("Matchni o‘chiramizmi?")) return;
    setMsg(null);
    setDeletingMatchId(matchId);

    const del = await supabase.from("matches").delete().eq("id", matchId);
    if (del.error) {
      setMsg(`Delete xato: ${del.error.message}`);
      setDeletingMatchId(null);
      return;
    }

    setDeletingMatchId(null);
    setMsg("✅ Match o‘chirildi");
    if (seasonId) await loadAll(seasonId);
  }

  if (!seasonId) {
    return (
      <main className="p-4">
        <div className="text-red-500">
          URL’dan seasonId olinmadi: <code>/admin/seasons/&lt;seasonId&gt;/matches</code>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-4">
      {/* Top */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold">
            Season: {season?.title ?? "..." }{" "}
            <span className="text-xs text-gray-400">({seasonId})</span>
          </div>
          <div className="text-sm text-gray-400">
            Tournament:{" "}
            {tournament ? (
              <>
                <span className="font-medium text-gray-200">{tournament.title}</span>{" "}
                {tournament.logo_url ? (
                  <span className="text-xs text-gray-500">· logo bor</span>
                ) : (
                  <span className="text-xs text-gray-500">· logo yo‘q</span>
                )}
              </>
            ) : (
              "..."
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="underline" href="/admin">
              ← Dashboard
            </Link>
            <Link className="underline" href="/admin/tournaments">
              Tournaments
            </Link>
            <Link className="underline" href="/admin/teams">
              Teams
            </Link>
            {season?.tournament_id ? (
              <>
                <Link className="underline" href={`/admin/tournaments/${season.tournament_id}/telegram`}>
                  Telegram
                </Link>
                <Link className="underline" href={`/admin/tournaments/${season.tournament_id}/seasons`}>
                  Tournament seasons
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <button
          className="border rounded px-3 py-1 text-sm"
          onClick={() => loadAll(seasonId)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && <div>Yuklanmoqda...</div>}
      {msg && <div className="text-sm text-red-400">{msg}</div>}

      {!loading && (
        <>
          {/* Season teams */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">1) Season Teams</div>
            <div className="text-xs text-gray-400">
              Avval teamlarni “Teams” bo‘limida yaratasiz, keyin shu yerda season’ga biriktirasiz.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="border rounded p-2 text-sm bg-black"
                value={addTeamId}
                onChange={(e) => setAddTeamId(e.target.value)}
              >
                <option value="">+ Team tanlang</option>
                {allTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={addTeamToSeason}
                disabled={savingTeam || !addTeamId}
              >
                {savingTeam ? "Saqlanyapti..." : "Add to season"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              {seasonTeams.map((t) => (
                <div key={t.id} className="border rounded p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.name}</div>
                    <div className="text-xs text-gray-500 break-all">
                      logo: {t.logo_url ? t.logo_url : "yo‘q"}
                    </div>
                    <div className="text-xs text-gray-500">
                      ID: <code>{t.id}</code>
                    </div>
                  </div>
                  <button
                    className="border rounded px-3 py-1 text-sm"
                    onClick={() => removeTeamFromSeason(t.id)}
                    disabled={savingTeam}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {seasonTeams.length === 0 && (
                <div className="text-sm text-gray-400">Hozircha season’da team yo‘q.</div>
              )}
            </div>
          </section>

          {/* Generate schedule */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">2) Schedule Generate (Round Robin)</div>
            <div className="text-xs text-gray-400">
              MVP: agar matchlar bo‘lsa — generate qilmaydi (overwrite yo‘q).
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={doubleRR}
                  onChange={(e) => setDoubleRR(e.target.checked)}
                />
                Double round-robin (2-leg)
              </label>

              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={generateSchedule}
                disabled={generating}
              >
                {generating ? "Generatsiya..." : "Generate schedule"}
              </button>

              <div className="text-xs text-gray-500">
                Teams: {seasonTeams.length} · Matches: {matches.length}
              </div>
            </div>
          </section>

          {/* Matchday select + band teams */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">3) Matchday tanlash (tur)</div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm">Matchday:</div>
              <select
                className="border rounded p-2 text-sm bg-black"
                value={selectedMatchday ?? ""}
                onChange={(e) => setSelectedMatchday(e.target.value ? Number(e.target.value) : null)}
              >
                {matchdays.map((md) => (
                  <option key={md} value={md}>
                    {md}-tur
                  </option>
                ))}
                {/* admin xohlasa yangi tur qo‘shishi uchun */}
                <option value={(Math.max(...matchdays) + 1).toString()}>
                  {Math.max(...matchdays) + 1}-tur (yangi)
                </option>
              </select>

              <div className="text-xs text-gray-500">
                Band teamlar: {usedTeamIds.size} · Bo‘sh teamlar: {availableTeamsThisRound.length}
              </div>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer underline">Bu turda band/bo‘sh teamlar</summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {seasonTeams.map((t) => {
                  const used = usedTeamIds.has(t.id);
                  return (
                    <div key={t.id} className="border rounded p-2 flex items-center justify-between">
                      <div className="font-medium">{t.name}</div>
                      <div className={`text-xs ${used ? "text-red-400" : "text-green-400"}`}>
                        {used ? "BAND" : "BO‘SH"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </section>

          {/* Manual create */}
          <section className="border rounded p-3 space-y-3">
            <div className="font-medium">4) Match yaratish (qo‘lda)</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm">Home team</div>
                <select
                  className="border rounded p-2 text-sm bg-black w-full"
                  value={homeId}
                  onChange={(e) => setHomeId(e.target.value)}
                >
                  <option value="">Home tanlang (faqat bo‘shlar)</option>
                  {homeOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm">Away team</div>
                <select
                  className="border rounded p-2 text-sm bg-black w-full"
                  value={awayId}
                  onChange={(e) => setAwayId(e.target.value)}
                  disabled={!homeId}
                >
                  <option value="">
                    {!homeId ? "Avval Home tanlang" : "Away tanlang (home’dan boshqa, faqat bo‘shlar)"}
                  </option>
                  {awayOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm">Kickoff (optional)</div>
                <input
                  className="border rounded p-2 text-sm bg-black w-full"
                  type="datetime-local"
                  value={kickoffLocal}
                  onChange={(e) => setKickoffLocal(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm">Venue (optional)</div>
                <input
                  className="border rounded p-2 text-sm bg-black w-full"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Masalan: Yunusobod Stadium"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowSecondLeg}
                onChange={(e) => setAllowSecondLeg(e.target.checked)}
              />
              Duplicate pair’ga 2-leg ruxsat (home/away swap bilan)
            </label>

            <button
              className="border rounded px-3 py-2 text-sm"
              onClick={createMatchManual}
              disabled={creatingMatch}
            >
              {creatingMatch ? "Yaratilyapti..." : "Create match"}
            </button>

            <div className="text-xs text-gray-500">
              Validatsiya: home≠away · faqat season_teams · turda 1 marta · duplicate pair tekshiradi.
            </div>
          </section>

          {/* Matches list */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">5) Matchlar (shu season)</div>

            {matches.length === 0 && (
              <div className="text-sm text-gray-400">Hali match yo‘q.</div>
            )}

            <div className="space-y-2">
              {matches.map((m) => (
                <MatchCard
                  key={m.id}
                  m={m}
                  saving={savingMatchId === m.id}
                  deleting={deletingMatchId === m.id}
                  onSave={saveMatchMeta}
                  onDelete={deleteMatch}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function MatchCard({
  m,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  m: MatchRow;
  saving: boolean;
  deleting: boolean;
  onSave: (matchId: string, kickoff_at_iso: string | null, venueVal: string) => Promise<void>;
  onDelete: (matchId: string) => Promise<void>;
}) {
  const [kickoffLocal, setKickoffLocal] = useState<string>(toLocalInputValue(m.kickoff_at));
  const [venue, setVenue] = useState<string>(m.venue ?? "");

  useEffect(() => {
    setKickoffLocal(toLocalInputValue(m.kickoff_at));
    setVenue(m.venue ?? "");
  }, [m.kickoff_at, m.venue]);

  const title =
    (m.home?.name ?? "Home") +
    " " +
    (m.status === "FINISHED" || m.status === "LIVE" ? `${m.home_score}:${m.away_score}` : "vs") +
    " " +
    (m.away?.name ?? "Away");

  return (
    <div className="border rounded p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-gray-400">
            MD: {m.matchday ?? "-"} · {m.status} · {fmtDT(m.kickoff_at)} · {m.venue ?? "-"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ID: <code>{m.id}</code>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Link className="underline" href={`/matches/${m.id}`}>
            Public
          </Link>
          <Link className="underline" href={`/admin/matches/${m.id}/live`}>
            Live
          </Link>
          <Link className="underline" href={`/admin/matches/${m.id}/media`}>
            Media
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-gray-400">Kickoff</div>
          <input
            className="border rounded p-2 text-sm bg-black w-full"
            type="datetime-local"
            value={kickoffLocal}
            onChange={(e) => setKickoffLocal(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-gray-400">Venue</div>
          <input
            className="border rounded p-2 text-sm bg-black w-full"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={() => onSave(m.id, fromLocalInputValue(kickoffLocal), venue)}
          disabled={saving}
        >
          {saving ? "Saqlanyapti..." : "Save kickoff/venue"}
        </button>

        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={() => onDelete(m.id)}
          disabled={deleting}
        >
          {deleting ? "O‘chiryapti..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
