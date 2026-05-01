"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SetupState = {
  app_name: string;
  app_subtitle: string;
  brand_primary: string;
  brand_secondary: string;
  timezone: string;
  default_language: string;
  support_contact: string;
  telegram_bot_username: string;
  telegram_bot_token: string;
  telegram_default_chat_id: string;
  site_url: string;
};

const defaults: SetupState = {
  app_name: "League OS",
  app_subtitle: "Professional futbol liga platformasi",
  brand_primary: "#22c55e",
  brand_secondary: "#0ea5e9",
  timezone: "Asia/Tashkent",
  default_language: "uz",
  support_contact: "",
  telegram_bot_username: "",
  telegram_bot_token: "",
  telegram_default_chat_id: "",
  site_url: "",
};

export default function SetupPage() {
  const [settings, setSettings] = useState<SetupState>(defaults);
  const [adminTelegramId, setAdminTelegramId] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((j) => {
        setNeedsSetup(j.needsSetup);
        setSettings({ ...defaults, ...(j.settings ?? {}) });
      })
      .catch(() => setMsg("Setup ma’lumotlari yuklanmadi"));
  }, []);

  function set<K extends keyof SetupState>(key: K, value: SetupState[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-setup-secret": setupSecret },
      body: JSON.stringify({ settings, adminTelegramId, channel: { title: "Main channel", chat_id: settings.telegram_default_chat_id } }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok || !json?.ok) return setMsg(`Xato: ${json?.error ?? "setup failed"}`);
    setNeedsSetup(false);
    setMsg("✅ Saqlandi. Endi Telegram orqali login qilib admin panelga kiring.");
  }

  return (
    <main className="min-h-screen bg-[#07110d] text-white">
      <div className="mx-auto max-w-5xl px-5 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Launch wizard</p>
            <h1 className="text-3xl md:text-5xl font-black">League OS sozlash</h1>
            <p className="mt-2 text-white/65 max-w-2xl">Birinchi ishga tushirish, brending, Telegram bot, kanal va admin egasini bitta joydan ulang.</p>
          </div>
          <Link href="/" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Public</Link>
        </div>

        {needsSetup === true && <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">Hali admin yo‘q. Birinchi admin Telegram ID kiriting. SETUP_SECRET qo‘ygan bo‘lsangiz shu yerda kiriting.</div>}
        {msg && <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm">{msg}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <h2 className="font-bold text-xl">1. Platforma</h2>
            <Field label="Liga/servis nomi" value={settings.app_name} onChange={(v) => set("app_name", v)} />
            <Field label="Slogan" value={settings.app_subtitle} onChange={(v) => set("app_subtitle", v)} />
            <Field label="Sayt URL" value={settings.site_url} onChange={(v) => set("site_url", v)} placeholder="https://your-domain.up.railway.app" />
            <Field label="Support kontakt" value={settings.support_contact} onChange={(v) => set("support_contact", v)} placeholder="@username yoki telefon" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary color" type="color" value={settings.brand_primary} onChange={(v) => set("brand_primary", v)} />
              <Field label="Secondary color" type="color" value={settings.brand_secondary} onChange={(v) => set("brand_secondary", v)} />
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <h2 className="font-bold text-xl">2. Telegram</h2>
            <Field label="Bot username" value={settings.telegram_bot_username} onChange={(v) => set("telegram_bot_username", v)} placeholder="my_league_bot" />
            <Field label="Bot token" value={settings.telegram_bot_token} onChange={(v) => set("telegram_bot_token", v)} placeholder="123456:ABC..." />
            <Field label="Kanal/chat ID" value={settings.telegram_default_chat_id} onChange={(v) => set("telegram_default_chat_id", v)} placeholder="@channel yoki -100..." />
            <Field label="Birinchi admin Telegram ID" value={adminTelegramId} onChange={setAdminTelegramId} placeholder="806860624" />
            <Field label="SETUP_SECRET" value={setupSecret} onChange={setSetupSecret} placeholder="faqat envda berilgan bo‘lsa" />
          </section>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={save} disabled={saving} className="rounded-2xl bg-emerald-400 px-6 py-3 font-bold text-black hover:bg-emerald-300 disabled:opacity-50">
            {saving ? "Saqlanmoqda..." : "Saqlash va relizga tayyorlash"}
          </button>
          <Link href="/login" className="rounded-2xl border border-white/15 px-6 py-3 font-bold hover:bg-white/10">Telegram login</Link>
          <Link href="/admin" className="rounded-2xl border border-white/15 px-6 py-3 font-bold hover:bg-white/10">Admin panel</Link>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block text-sm text-white/70">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300"
      />
    </label>
  );
}
