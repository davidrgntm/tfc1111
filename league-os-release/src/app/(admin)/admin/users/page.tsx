"use client";

import { useEffect, useMemo, useState } from "react";
import { dbClient } from "@/lib/local/client";

type UserRow = {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  full_name: string | null;
  photo_url: string | null;
  role: string;
  last_login_at: string | null;
  created_at: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [newTgId, setNewTgId] = useState("");
  const [newName, setNewName] = useState("");

  async function load() {
    const r = await dbClient.from("app_users").select("*").order("created_at", { ascending: false });
    if (r.error) return setMsg(r.error.message);
    setUsers((r.data ?? []) as UserRow[]);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return users;
    return users.filter((u) => `${u.telegram_id} ${u.telegram_username ?? ""} ${u.full_name ?? ""} ${u.role}`.toLowerCase().includes(n));
  }, [q, users]);

  async function setRole(user: UserRow, role: string) {
    const r = await dbClient.from("app_users").update({ role }).eq("id", user.id);
    if (r.error) return setMsg(r.error.message);
    setMsg(`✅ ${user.full_name ?? user.telegram_id} role: ${role}`);
    await load();
  }

  async function addAdmin() {
    const telegram_id = Number(newTgId.trim());
    if (!Number.isFinite(telegram_id)) return setMsg("Telegram ID noto‘g‘ri");
    const r = await dbClient.from("app_users").upsert({ telegram_id, full_name: newName || "Admin", role: "admin", last_login_at: new Date().toISOString() }, { onConflict: "telegram_id" });
    if (r.error) return setMsg(r.error.message);
    setNewTgId(""); setNewName(""); setMsg("✅ Admin qo‘shildi"); await load();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Users & roles</p>
        <h1 className="text-3xl font-black">Foydalanuvchilar va adminlar</h1>
        <p className="text-white/55 mt-2">Telegram orqali kirganlar avtomatik shu ro‘yxatda chiqadi. Admin huquqini shu yerdan bering.</p>
      </div>

      {msg && <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">{msg}</div>}

      <section className="rounded-3xl border border-white/10 bg-black/20 p-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input value={newTgId} onChange={(e) => setNewTgId(e.target.value)} placeholder="Telegram ID" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ism" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
        <button onClick={addAdmin} className="rounded-2xl bg-emerald-400 px-5 py-3 font-bold text-black">Admin qo‘shish</button>
      </section>

      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish..." className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
        <button onClick={load} className="rounded-2xl border border-white/15 px-4 py-3">Refresh</button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/55"><tr><th className="p-3 text-left">User</th><th className="p-3 text-left">Telegram</th><th className="p-3 text-left">Role</th><th className="p-3 text-left">Last login</th><th className="p-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.03]">
                  <td className="p-3 font-semibold">{u.full_name ?? "No name"}</td>
                  <td className="p-3 text-white/60">{u.telegram_username ? `@${u.telegram_username}` : "-"}<div className="text-xs">{u.telegram_id}</div></td>
                  <td className="p-3"><span className="rounded-full border border-white/10 px-3 py-1">{u.role}</span></td>
                  <td className="p-3 text-white/60">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "-"}</td>
                  <td className="p-3 text-right space-x-2">
                    <button onClick={() => setRole(u, "admin")} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">Admin</button>
                    <button onClick={() => setRole(u, "user")} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">User</button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td className="p-5 text-white/50" colSpan={5}>Hali foydalanuvchi yo‘q.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
