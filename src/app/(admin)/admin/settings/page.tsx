"use client";

import { useEffect, useState } from "react";
import { dbClient } from "@/lib/local/client";

type Settings = Record<string, string>;

const keys = [
  ["app_name", "Platforma nomi"],
  ["app_subtitle", "Slogan"],
  ["site_url", "Sayt URL"],
  ["support_contact", "Support kontakt"],
  ["timezone", "Timezone"],
  ["default_language", "Default til"],
  ["brand_primary", "Primary color"],
  ["brand_secondary", "Secondary color"],
  ["telegram_bot_username", "Telegram bot username"],
  ["telegram_bot_token", "Telegram bot token"],
  ["telegram_default_chat_id", "Default kanal/chat ID"],
];

const privateKeys = new Set(["telegram_bot_token"]);

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<any>(null);

  async function load() {
    const res = await dbClient.from("platform_settings").select("key,value,is_public").order("key", { ascending: true });
    if (res.error) return setMsg(res.error.message);
    const map: Settings = {};
    for (const row of res.data ?? []) map[row.key] = row.value ?? "";
    setSettings(map);
  }

  async function loadTelegramStatus() {
    const res = await fetch("/api/telegram/status");
    const json = await res.json().catch(() => null);
    setTelegramStatus(json);
  }

  useEffect(() => { load(); loadTelegramStatus(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    for (const [key] of keys) {
      const r = await dbClient.from("platform_settings").upsert({ key, value: settings[key] ?? "", is_public: privateKeys.has(key) ? 0 : 1 }, { onConflict: "key" });
      if (r.error) {
        setSaving(false);
        return setMsg(r.error.message);
      }
    }
    setSaving(false);
    setMsg("✅ Settings saqlandi");
    await loadTelegramStatus();
  }

  async function testTelegram() {
    setMsg(null);
    const r = await fetch("/api/telegram/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegram_default_chat_id }),
    });
    const j = await r.json().catch(() => null);
    setMsg(j?.ok ? "✅ Test xabar yuborildi" : `Xato: ${j?.error ?? "test failed"}`);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Settings</p>
        <h1 className="text-3xl font-black">Brending, Telegram va platforma sozlamalari</h1>
        <p className="text-white/55 mt-2">Bu loyiha faqat TFC emas — istalgan futbol liga, turnir yoki maktab uchun white-label ishlaydi.</p>
      </div>

      {msg && <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-white/10 bg-black/20 p-5 grid gap-4 md:grid-cols-2">
          {keys.map(([key, label]) => (
            <label key={key} className="text-sm text-white/70">
              {label}
              <input
                type={key.includes("color") ? "color" : privateKeys.has(key) ? "password" : "text"}
                value={settings[key] ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-emerald-300"
              />
            </label>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
            <h2 className="font-bold">Telegram holati</h2>
            <pre className="max-h-72 overflow-auto rounded-2xl bg-black/40 p-3 text-xs text-white/65">{JSON.stringify(telegramStatus, null, 2)}</pre>
            <button onClick={testTelegram} className="w-full rounded-2xl border border-white/15 px-4 py-3 hover:bg-white/10">Test xabar yuborish</button>
          </div>
          <button onClick={save} disabled={saving} className="w-full rounded-2xl bg-emerald-400 px-5 py-4 font-black text-black disabled:opacity-50">
            {saving ? "Saqlanmoqda..." : "Settings saqlash"}
          </button>
        </aside>
      </div>
    </div>
  );
}
