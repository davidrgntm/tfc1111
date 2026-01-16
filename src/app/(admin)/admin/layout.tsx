// src/app/(admin)/admin/layout.tsx
import { getSession } from "@/lib/session";
import { redirect } from "next/dist/client/components/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s?.tg?.id) redirect("/login");
  if ((s as any)?.role !== "admin") redirect("/login");

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r p-4 space-y-3">
        <div className="font-bold text-lg">TFC Admin</div>

        <nav className="flex flex-col gap-2 text-sm">
          <Link className="underline" href="/admin">🏠 Dashboard</Link>
          <Link className="underline" href="/admin/tournaments">🏆 Tournaments</Link>
          <Link className="underline" href="/admin/seasons">📅 Seasons</Link>
          <Link className="underline" href="/admin/matches">⚽ Matches</Link>
          <Link className="underline" href="/admin/teams">👥 Teams</Link>
          <Link className="underline" href="/admin/telegram">📣 Telegram</Link>

          <div className="pt-2 border-t mt-2" />
          <Link className="underline" href="/tournaments">🌐 Public</Link>
        </nav>

        <div className="text-xs text-gray-500 pt-3">
          Platforma flow: Tournament → Season → Teams → Matches → Telegram
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
