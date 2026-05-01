// src/app/api/telegram/matchday-photo/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { getTelegramConfig } from "@/lib/telegram";

type MatchItem = {
  home: string;
  away: string;
  kickoff_at: string | null;
  venue: string | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | string;
  home_score: number;
  away_score: number;
};

function esc(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function buildHtml(opts: {
  title: string;
  seasonTitle: string;
  matchday: number;
  matches: MatchItem[];
}) {
  const { title, seasonTitle, matchday, matches } = opts;

  const rows = (matches ?? [])
    .slice(0, 40)
    .map((m, idx) => {
      const left = esc(m.home);
      const right = esc(m.away);

      const score =
        m.status === "LIVE" || m.status === "FINISHED"
          ? `<div class="score">${m.home_score}:${m.away_score}</div>`
          : `<div class="score score--muted">vs</div>`;

      const time = fmtDT(m.kickoff_at);
      const venue = m.venue ? esc(m.venue) : "-";
      const status = esc(m.status);

      return `
      <div class="match">
        <div class="no">${idx + 1}</div>
        <div class="teams">
          <div class="team team--home">${left}</div>
          ${score}
          <div class="team team--away">${right}</div>
        </div>
        <div class="meta">
          <div><span class="k">Status:</span> ${status}</div>
          <div><span class="k">Time:</span> ${esc(time)}</div>
          <div><span class="k">Venue:</span> ${venue}</div>
        </div>
      </div>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Matchday</title>
    <style>
      :root{
        --bg:#0b0f14;
        --text:#e8eef6;
        --muted:#9fb0c2;
        --line:rgba(255,255,255,0.10);
        --line2:rgba(255,255,255,0.06);
        --accent:#4dd6ff;
        --card:rgba(255,255,255,0.04);
      }
      *{box-sizing:border-box}
      body{
        margin:0;
        background:var(--bg);
        color:var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      .wrap{ width: 980px; padding: 28px; }
      .card{
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        padding: 18px;
      }
      .head{
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        gap:16px;
        margin-bottom: 14px;
      }
      .title{
        font-size: 22px;
        font-weight: 900;
        letter-spacing: 0.2px;
      }
      .sub{
        margin-top: 4px;
        font-size: 13px;
        color: var(--muted);
      }
      .badge{
        font-size: 12px;
        color: var(--muted);
        border:1px solid rgba(255,255,255,0.10);
        padding: 8px 10px;
        border-radius: 999px;
        background: rgba(0,0,0,0.20);
        white-space:nowrap;
      }

      .grid{ display:flex; flex-direction:column; gap:10px; }

      .match{
        border: 1px solid var(--line);
        background: rgba(0,0,0,0.18);
        border-radius: 14px;
        padding: 12px;
        display:flex;
        gap:12px;
        align-items:stretch;
      }
      .no{
        width: 34px;
        color: var(--muted);
        font-weight: 800;
        display:flex;
        align-items:center;
        justify-content:center;
        border-right: 1px solid var(--line2);
        padding-right: 10px;
      }
      .teams{
        flex: 1;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }
      .team{
        width: 40%;
        font-weight: 800;
        font-size: 14px;
      }
      .team--home{ text-align:left; }
      .team--away{ text-align:right; }

      .score{
        width: 20%;
        text-align:center;
        font-weight: 900;
        font-size: 16px;
        color: var(--accent);
      }
      .score--muted{
        color: var(--muted);
        font-weight: 800;
      }

      .meta{
        width: 280px;
        border-left: 1px solid var(--line2);
        padding-left: 12px;
        color: var(--muted);
        font-size: 12px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        gap:4px;
      }
      .k{ color: #cfe2ff; font-weight: 700; }

      .foot{
        margin-top: 12px;
        display:flex;
        justify-content:space-between;
        font-size: 11px;
        color: var(--muted);
      }
      .brand{ font-weight: 900; letter-spacing: .3px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="head">
          <div>
            <div class="title">📅 ${esc(title)} · Matchday ${matchday}</div>
            <div class="sub">${esc(seasonTitle)}</div>
          </div>
          <div class="badge">TFC · Matchday Poster</div>
        </div>

        <div class="grid">
          ${
            rows ||
            `<div style="padding:14px;color:var(--muted);border:1px solid var(--line);border-radius:14px;background:rgba(0,0,0,0.18)">Bu matchday’da match yo‘q.</div>`
          }
        </div>

        <div class="foot">
          <div class="brand">Tashkent Football Club</div>
          <div>${new Date().toLocaleString()}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export async function POST(req: Request) {
  try {
    const cfg = await getTelegramConfig();
    const token = cfg.token;
    const defaultChatId = cfg.defaultChatId;

    if (!token) {
      return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN yo‘q." }, { status: 500 });
    }
    if (!defaultChatId) {
      return NextResponse.json({ ok: false, error: "TELEGRAM_CHAT_ID yo‘q." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));

    const title = String(body?.title ?? "TFC").trim();
    const seasonTitle = String(body?.seasonTitle ?? "Season").trim();
    const matchday = Number(body?.matchday ?? 0);
    const matches: MatchItem[] = Array.isArray(body?.matches) ? body.matches : [];
    const chatId = String(body?.chat_id ?? defaultChatId).trim();

    if (!matchday || Number.isNaN(matchday)) {
      return NextResponse.json({ ok: false, error: "matchday noto‘g‘ri" }, { status: 400 });
    }

    const html = buildHtml({ title, seasonTitle, matchday, matches });

    const { chromium } = await import("playwright");

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage({ viewport: { width: 1040, height: 900 } });
    await page.setContent(html, { waitUntil: "networkidle" });

    const jpegBuffer = (await page.screenshot({
      type: "jpeg",
      quality: 86,
      fullPage: true,
    })) as Buffer;

    await browser.close();

    // Telegram sendPhoto (axios + form-data)
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", `📅 ${title}\nMatchday ${matchday} · ${seasonTitle}`);
    fd.append("photo", jpegBuffer, {
      filename: `matchday-${matchday}.jpg`,
      contentType: "image/jpeg",
      knownLength: jpegBuffer.length,
    });

    const url = `https://api.telegram.org/bot${token}/sendPhoto`;

    try {
      const tgRes = await axios.post(url, fd, {
        headers: fd.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30_000,
      });

      if (!tgRes.data?.ok) {
        return NextResponse.json(
          { ok: false, error: "Telegram ok=false", details: tgRes.data },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error: "Telegram sendPhoto xato (axios)",
          status: err?.response?.status ?? null,
          details: err?.response?.data ?? null,
          message: err?.message ?? null,
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
