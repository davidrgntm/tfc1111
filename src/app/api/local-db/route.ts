export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { executeLocalQuery, isPublicReadTable } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { LocalQueryPayload } from "@/lib/local-query";

function bad(message: string, status = 400) {
  return NextResponse.json({ data: null, error: { message }, count: null }, { status });
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as LocalQueryPayload | null;
  if (!payload?.table || !payload?.action) return bad("Noto‘g‘ri DB so‘rovi");

  const session = await getSession();
  const isAdmin = Boolean(session?.tg?.id && session.role === "admin");
  const isRead = payload.action === "select";
  const isPublicRead = isRead && isPublicReadTable(payload.table);

  if (!isAdmin && !isPublicRead) {
    if (!session?.tg?.id) return bad("Login kerak", 401);
    return bad("Admin huquqi kerak", 403);
  }

  if (!isAdmin && payload.table === "platform_settings" && isPublicRead) {
    payload.filters = [...(payload.filters ?? []), { type: "eq", column: "is_public", value: 1 }];
  }

  const result = await executeLocalQuery(payload);
  return NextResponse.json(result);
}
