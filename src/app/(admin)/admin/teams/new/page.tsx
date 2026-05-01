"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dbClient } from "@/lib/local/client";

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function createTeam() {
    const n = name.trim();
    if (!n) return setMsg("Team nomini kiriting");

    setSaving(true);
    setMsg(null);

    const res = await dbClient.from("teams").insert({ name: n }).select("id").single();

    if (res.error) {
      setMsg(res.error.message);
      setSaving(false);
      return;
    }

    router.push(`/admin/teams/${res.data.id}`);
  }

  return (
    <main className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link className="underline text-sm" href="/admin/teams">
          ← Teams
        </Link>
        <div className="text-lg font-semibold">New Team</div>
      </div>

      {msg && <div className="text-sm text-red-500">{msg}</div>}

      <div className="border rounded p-3 space-y-3 max-w-xl">
        <div className="space-y-1">
          <div className="text-sm">Team name</div>
          <input
            className="border rounded p-2 w-full bg-transparent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Masalan: TFC Wolves"
          />
        </div>

        <button className="border rounded px-3 py-2" onClick={createTeam} disabled={saving}>
          {saving ? "Saqlanyapti..." : "Create"}
        </button>

        <div className="text-xs text-gray-500">
          Logo keyin “Edit” sahifasida yuklanadi.
        </div>
      </div>
    </main>
  );
}
