// src/app/(admin)/admin/seasons/[seasonId]/teams/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type SeasonRow = { id: string; title: string; created_at: string };
type TeamRow = { id: string; name: string; logo_url: string | null };

type SeasonTeamRow = {
  id: string;
  season_id: string;
  team_id: string;
  team: TeamRow | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default function SeasonTeamsPage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = params.seasonId;

  const [season, setSeason] = useState<SeasonRow | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [seasonTeams, setSeasonTeams] = useState<SeasonTeamRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // add existing
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [adding, setAdding] = useState(false);

  // create team
  const [newName, setNewName] = useState("");
  const [newLogo, setNewLogo] = useState("");
  const [creating, setCreating] = useState(false);

  const [q, setQ] = useState("");

  const seasonTeamIds = useMemo(() => new Set(seasonTeams.map((x) => x.team_id)), [seasonTeams]);



  async function loadAll() {
    if (!seasonId) return;
    setLoading(true);
    setMsg(null);

    // season
    const s = await supabase.from("seasons").select("id,title,created_at").eq("id", seasonId).single();
    if (s.error) {
      setMsg(`Season xato: ${s.error.message}`);
      setLoading(false);
      return;
    }
    setSeason(s.data as SeasonRow);

    // teams
    const t = await supabase.from("teams").select("id,name,logo_url").order("name", { ascending: true });
    if (t.error) {
      setMsg(`Teams xato: ${t.error.message}`);
      setLoading(false);
      return;
    }
    setTeams((t.data ?? []) as TeamRow[]);

    // season_teams + join team
    const st = await supabase
      .from("season_teams")
      .select(
        `
        id,season_id,team_id,
        team:teams!season_teams_team_id_fkey(id,name,logo_url)
      `
      )
      .eq("season_id", seasonId);

    if (st.error) {
      setMsg(
        `season_teams xato: ${st.error.message}. Agar "relation does not exist" bo‘lsa, demak jadval hali yo‘q (schema masalasi).`
      );
      setLoading(false);
      return;
    }

    setSeasonTeams((st.data ?? []) as SeasonTeamRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  async function addExistingTeam() {
    if (!seasonId) return;
    if (!selectedTeamId) return setMsg("Jamoa tanlanmagan");
    setMsg(null);
    setAdding(true);

    const res = await supabase.from("season_teams").insert({
      season_id: seasonId,
      team_id: selectedTeamId,
    });

    if (res.error) {
      // unique constraint bo‘lsa ham shu yerga tushadi
      setMsg(`Qo‘shishda xato: ${res.error.message}`);
      setAdding(false);
      return;
    }

    setSelectedTeamId("");
    await loadAll();
    setAdding(false);
  }

  async function removeTeam(seasonTeamId: string) {
    setMsg(null);
    const res = await supabase.from("season_teams").delete().eq("id", seasonTeamId);
    if (res.error) {
      setMsg(`O‘chirish xato: ${res.error.message}`);
      return;
    }
    await loadAll();
  }

  async function createTeamAndAdd() {
    if (!seasonId) return;
    const name = newName.trim();
    if (!name) return setMsg("Team name bo‘sh");

    setMsg(null);
    setCreating(true);

    // 1) create team
    const created = await supabase
      .from("teams")
      .insert({ name, logo_url: newLogo.trim() ? newLogo.trim() : null })
      .select("id")
      .single();

    if (created.error) {
      setMsg(`Team yaratish xato: ${created.error.message}`);
      setCreating(false);
      return;
    }

    const teamId = created.data?.id as string;

    // 2) add to season
    const add = await supabase.from("season_teams").insert({ season_id: seasonId, team_id: teamId });
    if (add.error) {
      setMsg(`Season’ga qo‘shish xato: ${add.error.message}`);
      setCreating(false);
      return;
    }

    setNewName("");
    setNewLogo("");
    await loadAll();
    setCreating(false);
  }

  if (!seasonId) {
    return (
      <main className="p-4">
        <div className="text-red-600">
          URL’dan seasonId olinmadi:
          <br />
          <code>/admin/seasons/&lt;seasonId&gt;/teams</code>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/admin/seasons">
            ← Admin Seasons
          </Link>
        </div>

        <button className="border rounded px-3 py-1 text-sm" onClick={loadAll} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="border rounded p-3">
        <div className="font-semibold">Season: {season?.title ?? "-"}</div>
        <div className="text-xs text-gray-500">seasonId: {seasonId}</div>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && (
        <>
          {/* Add existing team */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">➕ Season’ga mavjud jamoani qo‘shish</div>

            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="border rounded p-2 text-sm min-w-[260px]"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
              >
                <option value="">— Team tanlang —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id} disabled={seasonTeamIds.has(t.id)}>
                    {t.name} {seasonTeamIds.has(t.id) ? "(bor)" : ""}
                  </option>
                ))}
              </select>

              <button className="border rounded px-3 py-2 text-sm" onClick={addExistingTeam} disabled={adding}>
                {adding ? "Qo‘shilyapti..." : "Add"}
              </button>
            </div>

            <div className="text-xs text-gray-500">
              Team tanlaysiz → <b>Add</b>. Logo bo‘lmasa ham ishlaydi.
            </div>
          </section>

          {/* Create new team */}
          <section className="border rounded p-3 space-y-2">
            <div className="font-medium">🆕 Yangi jamoa yaratish (va season’ga qo‘shish)</div>

            <div className="grid md:grid-cols-3 gap-2">
              <input
                className="border rounded p-2 text-sm"
                placeholder="Team name (masalan: JELLY)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="border rounded p-2 text-sm md:col-span-2"
                placeholder="logo_url (ixtiyoriy) — public URL"
                value={newLogo}
                onChange={(e) => setNewLogo(e.target.value)}
              />
            </div>

            <button className="border rounded px-3 py-2 text-sm" onClick={createTeamAndAdd} disabled={creating}>
              {creating ? "Yaratilyapti..." : "Create + Add"}
            </button>

            <div className="text-xs text-gray-500">
              Keyin xohlasangiz logo_url’ni edit qilib qo‘yasiz. Hozir MVP uchun shart emas.
            </div>
          </section>

          {/* Participants list */}
          <section className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">✅ Season ishtirokchilari ({seasonTeams.length})</div>
              <input
                className="border rounded p-2 text-sm"
                placeholder="Search team..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="border rounded overflow-hidden">
              {seasonTeams
                .slice()
                .sort((a, b) => (a.team?.name ?? "").localeCompare(b.team?.name ?? ""))
                .filter((x) => {
                  const qq = q.trim().toLowerCase();
                  if (!qq) return true;
                  return (x.team?.name ?? "").toLowerCase().includes(qq);
                })
                .map((row) => (
                  <div key={row.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                    <div className="flex items-center gap-2">
                      {row.team?.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.team.logo_url}
                          alt={row.team.name}
                          className="w-7 h-7 rounded bg-white object-contain"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center text-xs font-semibold">
                          {initials(row.team?.name ?? "?")}
                        </div>
                      )}

                      <div>
                        <div className="text-sm font-medium">{row.team?.name ?? "Unknown team"}</div>
                        <div className="text-xs text-gray-500">{row.team?.logo_url ? "logo: bor" : "logo: yo‘q"}</div>
                      </div>
                    </div>

                    <button className="text-sm underline text-red-600" onClick={() => removeTeam(row.id)}>
                      Remove
                    </button>
                  </div>
                ))}

              {seasonTeams.length === 0 && <div className="p-3 text-sm text-gray-500">Hozircha ishtirokchi yo‘q.</div>}
            </div>

            <div className="text-xs text-gray-500">
              Shu ro‘yxat bo‘lsa — tablitsa ham, poster ham match bo‘lmasa ham “0” bilan chiqadi.
            </div>
          </section>
        </>
      )}
    </main>
  );
}
