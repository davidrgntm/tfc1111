// src/app/api/telegram/standings-photo/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { getTelegramConfig } from "@/lib/telegram";

type StandingRow = {
  teamName: string;
  teamLogoUrl?: string | null; // ✅ keladi
  P: number;
  W?: number;
  D?: number;
  L?: number;
  GF?: number;
  GA?: number;
  GD: number;
  PTS: number;
};

function esc(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// URL -> dataURL (base64). Signed URL ham ishlaydi.
async function toDataUrl(url?: string | null, cache?: Map<string, string>) {
  if (!url) return null;
  if (cache?.has(url)) return cache.get(url)!;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const mime = res.headers.get("content-type") || "image/png";
    const ab = await res.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    cache?.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

function buildHtml(opts: {
  title: string;
  subtitle: string;
  logoDataUrl?: string | null; // tournament/TFC logo
  standings: Array<
    StandingRow & {
      teamLogoDataUrl?: string | null; // ✅ serverda tayyorlab beramiz
    }
  >;
}) {
  const { title, subtitle, logoDataUrl, standings } = opts;

  const hasFullCols =
    standings.some((s) => typeof s.W === "number" || typeof s.GF === "number") || false;

  const rows = (standings ?? [])
    .slice(0, 24)
    .map((s, i) => {
      const W = typeof s.W === "number" ? s.W : 0;
      const D = typeof s.D === "number" ? s.D : 0;
      const L = typeof s.L === "number" ? s.L : 0;
      const GF = typeof s.GF === "number" ? s.GF : 0;
      const GA = typeof s.GA === "number" ? s.GA : 0;

      return `
        <tr>
          <td class="pos">${i + 1}</td>
          <td class="team">
            <div class="teamCell">
              ${
                s.teamLogoDataUrl
                  ? `<img class="tlogo" src="${s.teamLogoDataUrl}" />`
                  : `<div class="tlogo ph"></div>`
              }
              <span>${esc(s.teamName)}</span>
            </div>
          </td>
          <td class="num">${s.P}</td>
          ${
            hasFullCols
              ? `<td class="num">${W}</td>
                 <td class="num">${D}</td>
                 <td class="num">${L}</td>
                 <td class="num">${GF}:${GA}</td>`
              : ``
          }
          <td class="num gd">${s.GD}</td>
          <td class="num pts">${s.PTS}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Standings</title>
<style>
  :root{
    --bg1:#070A10;
    --bg2:#0B1220;
    --text:#EAF1FF;
    --muted:#A8B7D1;
    --card: rgba(255,255,255,0.06);
    --card2: rgba(255,255,255,0.04);
    --line: rgba(255,255,255,0.10);
    --line2: rgba(255,255,255,0.06);
    --accent:#4DD6FF;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    background:
      radial-gradient(1000px 700px at 20% 10%, rgba(77,214,255,0.18), transparent 55%),
      radial-gradient(900px 600px at 90% 20%, rgba(120,80,255,0.14), transparent 55%),
      linear-gradient(180deg,var(--bg1),var(--bg2));
    color:var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  }

  .canvas{
    width:1080px;
    height:1080px;
    padding:34px;
    display:flex;
    flex-direction:column;
    gap:18px;
  }

  .header{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:16px;
  }
  .brand{
    display:flex;
    gap:14px;
    align-items:center;
  }
  .logoBox{
    width:56px;height:56px;
    border-radius:16px;
    border:1px solid var(--line);
    background: rgba(0,0,0,0.12);
    display:flex;
    align-items:center;
    justify-content:center;
    overflow:hidden;
  }
  .logoBox img{ width:100%; height:100%; object-fit:contain; }
  .logoText{ font-weight:950; letter-spacing:1px; }

  .title{
    font-size:28px;
    font-weight:950;
    line-height:1.05;
  }
  .sub{
    margin-top:6px;
    font-size:14px;
    color:var(--muted);
  }

  .pill{
    font-size:11px;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid var(--line);
    background: rgba(0,0,0,0.18);
    color:var(--muted);
    white-space:nowrap;
  }

  .card{
    flex:1;
    background: linear-gradient(180deg,var(--card),var(--card2));
    border:1px solid var(--line);
    border-radius:18px;
    padding:16px;
    overflow:hidden;
  }
  .cardTitle{
    font-weight:900;
    letter-spacing:.5px;
    font-size:14px;
    color:var(--muted);
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:12px;
  }

  table{ width:100%; border-collapse:collapse; font-size:14px; }
  thead th{
    text-align:left;
    font-size:12px;
    color:var(--muted);
    font-weight:800;
    padding:8px 10px;
    border-bottom:1px solid var(--line);
  }
  tbody td{
    padding:10px 10px;
    border-bottom:1px solid var(--line2);
  }
  tbody tr:last-child td{ border-bottom:none; }

  td.pos{ width:44px; color:var(--muted); font-weight:950; }
  td.team{ font-weight:900; }
  td.num{ text-align:right; width:70px; font-weight:800; }
  td.gd{ color:#CFE2FF; }
  td.pts{ color:var(--accent); font-weight:950; }

  .teamCell{
    display:flex;
    align-items:center;
    gap:10px;
  }
  .tlogo{
    width:22px;
    height:22px;
    border-radius:7px;
    border:1px solid var(--line);
    background: rgba(0,0,0,0.12);
    object-fit:contain;
  }
  .ph{ opacity:0.45; }

  .footer{
    display:flex;
    justify-content:space-between;
    font-size:11px;
    color:var(--muted);
    padding:0 2px;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="header">
      <div class="brand">
        <div class="logoBox">
          ${
            logoDataUrl
              ? `<img src="${logoDataUrl}" />`
              : `<div class="logoText">TFC</div>`
          }
        </div>
        <div>
          <div class="title">${esc(title)}</div>
          <div class="sub">${esc(subtitle)}</div>
        </div>
      </div>
      <div class="pill">Standings</div>
    </div>

    <div class="card">
      <div class="cardTitle">
        <div>🏆 TABLITSA</div>
        <div class="pill">${hasFullCols ? "P · W · D · L · GF:GA · GD · PTS" : "P · GD · PTS"}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:44px">#</th>
            <th>Jamoa</th>
            <th style="text-align:right">P</th>
            ${hasFullCols ? `<th style="text-align:right">W</th><th style="text-align:right">D</th><th style="text-align:right">L</th><th style="text-align:right">GF:GA</th>` : ``}
            <th style="text-align:right">GD</th>
            <th style="text-align:right">PTS</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${hasFullCols ? 8 : 5}" style="padding:14px;color:var(--muted)">Hozircha tablitsa yo‘q</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div><b>Tashkent Football Club</b></div>
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

    const chatId = String(body?.chat_id ?? defaultChatId).trim();
    const title = String(body?.title ?? "TFC").trim();
    const subtitle = String(body?.subtitle ?? body?.seasonTitle ?? "").trim();
    const logoUrl = body?.logoUrl ? String(body.logoUrl) : null;

    const standingsRaw: StandingRow[] = Array.isArray(body?.standings) ? body.standings : [];

    const cache = new Map<string, string>();

    const logoDataUrl = await toDataUrl(logoUrl, cache);

    const standings = await Promise.all(
      standingsRaw.map(async (s) => ({
        ...s,
        teamLogoDataUrl: await toDataUrl(s.teamLogoUrl ?? null, cache),
      }))
    );

    const html = buildHtml({ title, subtitle, logoDataUrl, standings });

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(200);

    const jpegBuffer = (await page.screenshot({
      type: "jpeg",
      quality: 90,
      fullPage: false,
    })) as Buffer;

    await browser.close();

    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", subtitle ? `🏆 ${title}\n${subtitle}` : `🏆 ${title}`);
    fd.append("photo", jpegBuffer, {
      filename: "standings.jpg",
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
      return NextResponse.json({ ok: false, error: "Telegram ok=false", details: tgRes.data }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
