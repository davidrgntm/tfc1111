"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { dbClient } from "@/lib/local/client";

type SeasonRow = { id: string; title: string; created_at: string };
type TournamentRow = { id: string; title: string };

export default function TournamentSeasonsPage() {
  const router = useRouter();
  const params = useParams();
  const raw = (params as any)?.tournamentId;
  const tournamentId: string | undefined = Array.isArray(raw) ? raw[0] : raw;

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    if (!tournamentId) return;
    setLoading(true);
    setMsg(null);

    const t = await dbClient.from("tournaments").select("id,title").eq("id", tournamentId).single();
    if (t.error) {
      setMsg(`Tournament xato: ${t.error.message}`);
      setLoading(false);
      return;
    }
    setTournament(t.data as any);

    const s = await dbClient
      .from("seasons")
      .select("id,title,created_at")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false });

    if (s.error) {
      setMsg(`Seasons xato: ${s.error.message}`);
      setLoading(false);
      return;
    }

    setSeasons((s.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [tournamentId]);

  async function createSeason() {
    if (!tournamentId) return;
    const title = newTitle.trim();
    if (!title) return setMsg("Season title kiriting");

    setSaving(true);
    setMsg(null);

    const ins = await dbClient
      .from("seasons")
      .insert({ tournament_id: tournamentId, title })
      .select("id")
      .single();

    if (ins.error) {
      setMsg(`Create xato: ${ins.error.message}`);
      setSaving(false);
      return;
    }

    setNewTitle("");
    setSaving(false);
    // yangi seasonni darrov manage sahifaga olib boramiz:
    router.push(`/admin/seasons/${ins.data.id}/matches`);
  }

  if (!tournamentId) {
    return (
      <main className="p-4">
        <div className="text-red-400">tournamentId topilmadi</div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">
            Tournament Seasons: {tournament?.title ?? "..."}
          </div>
          <div className="text-xs text-gray-400">
            Season yaratish, keyin “Manage” orqali Teams + Schedule + Matches.
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <Link className="underline" href="/admin/tournaments">← Tournaments</Link>
            <Link className="underline" href={`/admin/tournaments/${tournamentId}/telegram`}>Telegram</Link>
            <Link className="underline" href={`/tournaments/${tournamentId}`}>Public</Link>
          </div>
        </div>

        <button className="border rounded px-3 py-1 text-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {msg && <div className="text-sm text-red-400">{msg}</div>}
      {loading && <div>Yuklanmoqda...</div>}

      {!loading && (
        <>
          <div className="border rounded p-3 space-y-2 max-w-xl">
            <div className="font-medium">+ New Season</div>
            <input
              className="border rounded p-2 w-full bg-black"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Masalan: 2026 Spring"
            />
            <button className="border rounded px-3 py-2 text-sm" onClick={createSeason} disabled={saving}>
              {saving ? "Yaratilyapti..." : "Create season"}
            </button>
          </div>

          <div className="border rounded overflow-hidden">
            {seasons.length === 0 ? (
              <div className="p-3 text-sm text-gray-400">Hali season yo‘q.</div>
            ) : (
              <ul className="divide-y divide-gray-800">
                {seasons.map((s) => (
                  <li key={s.id} className="p-3">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-gray-500">
                      created: {new Date(s.created_at).toLocaleString()}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {/* ENG MUHIM LINK */}
                      <Link className="underline" href={`/admin/seasons/${s.id}/matches`}>
                        Manage (Teams + Schedule + Matches)
                      </Link>
                    </div>

                    <div className="text-xs text-gray-500 mt-2">
                      ID: <code>{s.id}</code>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}
