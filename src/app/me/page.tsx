import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function MePage() {
  const s = await getSession();
  if (!s?.tg?.id) redirect("/login");

  return (
    <main className="p-6 space-y-3">
      <div className="text-xl font-semibold">Shaxsiy kabinet</div>

      <div className="border rounded p-3">
        <div><b>Telegram ID:</b> {s.tg.id}</div>
        <div><b>Username:</b> {s.tg.username ?? "-"}</div>
        <div><b>Ism:</b> {s.tg.first_name ?? "-"} {s.tg.last_name ?? ""}</div>
      </div>

      <div className="flex gap-3">
        <Link className="underline" href="/tournaments">Turnirlar</Link>
        <Link className="underline" href="/api/auth/logout">Logout</Link>
      </div>
    </main>
  );
}
