import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function logout(req: Request) {
  const c = await cookies();
  c.delete("tfc_session");
  return NextResponse.redirect(new URL("/login", req.url));
}

export async function GET(req: Request) { return logout(req); }
export async function POST(req: Request) { return logout(req); }
