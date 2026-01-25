"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type TournamentRow = { id: string; title: string };
type SeasonRow = { id: string; title: string; tournament_id: string };

type TeamRow = { id: string; name: string; logo_url: string | null };

type SeasonTeamRow = {
  team_id: string;
  team: TeamRow | null;
};

export default function AdminSeasonTeamsPage() {
  const params = useParams<{ tournamentId: string; seasonId: string }>();
  const tournamentId = params.tournamentId;
  const seasonId = params.seasonId;

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [season, setSeason] = useState<SeasonRow | null>(null);

  const [allTeams, setAllTeams] = useState<TeamRow[]>([]);
  const [seasonTeams, setSeasonTeams] = useState<SeasonTeamRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // add existing team
  const [pickTeamId, setPickTeamId] = useState<string>("");

  // create new team
  const [newName, setNewName] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");

  async function load() {
    if (!tournamentId || !seasonId) return;

    setLoading(true);
    setMsg(null);

    const t = await supabase.from("tournaments").select("id,title").eq("id", tournamentId).single();
    if (t.error) {
      setMsg(`Tournament xato: ${t.error.message}`);
      setLoading(false);
      return;
    }
    setTournament(t.data as TournamentRow);

    const s = await supabase
      .from("seasons")
      .select("id,title,tournament_id")
      .eq("id", seasonId)
      .single();

    if (s.error) {
      setMsg(`Season xato: ${s.error.message}`);
      setLoading(false);
      return;
    }
    setSeason(s.data as SeasonRow);

    // all teams
    const teamsRes = await supabase.from("teams").select("id,name,logo_url").order("name", { ascending: true });
    if (teamsRes.error) {
      setMsg(`Teams xato: ${teamsRes.error.message}`);
      setLoading(false);
      return;
    }
    setAllTeams((teamsRes.data ?? []) as TeamRow[]);

    // season teams (join)
    const st = await supabase
      .from("season_teams")
      .select(
        `
        team_id,
        team:teams!season_teams_team_id_fkey(id,name,logo_url)
      `
      )
      .eq("season_id", seasonId);

    if (st.error) {
      setMsg(`season_teams xato: ${st.error.message}`);
      setLoading(false);
      return;
    }

    setSeasonTeams((st.data ?? []) as SeasonTeamRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, seasonId]);

  const seasonTeamIds = useMemo(() => new Set(seasonTeams.map((x) => x.team_id)), [seasonTeams]);

  async function addExistingTeam() {
    if (!seasonId) return;
    setMsg(null);

    if (!pickTeamId) {
      setMsg("Team tanlanmagan");
      return;
    }

    const ins = await supabase.from("season_teams").insert({ season_id: seasonId, team_id: pickTeamId });

    if (ins.error) {
      setMsg(`Ulash xato: ${ins.error.message}`);
      return;
    }

    setPickTeamId("");
    await load();
    setMsg("Jamoa season’ga qo‘shildi ✅");
  }

  async function createAndAddTeam() {
    if (!seasonId) return;
    setMsg(null);

    if (!newName.trim()) {
      setMsg("Team name kirit");
      return;
    }

    // 1) create team
    const created = await supabase
      .from("teams")
      .insert({ name: newName.trim(), logo_url: newLogoUrl.trim() ? newLogoUrl.trim() : null })
      .select("id")
      .single();

    if (created.error) {
      setMsg(`Team create xato: ${created.error.message}`);
      return;
    }

    const teamId = created.data.id as string;

    // 2) link to season
    const linkRes = await supabase.from("season_teams").insert({ season_id: seasonId, team_id: teamId });
    if (linkRes.error) {
      setMsg(`Season link xato: ${linkRes.error.message}`);
      return;
    }

    setNewName("");
    setNewLogoUrl("");
    await load();
    setMsg("Yangi jamoa yaratildi va season’ga qo‘shildi ✅");
  }

  async function removeTeam(teamId: string) {
    if (!seasonId) return;
    setMsg(null);

    const del = await supabase
      .from("season_teams")
      .delete()
      .eq("season_id", seasonId)
      .eq("team_id", teamId);

    if (del.error) {
      setMsg(`O‘chirish xato: ${del.error.message}`);
      return;
    }

    await load();
    setMsg("Jamoa season’dan olib tashlandi ✅");
  }

  if (!tournamentId || !seasonId) {
    return (
      <main className="p-4">
        <div className="text-red-500">
          URL xato. To‘g‘ri link:
          <br />
          <code>/admin/tournaments/&lt;tournamentId&gt;/seasons/&lt;seasonId&gt;/teams</code>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <Link className="underline" href={`/admin/tournaments/${tournamentId}/seasons`}>
            ← Seasons
          </Link>
          <Link className="underline" href={`/admin/tournaments/${tournamentId}/telegram`}>
            Telegram
          </Link>
        </div>

        <button className="border rounded px-3 py-1 text-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="border rounded p-3">
        <div className="font-semibold">{tournament?.title ?? "Tournament"}</div>
        <div className="text-sm text-gray-500">Season: {season?.title ?? "-"}</div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      <div className="border rounded p-3 space-y-3">
        <div className="font-medium">1) Mavjud jamoani season’ga ulash</div>

        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="border rounded p-2 text-sm min-w-[260px]"
            value={pickTeamId}
            onChange={(e) => setPickTeamId(e.target.value)}
          >
            <option value="">— Team tanlang —</option>
            {allTeams.map((t) => (
              <option key={t.id} value={t.id} disabled={seasonTeamIds.has(t.id)}>
                {t.name} {seasonTeamIds.has(t.id) ? "(bor)" : ""}
              </option>
            ))}
          </select>

          <button className="border rounded px-3 py-2" onClick={addExistingTeam}>
            Add
          </button>
        </div>

        <div className="text-xs text-gray-500">
          Eslatma: “(bor)” degani — u jamoa allaqachon shu season ichida.
        </div>
      </div>

      <div className="border rounded p-3 space-y-3">
        <div className="font-medium">2) Yangi jamoa yaratish va avtomatik season’ga qo‘shish</div>

        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="border rounded p-2"
            placeholder="Team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="Logo URL (ixtiyoriy)"
            value={newLogoUrl}
            onChange={(e) => setNewLogoUrl(e.target.value)}
          />
          <button className="border rounded px-3 py-2" onClick={createAndAddTeam}>
            Create + Add
          </button>
        </div>
      </div>

      <div className="border rounded p-3">
        <div className="font-medium mb-2">Season jamoalari</div>

        {loading && <div className="text-sm">Yuklanmoqda...</div>}

        {!loading && (
          <div className="space-y-2">
            {seasonTeams.map((st) => (
              <div key={st.team_id} className="border rounded p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{st.team?.name ?? "Unknown team"}</div>
                  <div className="text-xs text-gray-500">
                    Team ID: <code>{st.team_id}</code>
                  </div>
                  {st.team?.logo_url && (
                    <div className="text-xs text-gray-500 mt-1">
                      Logo: <code className="break-all">{st.team.logo_url}</code>
                    </div>
                  )}
                </div>

                <button className="border rounded px-3 py-2" onClick={() => removeTeam(st.team_id)}>
                  Remove
                </button>
              </div>
            ))}

            {seasonTeams.length === 0 && (
              <div className="text-sm text-gray-500">Hozircha season’da jamoa yo‘q. Yuqoridan qo‘shing.</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
