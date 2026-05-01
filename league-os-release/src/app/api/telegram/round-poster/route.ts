// src/app/api/telegram/round-poster/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { getTelegramConfig } from "@/lib/telegram";

type StandingRow = {
  teamName: string;
  P: number;
  GD: number;
  PTS: number;
};

type MatchItem = {
  home: string;
  away: string;
  kickoff_at: string | null;
  venue: string | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | string;
  home_score: number;
  away_score: number;
};

type StatRow = {
  name: string;
  team?: string | null;
  played?: number | null;
  value: number;
};

function esc(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  // faqat vaqt ko‘rinishi chiroyliroq (masalan 20:30)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildHtml(opts: {
  title: string;
  seasonTitle: string;
  roundLabel: string; // masalan: "11-TUR"
  standings: StandingRow[];
  results: MatchItem[];
  scorers: StatRow[];
  assists: StatRow[];
}) {
  const { title, seasonTitle, roundLabel, standings, results, scorers, assists } = opts;

  const standingsRows = (standings ?? [])
    .slice(0, 16)
    .map((s, i) => {
      return `
        <tr>
          <td class="pos">${i + 1}</td>
          <td class="team">${esc(s.teamName)}</td>
          <td class="num">${s.P}</td>
          <td class="num gd">${s.GD}</td>
          <td class="num pts">${s.PTS}</td>
        </tr>
      `;
    })
    .join("");

  const resultsRows = (results ?? [])
    .slice(0, 10)
    .map((m) => {
      const home = esc(m.home);
      const away = esc(m.away);

      const score =
        m.status === "LIVE" || m.status === "FINISHED"
          ? `${m.home_score}:${m.away_score}`
          : "vs";

      const metaLeft =
        m.status === "SCHEDULED" ? `⏰ ${esc(fmtTime(m.kickoff_at)) || "-"}` : `● ${esc(m.status)}`;

      const metaRight = m.venue ? `📍 ${esc(m.venue)}` : "";

      return `
        <div class="resRow">
          <div class="resTeams">
            <div class="resTeam resHome">${home}</div>
            <div class="resScore">${esc(score)}</div>
            <div class="resTeam resAway">${away}</div>
          </div>
          <div class="resMeta">
            <div class="muted">${metaLeft}</div>
            <div class="muted">${metaRight}</div>
          </div>
        </div>
      `;
    })
    .join("");

  function statRows(list: StatRow[]) {
    const rows = (list ?? [])
      .slice(0, 5)
      .map((x, i) => {
        const name = esc(x.name);
        const team = x.team ? esc(x.team) : "";
        const played = typeof x.played === "number" ? ` · ${x.played} o‘yin` : "";
        return `
          <div class="statRow">
            <div class="statLeft">
              <div class="statIndex">${i + 1}</div>
              <div class="statText">
                <div class="statName">${name}</div>
                <div class="statSub muted">${team}${played}</div>
              </div>
            </div>
            <div class="statVal">${x.value}</div>
          </div>
        `;
      })
      .join("");

    return rows || `<div class="empty muted">Hozircha ma’lumot yo‘q</div>`;
  }

  const scorersHtml = statRows(scorers);
  const assistsHtml = statRows(assists);

  // 1080x1080 canvas
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Round Poster</title>
    <style>
      :root{
        --bg1:#070A10;
        --bg2:#0B1220;
        --card: rgba(255,255,255,0.06);
        --card2: rgba(255,255,255,0.04);
        --line: rgba(255,255,255,0.10);
        --text:#EAF1FF;
        --muted:#A8B7D1;
        --accent:#4DD6FF;
        --accent2:#8B5CFF;
      }
      *{ box-sizing:border-box; }
      body{
        margin:0;
        background: radial-gradient(1000px 700px at 20% 10%, rgba(77,214,255,0.18), transparent 55%),
                    radial-gradient(900px 600px at 90% 20%, rgba(139,92,255,0.16), transparent 55%),
                    linear-gradient(180deg, var(--bg1), var(--bg2));
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color:var(--text);
      }
      .canvas{
        width:1080px;
        height:1080px;
        padding: 34px;
        display:flex;
        flex-direction:column;
        gap: 18px;
      }

      .header{
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:16px;
      }
      .brand{
        display:flex;
        align-items:flex-end;
        gap:14px;
      }
      .logo{
        width:56px; height:56px;
        border-radius:16px;
        background: linear-gradient(135deg, rgba(77,214,255,0.25), rgba(139,92,255,0.25));
        border:1px solid rgba(255,255,255,0.14);
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:900;
        letter-spacing:1px;
      }
      .title{
        font-size: 28px;
        font-weight: 950;
        line-height: 1.05;
      }
      .sub{
        margin-top: 6px;
        font-size: 14px;
        color: var(--muted);
      }
      .round{
        text-align:right;
      }
      .roundBig{
        font-size: 34px;
        font-weight: 950;
        letter-spacing: 1px;
      }
      .roundSmall{
        margin-top: 6px;
        font-size: 12px;
        color: var(--muted);
      }

      .grid{
        flex:1;
        display:grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: 18px;
        align-items:stretch;
      }

      .card{
        background: linear-gradient(180deg, var(--card), var(--card2));
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 18px;
        padding: 16px;
        overflow:hidden;
      }
      .cardTitle{
        font-weight: 900;
        letter-spacing: 0.5px;
        font-size: 14px;
        color: var(--muted);
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom: 12px;
      }
      .pill{
        font-size: 11px;
        padding: 6px 10px;
        border-radius: 999px;
        border:1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.20);
        color: var(--muted);
      }
      .muted{ color: var(--muted); }

      table{
        width:100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      thead th{
        text-align:left;
        font-size: 12px;
        color: var(--muted);
        font-weight: 800;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.12);
      }
      tbody td{
        padding: 10px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      tbody tr:last-child td{ border-bottom:none; }
      td.pos{ width:44px; color: var(--muted); font-weight:900; }
      td.team{ font-weight: 850; }
      td.num{ text-align:right; width:64px; font-weight:800; }
      td.gd{ color:#CFE2FF; }
      td.pts{ color: var(--accent); font-weight:950; }

      .resultsWrap{ display:flex; flex-direction:column; gap:10px; }
      .resRow{
        border:1px solid rgba(255,255,255,0.10);
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(0,0,0,0.18);
      }
      .resTeams{
        display:grid;
        grid-template-columns: 1fr 90px 1fr;
        gap: 10px;
        align-items:center;
      }
      .resTeam{
        font-weight: 900;
        font-size: 14px;
      }
      .resHome{ text-align:left; }
      .resAway{ text-align:right; }
      .resScore{
        text-align:center;
        font-weight: 950;
        font-size: 16px;
        color: var(--accent);
      }
      .resMeta{
        margin-top: 6px;
        display:flex;
        justify-content:space-between;
        gap:10px;
        font-size: 12px;
      }

      .bottom{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }

      .statRow{
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding: 10px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .statRow:last-child{ border-bottom:none; }
      .statLeft{
        display:flex; gap:10px; align-items:center;
      }
      .statIndex{
        width:26px; height:26px;
        border-radius: 9px;
        border:1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.18);
        display:flex; align-items:center; justify-content:center;
        color: var(--muted);
        font-weight: 950;
        font-size: 12px;
      }
      .statName{ font-weight: 950; font-size: 14px; }
      .statSub{ font-size: 12px; margin-top: 2px; }
      .statVal{
        font-weight: 950;
        font-size: 18px;
        color: var(--accent);
      }
      .empty{ padding: 10px; font-size: 13px; }

      .footer{
        display:flex;
        justify-content:space-between;
        font-size: 11px;
        color: var(--muted);
        padding: 0 2px;
      }
      .brandSmall{ font-weight: 950; letter-spacing: .3px; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="header">
        <div class="brand">
          <div class="logo">TFC</div>
          <div>
            <div class="title">${esc(title)}</div>
            <div class="sub">${esc(seasonTitle)}</div>
          </div>
        </div>
        <div class="round">
          <div class="roundBig">${esc(roundLabel)}</div>
          <div class="roundSmall">Round summary poster</div>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="cardTitle">
            <div>🏆 TABLITSA</div>
            <div class="pill">P · GD · PTS</div>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Jamoa</th><th style="text-align:right">O‘</th><th style="text-align:right">T/N</th><th style="text-align:right">O</th></tr>
            </thead>
            <tbody>
              ${standingsRows || `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Hozircha tablitsa yo‘q</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="cardTitle">
            <div>📌 TUR NATIJALARI</div>
            <div class="pill">${esc(roundLabel)}</div>
          </div>
          <div class="resultsWrap">
            ${
              resultsRows ||
              `<div class="empty muted">Bu turda matchlar yo‘q</div>`
            }
          </div>
        </div>
      </div>

      <div class="bottom">
        <div class="card">
          <div class="cardTitle">
            <div>⚽ TOP SCORERS</div>
            <div class="pill">Gollar</div>
          </div>
          ${scorersHtml}
        </div>

        <div class="card">
          <div class="cardTitle">
            <div>🎯 TOP ASSISTS</div>
            <div class="pill">Assist</div>
          </div>
          ${assistsHtml}
        </div>
      </div>

      <div class="footer">
        <div class="brandSmall">Tashkent Football Club</div>
        <div>${new Date().toLocaleString()}</div>
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

    if (!token) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN yo‘q" }, { status: 500 });
    if (!defaultChatId) return NextResponse.json({ ok: false, error: "TELEGRAM_CHAT_ID yo‘q" }, { status: 500 });

    const body = await req.json().catch(() => ({}));

    const title = String(body?.title ?? "TFC").trim();
    const seasonTitle = String(body?.seasonTitle ?? "Season").trim();
    const roundLabel = String(body?.roundLabel ?? "ROUND").trim();
    const chatId = String(body?.chat_id ?? defaultChatId).trim();

    const standings: StandingRow[] = Array.isArray(body?.standings) ? body.standings : [];
    const results: MatchItem[] = Array.isArray(body?.results) ? body.results : [];
    const scorers: StatRow[] = Array.isArray(body?.scorers) ? body.scorers : [];
    const assists: StatRow[] = Array.isArray(body?.assists) ? body.assists : [];

    const html = buildHtml({ title, seasonTitle, roundLabel, standings, results, scorers, assists });

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.setContent(html, { waitUntil: "networkidle" });

    const jpegBuffer = (await page.screenshot({
      type: "jpeg",
      quality: 90,
      fullPage: false,
    })) as Buffer;

    await browser.close();

    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", `📌 ${title} · ${roundLabel}\n${seasonTitle}`);
    fd.append("photo", jpegBuffer, {
      filename: `round-poster.jpg`,
      contentType: "image/jpeg",
      knownLength: jpegBuffer.length,
    });

    const url = `https://api.telegram.org/bot${token}/sendPhoto`;
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}