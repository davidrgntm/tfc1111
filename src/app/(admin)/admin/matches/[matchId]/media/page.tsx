"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  home: { name: string } | null;
  away: { name: string } | null;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

function safeUUID() {
  // crypto.randomUUID bo‘lmasa fallback
  // @ts-expect-error -- crypto is not defined in all environments
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AdminMatchMediaPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [highlightUrl, setHighlightUrl] = useState("");
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!match) return "Match Media";
    return `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"} · Media`;
  }, [match]);

  function publicUrl(path: string) {
    return supabase.storage.from("match-photos").getPublicUrl(path).data.publicUrl;
  }

  async function loadAll() {
    if (!matchId) return;
    setLoading(true);
    setMsg(null);

    // Match nomlarini ko‘rsatish (ixtiyoriy, lekin qulay)
    const m = await supabase
      .from("matches")
      .select(
        `
        id,
        home:teams!matches_home_team_id_fkey(name),
        away:teams!matches_away_team_id_fkey(name)
      `
      )
      .eq("id", matchId)
      .single();

    if (m.error) {
      setMsg(`Match xato: ${m.error.message}`);
      setLoading(false);
      return;
    }
    setMatch(m.data as MatchRow);

    // Highlight link
    const media = await supabase
      .from("match_media")
      .select("highlight_url")
      .eq("match_id", matchId)
      .maybeSingle();

    if (media.error) {
      // media bo‘lmasa ham ishlayversin
      // setMsg(media.error.message);
    }
    setHighlightUrl(media.data?.highlight_url ?? "");

    // Photos
    const list = await supabase
      .from("match_photos")
      .select("id, storage_path, caption, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: false });

    if (list.error) {
      setMsg(`Photos xato: ${list.error.message}`);
      setPhotos([]);
    } else {
      setPhotos((list.data ?? []) as PhotoRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function saveHighlight() {
    if (!matchId) return;
    setMsg(null);

    const url = highlightUrl.trim();
    const { error } = await supabase.from("match_media").upsert(
      {
        match_id: matchId,
        highlight_url: url.length ? url : null,
      },
      { onConflict: "match_id" }
    );

    if (error) return setMsg(`Saqlash xato: ${error.message}`);
    setMsg("Highlight saqlandi ✅");
  }

  async function uploadFiles(files: FileList | null) {
    if (!matchId) return;
    if (!files || files.length === 0) return;

    setMsg(null);

    for (const file of Array.from(files)) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${matchId}/${safeUUID()}.${ext}`;

      const up = await supabase.storage.from("match-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (up.error) {
        setMsg(`Upload xato: ${up.error.message}`);
        continue;
      }

      const ins = await supabase.from("match_photos").insert({
        match_id: matchId,
        storage_path: path,
        caption: null,
      });

      if (ins.error) {
        setMsg(`DB xato: ${ins.error.message}`);
      }
    }

    setMsg("Rasmlar yuklandi ✅");
    await loadAll();
  }

  async function updateCaption(id: string, caption: string) {
    setMsg(null);
    const { error } = await supabase.from("match_photos").update({ caption }).eq("id", id);
    if (error) return setMsg(`Caption xato: ${error.message}`);
    setMsg("Caption saqlandi ✅");
    await loadAll();
  }

  async function deletePhoto(row: PhotoRow) {
    setMsg(null);

    const delStorage = await supabase.storage.from("match-photos").remove([row.storage_path]);
    if (delStorage.error) return setMsg(`Storage delete xato: ${delStorage.error.message}`);

    const delRow = await supabase.from("match_photos").delete().eq("id", row.id);
    if (delRow.error) return setMsg(`DB delete xato: ${delRow.error.message}`);

    setMsg("O‘chirildi ✅");
    await loadAll();
  }

  if (!matchId) {
    return <main className="p-4 text-red-600">URL’dan matchId olinmadi</main>;
  }

  return (
    <main className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{title}</div>

        <div className="flex gap-4 text-sm">
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

      {/* Highlight */}
      <section className="border rounded p-3 space-y-2">
        <div className="font-medium">🎬 Highlight link (YouTube/Telegram)</div>
        <input
          className="border rounded w-full p-2"
          value={highlightUrl}
          onChange={(e) => setHighlightUrl(e.target.value)}
          placeholder="https://youtube.com/... yoki https://t.me/..."
        />
        <div className="flex gap-2">
          <button className="border rounded px-3 py-2" onClick={saveHighlight}>
            Saqlash
          </button>
          {highlightUrl.trim() ? (
            <a className="border rounded px-3 py-2" href={highlightUrl.trim()} target="_blank" rel="noreferrer">
              Ko‘rish
            </a>
          ) : null}
        </div>
      </section>

      {/* Upload */}
      <section className="border rounded p-3 space-y-3">
        <div className="font-medium">📷 Fotogalereya</div>

        <input type="file" accept="image/*" multiple onChange={(e) => uploadFiles(e.target.files)} />

        {photos.length === 0 ? (
          <div className="text-gray-600 text-sm">Hozircha rasm yo‘q.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="border rounded p-2 space-y-2">
                <a className="underline text-sm" href={publicUrl(p.storage_path)} target="_blank" rel="noreferrer">
                  Open
                </a>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl(p.storage_path)}
                  alt="match photo"
                  className="w-full h-48 object-cover border rounded"
                />

                <div className="text-xs text-gray-500 break-all">
                  <div>path: {p.storage_path}</div>
                  <div>created: {new Date(p.created_at).toLocaleString()}</div>
                </div>

                <input
                  className="border rounded w-full p-2 text-sm"
                  defaultValue={p.caption ?? ""}
                  placeholder="Caption (ixtiyoriy)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = (e.target as HTMLInputElement).value;
                      updateCaption(p.id, value.trim());
                    }
                  }}
                />
                <div className="text-xs text-gray-500">
                  Caption saqlash uchun Enter bosing
                </div>

                <button className="border rounded px-3 py-2 text-sm" onClick={() => deletePhoto(p)}>
                  O‘chirish
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
