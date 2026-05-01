import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

const nav = [
  ["/admin", "🏠 Dashboard"],
  ["/admin/launch", "🚀 Launch checklist"],
  ["/admin/tournaments", "🏆 Tournaments"],
  ["/admin/seasons", "📅 Seasons"],
  ["/admin/matches", "⚽ Matches"],
  ["/admin/teams", "👥 Teams"],
  ["/admin/users", "👤 Users"],
  ["/admin/telegram", "📣 Telegram"],
  ["/admin/notifications", "🔔 Notifications"],
  ["/admin/settings", "⚙️ Settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s?.tg?.id) redirect("/login");
  if (s?.role !== "admin") redirect("/login");

  return (
    <div className="min-h-screen bg-[#07110d] text-white md:flex">
      <aside className="md:sticky md:top-0 md:h-screen md:w-72 border-b md:border-b-0 md:border-r border-white/10 bg-black/25 backdrop-blur p-4 space-y-4">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-400/20 to-sky-400/10 border border-white/10 p-4">
          <div className="text-xl font-black">League OS</div>
          <div className="text-xs text-white/55 mt-1">Admin Control Center</div>
        </div>

        <nav className="grid grid-cols-2 md:grid-cols-1 gap-2 text-sm">
          {nav.map(([href, label]) => (
            <Link key={href} className="rounded-2xl px-3 py-2 hover:bg-white/10 border border-transparent hover:border-white/10" href={href}>{label}</Link>
          ))}
          <Link className="rounded-2xl px-3 py-2 hover:bg-white/10 border border-transparent hover:border-white/10" href="/">🌐 Public site</Link>
        </nav>

        <div className="hidden md:block text-xs text-white/45 leading-relaxed">
          Flow: Tournament → Season → Teams → Players → Matches → Live → Media → Telegram.
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 max-w-[1500px] mx-auto w-full">{children}</main>
    </div>
  );
}
