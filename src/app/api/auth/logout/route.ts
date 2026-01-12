import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.redirect(new URL("/login", "http://localhost"));
  // URL host muammo bo‘lmasligi uchun keyin redirectni req’dan olamiz; hozircha cookie’ni o‘chirish muhim.
  res.cookies.set("tfc_session", "", { path: "/", maxAge: 0 });
  return res;
}
