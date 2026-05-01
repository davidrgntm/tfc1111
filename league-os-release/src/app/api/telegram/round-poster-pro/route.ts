export const runtime = "nodejs";

import { NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { getTelegramConfig } from "@/lib/telegram";
import { dbAdmin } from "@/lib/local/admin";

type Theme = "dark" | "white";

function esc(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
  theme: Theme;
  tournamentTitle: string;
  seasonTitle: string;
  roundLabel: string;
  tournamentLogo?: string | null; // data url
  standings: Array<{ teamName: string; teamLogo?: string | null; P: number; GD: number; PTS: number }>;
  results: Array<{ home: string; homeLogo?: string | null; away: string; awayLogo?: string | null; status: string; scoreText: string }>;
  scorers: Array<{ name: string; team?: string | null; teamLogo?: string | null; value: number }>;
  assists: Array<{ name: string; team?: string | null; teamLogo?: string | null; value: number }>;
}) {
  const {
    theme, tournamentTitle, seasonTitle, roundLabel, tournamentLogo,
    standings, results, scorers, assists
  } = opts;

  const isDark = theme !== "white";

  const cssVars = isDark
    ? `
      --bg1:#070A10; --bg2:#0B1220; --text:#EAF1FF; --muted:#A8B7D1;
      --card:rgba(255,255,255,0.06); --card2:rgba(255,255,255,0.04);
      --line:rgba(255,255,255,0.10); --line2:rgba(255,255,255,0.06);
      --accent:#4DD6FF;
    `
    : `
      --bg1:#F7F9FF; --bg2:#EEF3FF; --text:#0B1220; --muted:#5B6B84;
      --card:rgba(255,255,255,0.92); --card2:rgba(255,255,255,0.86);
      --line:rgba(15,22,32,0.12); --line2:rgba(15,22,32,0.08);
      --accent:#0B63FF;
    `;

  const standingsRows = standings.slice(0, 16).map((s, i) => `
    <tr>
      <td class="pos">${i + 1}</td>
      <td class="team">
        <div class="teamCell">
          ${s.teamLogo ? `<img class="tlogo" src="${s.teamLogo}" />` : `<div class="tlogo ph"></div>`}
          <span>${esc(s.teamName)}</span>
        </div>
      </td>
      <td class="num">${s.P}</td>
      <td class="num gd">${s.GD}</td>
      <td class="num pts">${s.PTS}</td>
    </tr>
  `).join("");

  const resultsRows = results.slice(0, 10).map((m) => `
    <div class="resRow">
      <div class="resTeams">
        <div class="resSide">
          ${m.homeLogo ? `<img class="mlogo" src="${m.homeLogo}" />` : `<div class="mlogo ph"></div>`}
          <div class="resTeam">${esc(m.home)}</div>
        </div>
        <div class="resScore">${esc(m.scoreText)}</div>
        <div class="resSide resSideRight">
          <div class="resTeam">${esc(m.away)}</div>
          ${m.awayLogo ? `<img class="mlogo" src="${m.awayLogo}" />` : `<div class="mlogo ph"></div>`}
        </div>
      </div>
      <div class="resMeta muted">● ${esc(m.status)}</div>
    </div>
  `).join("");

  const statBlock = (title: string, pill: string, list: any[]) => {
    const rows = list.slice(0, 5).map((x: any, idx: number) => `
      <div class="statRow">
        <div class="statLeft">
          <div class="statIndex">${idx + 1}</div>
          ${x.teamLogo ? `<img class="slogo" src="${x.teamLogo}" />` : `<div class="slogo ph"></div>`}
          <div>
            <div class="statName">${esc(x.name)}</div>
            <div class="statSub muted">${esc(x.team ?? "")}</div>
          </div>
        </div>
        <div class="statVal">${x.value}</div>
      </div>
    `).join("");

    return `
      <div class="card">
        <div class="cardTitle">
          <div>${esc(title)}</div>
          <div class="pill">${esc(pill)}</div>
        </div>
        ${rows || `<div class="empty muted">Hozircha ma’lumot yo‘q</div>`}
      </div>
    `;
  };

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root{ ${cssVars} }
  *{box-sizing:border-box}
  body{
    margin:0;
    background: ${
      isDark
        ? `radial-gradient(1000px 700px at 20% 10%, rgba(77,214,255,0.18), transparent 55%),
           radial-gradient(900px 600px at 90% 20%, rgba(120,80,255,0.14), transparent 55%),
           linear-gradient(180deg,var(--bg1),var(--bg2))`
        : `linear-gradient(180deg,var(--bg1),var(--bg2))`
    };
    color:var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  }
  .canvas{ width:1080px; height:1080px; padding:34px; display:flex; flex-direction:column; gap:18px; }

  .header{ display:flex; justify-content:space-between; align-items:flex-end; gap:16px; }
  .brand{ display:flex; gap:14px; align-items:center; }
  .logoBox{
    width:56px; height:56px; border-radius:16px;
    border:1px solid var(--line);
    background: rgba(0,0,0,0.10);
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
  }
  .logoBox img{ width:100%; height:100%; object-fit:contain; }
  .logoText{ font-weight:950; letter-spacing:1px; }
  .title{ font-size:28px; font-weight:950; line-height:1.05; }
  .sub{ margin-top:6px; font-size:14px; color:var(--muted); }

  .round{ text-align:right; }
  .roundBig{ font-size:34px; font-weight:950; letter-spacing:1px; }
  .roundSmall{ margin-top:6px; font-size:12px; color:var(--muted); }

  .grid{ flex:1; display:grid; grid-template-columns: 1.05fr 0.95fr; gap:18px; }
  .bottom{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }

  .card{
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
  .pill{
    font-size:11px;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid var(--line);
    background: rgba(0,0,0,0.10);
    color:var(--muted);
  }
  .muted{ color:var(--muted); }

  table{ width:100%; border-collapse:collapse; font-size:14px; }
  thead th{
    text-align:left; font-size:12px; color:var(--muted); font-weight:800;
    padding:8px 10px; border-bottom:1px solid var(--line);
  }
  tbody td{ padding:10px 10px; border-bottom:1px solid var(--line2); }
  tbody tr:last-child td{ border-bottom:none; }
  td.pos{ width:44px; color:var(--muted); font-weight:950; }
  td.num{ text-align:right; width:64px; font-weight:800; }
  td.gd{ color: ${isDark ? "#CFE2FF" : "#24406B"}; }
  td.pts{ color:var(--accent); font-weight:950; }

  .teamCell{ display:flex; align-items:center; gap:10px; font-weight:900; }
  .tlogo{ width:22px; height:22px; border-radius:7px; border:1px solid var(--line); object-fit:contain; background: rgba(0,0,0,0.08); }
  .ph{ opacity:0.45; }

  .resultsWrap{ display:flex; flex-direction:column; gap:10px; }
  .resRow{ border:1px solid var(--line); border-radius:14px; padding:10px 12px; background: rgba(0,0,0,0.10); }
  .resTeams{ display:grid; grid-template-columns: 1fr 90px 1fr; gap:10px; align-items:center; }
  .resSide{ display:flex; align-items:center; gap:10px; }
  .resSideRight{ justify-content:flex-end; }
  .mlogo{ width:26px; height:26px; border-radius:9px; border:1px solid var(--line); object-fit:contain; background: rgba(0,0,0,0.08); }
  .resTeam{ font-weight:950; font-size:14px; }
  .resScore{ text-align:center; font-weight:950; font-size:16px; color:var(--accent); }
  .resMeta{ margin-top:7px; font-size:12px; }

  .statRow{ display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line2); }
  .statRow:last-child{ border-bottom:none; }
  .statLeft{ display:flex; gap:10px; align-items:center; }
  .statIndex{
    width:26px; height:26px; border-radius:9px;
    border:1px solid var(--line); background: rgba(0,0,0,0.10);
    display:flex; align-items:center; justify-content:center;
    color:var(--muted); font-weight:950; font-size:12px;
  }
  .slogo{ width:22px; height:22px; border-radius:8px; border:1px solid var(--line); object-fit:contain; background: rgba(0,0,0,0.08); }
  .statName{ font-weight:950; font-size:14px; }
  .statSub{ font-size:12px; margin-top:2px; }
  .statVal{ font-weight:950; font-size:18px; color:var(--accent); }
  .empty{ padding:10px; font-size:13px; }

  .footer{ display:flex; justify-content:space-between; font-size:11px; color:var(--muted); padding:0 2px; }
  .brandSmall{ font-weight:950; letter-spacing:.3px; }
</style>
</head>
<body>
  <div class="canvas">
    <div class="header">
      <div class="brand">
        <div class="logoBox">
          ${
            tournamentLogo
              ? `<img src="${tournamentLogo}" />`
              : `<div class="logoText">TFC</div>`
          }
        </div>
        <div>
          <div class="title">${esc(tournamentTitle)}</div>
          <div class="sub">${esc(seasonTitle)}</div>
        </div>
      </div>
      <div class="round">
        <div class="roundBig">${esc(roundLabel)}</div>
        <div class="roundSmall">Round poster</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="cardTitle"><div>🏆 TABLITSA</div><div class="pill">O‘ · T/N · O</div></div>
        <table>
          <thead><tr><th>#</th><th>Jamoa</th><th style="text-align:right">O‘</th><th style="text-align:right">T/N</th><th style="text-align:right">O</th></tr></thead>
          <tbody>
            ${standingsRows || `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Hozircha tablitsa yo‘q</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="cardTitle"><div>📌 TUR NATIJALARI</div><div class="pill">${esc(roundLabel)}</div></div>
        <div class="resultsWrap">
          ${resultsRows || `<div class="empty muted">Bu turda match yo‘q</div>`}
        </div>
      </div>
    </div>

    <div class="bottom">
      ${statBlock("⚽ TOP SCORERS", "Gollar", scorers)}
      ${statBlock("🎯 TOP ASSISTS", "Assist", assists)}
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
    const tournamentId = String(body?.tournamentId ?? "");
    const seasonId = String(body?.seasonId ?? "");
    const matchday = Number(body?.matchday ?? 0);
    const theme: Theme = body?.theme === "white" ? "white" : "dark";
    const chatId = String(body?.chat_id ?? defaultChatId).trim();

    if (!tournamentId || !seasonId || !matchday) {
      return NextResponse.json({ ok: false, error: "tournamentId/seasonId/matchday kerak" }, { status: 400 });
    }

    const logoCache = new Map<string, string>();

    // tournament + season
    const { data: t } = await dbAdmin.from("tournaments").select("id,title,logo_url").eq("id", tournamentId).single();
    const { data: s } = await dbAdmin.from("seasons").select("id,title").eq("id", seasonId).single();

    const tournamentTitle = t?.title ?? "TFC";
    const seasonTitle = s?.title ?? "Season";
    const roundLabel = `${matchday}-TUR`;

    const tournamentLogo = await toDataUrl(t?.logo_url ?? null, logoCache);

    // matches (season)
    const { data: allMatches, error: mErr } = await dbAdmin
      .from("matches")
      .select("id,season_id,matchday,status,home_team_id,away_team_id,home_score,away_score")
      .eq("season_id", seasonId);

    if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });

    const matches = allMatches ?? [];

    // ✅ Guard: season’da match yo‘q bo‘lsa
    if (!matches.length) {
      return NextResponse.json(
        { ok: false, error: "season_no_matches", message: "Season’da match yo‘q. Avval schedule generate qiling." },
        { status: 400 }
      );
    }


    // team ids
    const teamIds = Array.from(
      new Set(
        matches.flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter(Boolean)
      )
    );

    const { data: teams } = await dbAdmin
      .from("teams")
      .select("id,name,logo_url")
      .in("id", teamIds as string[]);

    const teamMap = new Map<string, { name: string; logo_url: string | null }>();
    (teams ?? []).forEach((x: any) => teamMap.set(x.id, { name: x.name, logo_url: x.logo_url }));

    // standings (faqat FINISHED matchlardan)
    const table = new Map<string, { teamName: string; teamLogoUrl: string | null; P: number; W: number; D: number; L: number; GF: number; GA: number; GD: number; PTS: number }>();
    function ensure(teamId: string) {
      if (!table.has(teamId)) {
        const info = teamMap.get(teamId);
        table.set(teamId, {
          teamName: info?.name ?? "Team",
          teamLogoUrl: info?.logo_url ?? null,
          P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0,
        });
      }
      return table.get(teamId)!;
    }

    for (const m of matches) {
      if (m.status !== "FINISHED") continue;
      const h = ensure(m.home_team_id);
      const a = ensure(m.away_team_id);

      const hs = Number(m.home_score ?? 0);
      const as = Number(m.away_score ?? 0);

      h.P += 1; a.P += 1;
      h.GF += hs; h.GA += as;
      a.GF += as; a.GA += hs;

      if (hs > as) { h.W += 1; a.L += 1; h.PTS += 3; }
      else if (hs < as) { a.W += 1; h.L += 1; a.PTS += 3; }
      else { h.D += 1; a.D += 1; h.PTS += 1; a.PTS += 1; }
    }

    // GD calc
    for (const v of table.values()) v.GD = v.GF - v.GA;

    const standingsSorted = Array.from(table.values()).sort((x, y) => {
      if (y.PTS !== x.PTS) return y.PTS - x.PTS;
      if (y.GD !== x.GD) return y.GD - x.GD;
      return y.GF - x.GF;
    });

    // matchday results
    const mdMatches = matches.filter((m: any) => Number(m.matchday) === matchday);
    const results = [];
    for (const m of mdMatches) {
      const home = teamMap.get(m.home_team_id);
      const away = teamMap.get(m.away_team_id);

      const homeLogo = await toDataUrl(home?.logo_url ?? null, logoCache);
      const awayLogo = await toDataUrl(away?.logo_url ?? null, logoCache);

      const scoreText =
        m.status === "FINISHED" || m.status === "LIVE"
          ? `${m.home_score ?? 0}:${m.away_score ?? 0}`
          : "vs";

      results.push({
        home: home?.name ?? "Home",
        homeLogo,
        away: away?.name ?? "Away",
        awayLogo,
        status: m.status ?? "SCHEDULED",
        scoreText,
      });
    }

    // ✅ Guard: matchday’da match yo‘q bo‘lsa
    if (!mdMatches.length) {
      return NextResponse.json(
        { ok: false, error: "matchday_no_matches", message: "Bu turda match yo‘q. Avval schedule generate qiling yoki matchday raqamini tekshiring." },
        { status: 400 }
      );
    }

    // TOP scorers/assists (RPC)
    const { data: topScorers } = await dbAdmin.rpc("tfc_top_scorers", {
      p_season_id: seasonId,
      p_limit: 5,
    });

    const { data: topAssists } = await dbAdmin.rpc("tfc_top_assists", {
      p_season_id: seasonId,
      p_limit: 5,
    });

    const scorers = [];
    for (const r of (topScorers ?? []) as any[]) {
      scorers.push({
        name: r.full_name,
        team: r.team_name,
        teamLogo: await toDataUrl(r.team_logo_url ?? null, logoCache),
        value: r.goals,
      });
    }

    const assists = [];
    for (const r of (topAssists ?? []) as any[]) {
      assists.push({
        name: r.full_name,
        team: r.team_name,
        teamLogo: await toDataUrl(r.team_logo_url ?? null, logoCache),
        value: r.assists,
      });
    }

    // standings logos (data url)
    const standingsWithLogo = [];
    for (const row of standingsSorted.slice(0, 16)) {
      standingsWithLogo.push({
        teamName: row.teamName,
        teamLogo: await toDataUrl(row.teamLogoUrl ?? null, logoCache),
        P: row.P,
        GD: row.GD,
        PTS: row.PTS,
      });
    }

    const html = buildHtml({
      theme,
      tournamentTitle,
      seasonTitle,
      roundLabel,
      tournamentLogo,
      standings: standingsWithLogo,
      results,
      scorers,
      assists,
    });

    // screenshot
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });

    await page.setContent(html, { waitUntil: "load" });
    // kichik buffer: logolar chizilib ulgurishi uchun
    await page.waitForTimeout(200);

    const jpegBuffer = (await page.screenshot({ type: "jpeg", quality: 90, fullPage: false })) as Buffer;
    await browser.close();

    // Telegram send
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", `📌 ${tournamentTitle} · ${roundLabel}\n${seasonTitle}`);
    fd.append("photo", jpegBuffer, { filename: "round.jpg", contentType: "image/jpeg", knownLength: jpegBuffer.length });

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
