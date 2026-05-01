"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dbClient } from "@/lib/local/client";

type Channel = { id: string; title: string; chat_id: string; username: string | null; channel_type: string; is_active: number; is_default: number; last_test_at: string | null };

export default function AdminTelegramPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [title, setTitle] = useState("Main channel");
  const [chatId, setChatId] = useState("");
  const [username, setUsername] = useState("");
  const [text, setText] = useState("📢 <b>League update</b>\n\nBugungi matchlar va yangiliklar saytda.");
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    const [ch, st] = await Promise.all([
      dbClient.from("telegram_channels").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: true }),
      fetch("/api/telegram/status").then((r) => r.json()).catch(() => null),
    ]);
    if (!ch.error) setChannels((ch.data ?? []) as Channel[]);
    setStatus(st);
  }
  useEffect(() => { load(); }, []);

  async function addChannel() {
    setMsg(null);
    if (!title.trim() || !chatId.trim()) return setMsg("Title va chat ID kerak");
    const res = await dbClient.from("telegram_channels").insert({ title: title.trim(), chat_id: chatId.trim(), username: username.trim() || null, is_active: 1, is_default: channels.length ? 0 : 1 });
    if (res.error) return setMsg(res.error.message);
    setTitle("Main channel"); setChatId(""); setUsername(""); setMsg("✅ Kanal qo‘shildi"); await load();
  }

  async function setDefault(c: Channel) {
    for (const item of channels) await dbClient.from("telegram_channels").update({ is_default: item.id === c.id ? 1 : 0 }).eq("id", item.id);
    await dbClient.from("platform_settings").upsert({ key: "telegram_default_chat_id", value: c.chat_id, is_public: 1 }, { onConflict: "key" });
    setMsg("✅ Default kanal yangilandi"); await load();
  }

  async function toggle(c: Channel) {
    const r = await dbClient.from("telegram_channels").update({ is_active: c.is_active ? 0 : 1 }).eq("id", c.id);
    if (r.error) return setMsg(r.error.message);
    await load();
  }

  async function remove(c: Channel) {
    if (!confirm("Kanalni o‘chirasizmi?")) return;
    const r = await dbClient.from("telegram_channels").delete().eq("id", c.id);
    if (r.error) return setMsg(r.error.message);
    await load();
  }

  async function send(chat_id?: string) {
    setMsg(null); setSending(true);
    const res = await fetch("/api/telegram/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, chat_id }) });
    const json = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok || !json?.ok) return setMsg(`Xato: ${json?.error ?? "send failed"}`);
    setMsg("✅ Telegramga yuborildi");
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Telegram hub</p>
          <h1 className="text-3xl font-black">Bot va kanallarni ulash</h1>
          <p className="text-white/55 mt-2">Kanal, guruh yoki shaxsiy chatga announcement va match xabarlarini yuborish.</p>
        </div>
        <Link className="rounded-2xl border border-white/15 px-4 py-3 hover:bg-white/10" href="/admin/settings">Bot token settings</Link>
      </div>

      {msg && <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Channel title" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
            <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="@channel yoki -100..." className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username ixtiyoriy" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
            <button onClick={addChannel} className="rounded-2xl bg-emerald-400 px-5 py-3 font-bold text-black">Qo‘shish</button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-white/55"><tr><th className="p-3 text-left">Title</th><th className="p-3 text-left">Chat ID</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-white/10">
                  {channels.map((c) => (
                    <tr key={c.id}>
                      <td className="p-3 font-semibold">{c.title}{c.is_default ? <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-xs text-black">default</span> : null}</td>
                      <td className="p-3 text-white/60">{c.chat_id}</td>
                      <td className="p-3">{c.is_active ? "Active" : "Off"}</td>
                      <td className="p-3 text-right space-x-2">
                        <button onClick={() => send(c.chat_id)} disabled={sending} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">Test</button>
                        <button onClick={() => setDefault(c)} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">Default</button>
                        <button onClick={() => toggle(c)} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">{c.is_active ? "Off" : "On"}</button>
                        <button onClick={() => remove(c)} className="rounded-xl border border-red-400/30 px-3 py-2 text-red-200 hover:bg-red-400/10">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {!channels.length && <tr><td className="p-5 text-white/50" colSpan={4}>Hali kanal ulanmagan.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
            <h2 className="font-bold">Tez announcement</h2>
            <textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[170px] w-full rounded-2xl border border-white/10 bg-black/30 p-3" />
            <button onClick={() => send()} disabled={sending} className="w-full rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black disabled:opacity-50">Default kanalga yuborish</button>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="font-bold mb-2">Bot status</h2>
            <pre className="max-h-72 overflow-auto rounded-2xl bg-black/40 p-3 text-xs text-white/60">{JSON.stringify(status, null, 2)}</pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
