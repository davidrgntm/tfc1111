"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dbClient } from "@/lib/local/client";

type Tournament = { id: string; title: string; format: string; status: string; logo_url?: string | null };
type Match = { id: string; season_id: string; matchday: number | null; kickoff_at: string | null; venue: string | null; status: string; home_score: number; away_score: number; home: any; away: any };

type Settings = Record<string, string>;

function fmt(iso: string | null) {
  if (!iso) return "Vaqt belgilanmagan";
  return new Date(iso).toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" });
}

function statusBadge(status: string) {
  if (status === "LIVE") return "bg-red-500 text-white animate-pulse";
  if (status === "FINISHED") return "bg-white text-black";
  return "bg-emerald-400 text-black";
}

export default function PublicHomePage() {
  const [settings, setSettings] = useState<Settings>({});
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [setRes, tRes, mRes] = await Promise.all([
      dbClient.from("platform_settings").select("key,value").eq("is_public", 1),
      dbClient.from("tournaments").select("id,title,format,status,logo_url").order("created_at", { ascending: false }).limit(12),
      dbClient.from("matches").select("*").order("kickoff_at", { ascending: true, nullsFirst: false }).limit(12),
    ]);
    const map: Settings = {};
    for (const row of setRes.data ?? []) map[row.key] = row.value ?? "";
    setSettings(map);
    setTournaments((tRes.data ?? []) as Tournament[]);
    setMatches(((mRes.data ?? []) as any[]).map((m) => ({ ...m, home: Array.isArray(m.home) ? m.home[0] : m.home, away: Array.isArray(m.away) ? m.away[0] : m.away })) as Match[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const appName = settings.app_name || "League OS";
  const subtitle = settings.app_subtitle || "Professional futbol liga platformasi";
  const primary = settings.brand_primary || "#22c55e";
  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status !== "FINISHED").slice(0, 6);
  const finished = matches.filter((m) => m.status === "FINISHED").slice(0, 4);

  const stats = useMemo(() => ({ tournaments: tournaments.length, matches: matches.length, live: live.length }), [tournaments.length, matches.length, live.length]);

  return (
    <main className="min-h-screen bg-[#06100c] text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 20% 10%, ${primary}, transparent 32%), radial-gradient(circle at 85% 0%, #0ea5e9, transparent 28%)` }} />
        <div className="relative mx-auto max-w-7xl px-5 py-6 md:py-10">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black font-black">⚽</div>
              <div>
                <div className="font-black text-lg leading-tight">{appName}</div>
                <div className="text-xs text-white/50">Live league platform</div>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-2 text-sm text-white/70">
              <Link className="rounded-full px-4 py-2 hover:bg-white/10" href="/tournaments">Turnirlar</Link>
              <Link className="rounded-full px-4 py-2 hover:bg-white/10" href="/tma">Telegram Mini App</Link>
              <Link className="rounded-full px-4 py-2 hover:bg-white/10" href="/login">Kirish</Link>
            </nav>
          </header>

          <div className="grid gap-8 py-14 md:grid-cols-[1.15fr_0.85fr] md:py-20 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/70">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> White-label football league OS
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl md:text-7xl font-black tracking-tight leading-[0.95]">{appName}</h1>
              <p className="mt-5 max-w-2xl text-lg md:text-xl text-white/65">{subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/tournaments" className="rounded-2xl bg-emerald-400 px-6 py-3 font-black text-black hover:bg-emerald-300">Turnirlarni ko‘rish</Link>
                {tournaments[0]?.id && <Link href={`/tournaments/${tournaments[0].id}`} className="rounded-2xl border border-white/15 px-6 py-3 font-bold hover:bg-white/10">Asosiy liga</Link>}
                <Link href="/setup" className="rounded-2xl border border-white/15 px-6 py-3 font-bold hover:bg-white/10">Setup</Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/25 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between pb-3">
                <div className="font-bold">Bugungi markaz</div>
                <button onClick={load} className="rounded-full border border-white/10 px-3 py-1 text-xs hover:bg-white/10">Refresh</button>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-4">
                <Stat label="Turnir" value={stats.tournaments} />
                <Stat label="Match" value={stats.matches} />
                <Stat label="LIVE" value={stats.live} />
              </div>
              <div className="space-y-2">
                {(live.length ? live : upcoming).slice(0, 4).map((m) => <MatchCard key={m.id} match={m} />)}
                {!loading && !matches.length && <div className="rounded-2xl border border-white/10 p-4 text-white/50">Hali matchlar yo‘q.</div>}
                {loading && <div className="rounded-2xl border border-white/10 p-4 text-white/50">Yuklanmoqda...</div>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div><h2 className="text-3xl font-black">Turnirlar</h2><p className="text-white/50">Faol ligalar, mavsumlar va statistikalar.</p></div>
            <Link href="/tournaments" className="text-sm text-emerald-300 hover:underline">Hammasi →</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.08] transition">
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white/10">
                    {t.logo_url ? <img src={t.logo_url} alt="" className="h-full w-full object-cover" /> : "🏆"}
                  </div>
                  <div>
                    <div className="text-xl font-black">{t.title}</div>
                    <div className="text-sm text-white/50">{t.format} · {t.status}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <h2 className="text-2xl font-black">So‘nggi natijalar</h2>
          <div className="space-y-2">
            {finished.map((m) => <MatchCard key={m.id} match={m} compact />)}
            {!finished.length && <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white/50">Hali yakunlangan match yo‘q.</div>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"><div className="text-2xl font-black">{value}</div><div className="text-xs text-white/45">{label}</div></div>;
}

function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  return (
    <Link href={`/matches/${match.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.08]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-bold">{match.home?.name ?? "Home"} <span className="text-white/45">vs</span> {match.away?.name ?? "Away"}</div>
          {!compact && <div className="mt-1 text-xs text-white/45">MD {match.matchday ?? "-"} · {fmt(match.kickoff_at)} · {match.venue ?? "-"}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className={`rounded-full px-3 py-1 text-xs font-black ${statusBadge(match.status)}`}>{match.status}</div>
          {(match.status === "LIVE" || match.status === "FINISHED") && <div className="mt-1 text-xl font-black">{match.home_score}:{match.away_score}</div>}
        </div>
      </div>
    </Link>
  );
}
