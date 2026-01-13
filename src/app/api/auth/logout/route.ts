// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const c = await cookies();
  c.delete("tfc_session");

  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

