export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { appSummary, getSettingsMap } from "@/lib/db";

export async function GET() {
  try {
    const summary = await appSummary();
    const settings = await getSettingsMap(false);
    return NextResponse.json({ ok: true, name: settings.app_name || "League OS", time: new Date().toISOString(), summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "health error" }, { status: 500 });
  }
}
