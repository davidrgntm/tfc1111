"use client";

import { useEffect, useState } from "react";
import { dbClient } from "@/lib/local/client";

type Campaign = { id: string; title: string; body: string; target: string; status: string; sent_at: string | null; created_at: string };
type Channel = { id: string; title: string; chat_id: string; is_active: number; is_default: number };

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("Matchday announcement");
  const [body, setBody] = useState("📣 Bugungi o‘yinlar tayyor!\n\nSaytda jadval va statistikani ko‘ring.");
  const [chatId, setChatId] = useState("");
  const [target, setTarget] = useState<"channel" | "users">("channel");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [items, setItems] = useState<Campaign[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    const ch = await dbClient.from("telegram_channels").select("*").order("is_default", { ascending: false });
    if (!ch.error) {
      setChannels((ch.data ?? []) as Channel[]);
      const def = (ch.data ?? []).find((x: any) => x.is_default) ?? (ch.data ?? [])[0];
      if (def?.chat_id && !chatId) setChatId(def.chat_id);
    }
    const list = await dbClient.from("notification_campaigns").select("*").order("created_at", { ascending: false }).limit(50);
    if (!list.error) setItems((list.data ?? []) as Campaign[]);
  }
  useEffect(() => { load(); }, []);

  async function send() {
    setSending(true); setMsg(null);
    const r = await fetch("/api/telegram/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, text: body, chat_id: chatId, target }) });
    const j = await r.json().catch(() => null);
    setSending(false);
    if (!r.ok || !j?.ok) return setMsg(`Xato: ${j?.error ?? "send failed"}`);
    setMsg("✅ Yuborildi va historyga yozildi");
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Notifications</p>
        <h1 className="text-3xl font-black">Kanal va foydalanuvchi bildirishnomalari</h1>
        <p className="text-white/55 mt-2">Announcement, matchday, jadval, natija va live xabarlarini shu yerdan yuboring.</p>
      </div>
      {msg && <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">{msg}</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <section className="rounded-3xl border border-white/10 bg-black/20 p-5 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" placeholder="Title" />
          <select value={target} onChange={(e) => setTarget(e.target.value as "channel" | "users")} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3">
            <option value="channel">Kanal/guruhga yuborish</option>
            <option value="users">Barcha app foydalanuvchilariga DM</option>
          </select>
          {target === "channel" && (
            <select value={chatId} onChange={(e) => setChatId(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3">
              <option value="">Default chat</option>
              {channels.map((c) => <option key={c.id} value={c.chat_id}>{c.title} · {c.chat_id}</option>)}
            </select>
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[260px] w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" />
          <button onClick={send} disabled={sending} className="rounded-2xl bg-emerald-400 px-6 py-3 font-black text-black disabled:opacity-50">{sending ? "Yuborilmoqda..." : "Telegramga yuborish"}</button>
        </section>
        <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <h2 className="font-bold">History</h2>
          <div className="space-y-2 max-h-[520px] overflow-auto">
            {items.map((i) => <div key={i.id} className="rounded-2xl border border-white/10 p-3"><div className="font-semibold">{i.title}</div><div className="text-xs text-white/50">{i.status} · {i.target} · {i.sent_at ? new Date(i.sent_at).toLocaleString() : "draft"}</div><div className="mt-2 text-sm text-white/65 line-clamp-3 whitespace-pre-line">{i.body}</div></div>)}
            {!items.length && <div className="text-sm text-white/50">History bo‘sh.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
