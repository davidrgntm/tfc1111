"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dbClient } from "@/lib/local/client";

type Summary = { counts: Record<string, number>; admins: number; sqlite_path: string };

export default function LaunchChecklistPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [tg, setTg] = useState<any>(null);

  async function load() {
    const setup = await fetch("/api/setup").then((r) => r.json()).catch(() => null);
    setSummary(setup?.summary ?? null);
    setSettings(setup?.settings ?? {});
    const status = await fetch("/api/telegram/status").then((r) => r.json()).catch(() => null);
    setTg(status);
  }
  useEffect(() => { load(); }, []);

  const checks = useMemo(() => [
    { title: "Brand nomi", ok: Boolean(settings.app_name), href: "/admin/settings", hint: settings.app_name || "app_name kiriting" },
    { title: "Admin mavjud", ok: (summary?.admins ?? 0) > 0, href: "/admin/users", hint: `${summary?.admins ?? 0} admin` },
    { title: "Kamida 1 turnir", ok: (summary?.counts?.tournaments ?? 0) > 0, href: "/admin/tournaments", hint: `${summary?.counts?.tournaments ?? 0} turnir` },
    { title: "Kamida 1 mavsum", ok: (summary?.counts?.seasons ?? 0) > 0, href: "/admin/seasons", hint: `${summary?.counts?.seasons ?? 0} mavsum` },
    { title: "Kamida 2 jamoa", ok: (summary?.counts?.teams ?? 0) >= 2, href: "/admin/teams", hint: `${summary?.counts?.teams ?? 0} jamoa` },
    { title: "Matchlar yaratilgan", ok: (summary?.counts?.matches ?? 0) > 0, href: "/admin/matches", hint: `${summary?.counts?.matches ?? 0} match` },
    { title: "Telegram bot ulangan", ok: Boolean(tg?.ok && tg?.config?.hasToken), href: "/admin/settings", hint: tg?.ok ? (tg?.bot?.username ? `@${tg.bot.username}` : "token bor") : tg?.error ?? "token yo‘q" },
    { title: "Kanal/chat ID", ok: Boolean(settings.telegram_default_chat_id), href: "/admin/settings", hint: settings.telegram_default_chat_id || "@channel yoki -100..." },
  ], [summary, settings, tg]);

  const ready = checks.every((c) => c.ok);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-400/15 to-sky-400/10 p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Release readiness</p>
        <h1 className="text-3xl font-black">Relizga tayyorlik paneli</h1>
        <p className="text-white/60 mt-2">Hamma mayda detallar shu yerda: baza, admin, bot, kanal, turnir, jamoalar, matchlar.</p>
      </div>

      <div className={`rounded-3xl border p-5 ${ready ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/30 bg-amber-400/10"}`}>
        <div className="text-2xl font-black">{ready ? "✅ Relizga tayyor" : "⚠️ Hali to‘liq tayyor emas"}</div>
        <div className="text-sm text-white/60 mt-1">SQLite path: {summary?.sqlite_path ?? "..."}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((c) => (
          <Link href={c.href} key={c.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.07]">
            <div className="text-3xl">{c.ok ? "✅" : "⬜"}</div>
            <div className="mt-3 font-bold">{c.title}</div>
            <div className="mt-1 text-sm text-white/50">{c.hint}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <h2 className="font-bold text-xl">Production eslatma</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-white/65">
          <div className="rounded-2xl border border-white/10 p-3">Railway Volume: <b>/data</b> ga ulang, aks holda SQLite deployda o‘chib ketishi mumkin.</div>
          <div className="rounded-2xl border border-white/10 p-3">SESSION_SECRET kuchli bo‘lsin. Kamida 32+ random belgi.</div>
          <div className="rounded-2xl border border-white/10 p-3">Bot tokenni envda saqlash eng xavfsiz. UI token env bo‘lmaganda fallback.</div>
        </div>
      </div>
    </div>
  );
}
