import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function MePage() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="min-h-screen bg-[#07110d] text-white grid place-items-center p-5">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 max-w-md text-center">
          <h1 className="text-2xl font-black">Kabinetga kirish kerak</h1>
          <p className="mt-2 text-white/55">Telegram orqali login qiling va shaxsiy kabinetdan foydalaning.</p>
          <Link href="/login" className="mt-5 inline-block rounded-2xl bg-emerald-400 px-5 py-3 font-bold text-black">Login</Link>
        </div>
      </main>
    );
  }

  const name = [session.tg.first_name, session.tg.last_name].filter(Boolean).join(" ") || session.tg.username || session.tg.id;

  return (
    <main className="min-h-screen bg-[#07110d] text-white">
      <div className="mx-auto max-w-4xl px-5 py-8 space-y-5">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-400/15 to-sky-400/10 p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Personal cabinet</p>
          <h1 className="text-3xl font-black mt-2">Salom, {name}</h1>
          <p className="text-white/60 mt-2">Role: {session.role} · Telegram ID: {session.tg.id}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.08]" href="/tournaments"><div className="text-3xl">🏆</div><div className="mt-2 font-bold">Turnirlar</div><div className="text-sm text-white/50">Jadval va statistikalar</div></Link>
          <Link className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.08]" href="/tma/home"><div className="text-3xl">📱</div><div className="mt-2 font-bold">Mini App</div><div className="text-sm text-white/50">Telegram ichida qulay ko‘rinish</div></Link>
          {session.role === "admin" && <Link className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.08]" href="/admin"><div className="text-3xl">⚙️</div><div className="mt-2 font-bold">Admin</div><div className="text-sm text-white/50">Liga boshqaruvi</div></Link>}
        </div>

        <form action="/api/auth/logout" method="post">
          <button className="rounded-2xl border border-white/15 px-5 py-3 hover:bg-white/10">Chiqish</button>
        </form>
      </div>
    </main>
  );
}
