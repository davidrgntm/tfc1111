import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/local/admin";

export const runtime = "nodejs";

export async function GET() {
  // middleware session borligini tekshiradi (cookie)
  const q = await dbAdmin
    .from("tournaments")
    .select("id,title,format,status,logo_url")
    .order("created_at", { ascending: false });

  if (q.error) {
    return NextResponse.json({ ok: false, error: q.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tournaments: q.data ?? [] });
}
