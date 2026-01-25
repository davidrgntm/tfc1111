"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

function extFromName(name: string) {
  const p = name.split(".").pop()?.toLowerCase();
  if (!p) return "png";
  return p.length > 6 ? "png" : p;
}

export default function EditTeamPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    if (!teamId) return;
    setMsg(null);

    const res = await supabase.from("teams").select("id,name,logo_url").eq("id", teamId).single();

    if (res.error) {
      setMsg(res.error.message);
      setTeam(null);
      return;
    }

    const t = res.data as TeamRow;
    setTeam(t);
    setName(t.name ?? "");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function save() {
    if (!teamId) return;
    const n = name.trim();
    if (!n) return setMsg("Team nomi bo‘sh bo‘lmasin");

    setSaving(true);
    setMsg(null);

    const res = await supabase.from("teams").update({ name: n }).eq("id", teamId);

    if (res.error) {
      setMsg(res.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMsg("Saqlandi ✅");
    await load();
  }

  async function uploadLogo(file: File) {
    if (!teamId) return;

    setUploading(true);
    setMsg(null);

    const ext = extFromName(file.name);
    const path = `teams/${teamId}.${ext}`; // bitta joyda turadi, update bo‘lganda replace bo‘ladi

    const up = await supabase.storage.from("logos").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/png",
      cacheControl: "3600",
    });

    if (up.error) {
      setMsg(`Upload xato: ${up.error.message}`);
      setUploading(false);
      return;
    }

    const pub = supabase.storage.from("logos").getPublicUrl(path);
    const publicUrl = pub.data.publicUrl;

    const upd = await supabase.from("teams").update({ logo_url: publicUrl }).eq("id", teamId);
    if (upd.error) {
      setMsg(`DB xato: ${upd.error.message}`);
      setUploading(false);
      return;
    }

    setUploading(false);
    setMsg("Logo yuklandi ✅");
    await load();
  }

  if (!teamId) {
    return (
      <main className="p-4">
        <div className="text-red-500">URL’dan teamId olinmadi</div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link className="underline text-sm" href="/admin/teams">
          ← Teams
        </Link>
        <div className="text-lg font-semibold">Edit Team</div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      <div className="border rounded p-3 max-w-2xl space-y-4">
        <div className="text-xs text-gray-500">ID: {teamId}</div>

        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded bg-white/10 flex items-center justify-center overflow-hidden">
            {team?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${team.logo_url}?v=${Date.now()}`}
                alt={team.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-xs text-gray-500">no logo</div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-sm">Logo (PNG/SVG/JPG)</div>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
              }}
            />
            <div className="text-xs text-gray-500">
              Upload bo‘lsa `teams.logo_url`ga public URL yoziladi.
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm">Team name</div>
          <input
            className="border rounded p-2 w-full bg-transparent"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button className="border rounded px-3 py-2" onClick={save} disabled={saving}>
          {saving ? "Saqlanyapti..." : "Save"}
        </button>

        {team?.logo_url && (
          <div className="text-xs text-gray-500 break-all">
            logo_url: {team.logo_url}
          </div>
        )}
      </div>
    </main>
  );
}
