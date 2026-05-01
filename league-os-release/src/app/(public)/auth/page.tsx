import Link from "next/link";

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-[#07110d] text-white grid place-items-center p-5">
      <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <div className="text-4xl">🔐</div>
        <h1 className="mt-4 text-2xl font-black">Kirish Telegram orqali</h1>
        <p className="mt-2 text-white/55">SMS auth o‘rniga xavfsiz Telegram Login va Mini App session ishlatiladi.</p>
        <Link href="/login" className="mt-5 inline-block rounded-2xl bg-emerald-400 px-5 py-3 font-bold text-black">Telegram Login</Link>
      </div>
    </main>
  );
}
