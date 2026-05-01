import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Filter, LocalQueryPayload, LocalQueryResult, Order } from "./local-query";

const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: any };

type Row = Record<string, any>;

declare global {
  // eslint-disable-next-line no-var
  var __tfcSqliteDb: any | undefined;
}

const ALLOWED_TABLES = new Set([
  "profiles",
  "app_users",
  "tournaments",
  "seasons",
  "teams",
  "players",
  "season_teams",
  "matches",
  "match_events",
  "match_lineups",
  "player_ratings",
  "subscriptions",
  "match_media",
  "match_photos",
  "fees",
  "team_invoices",
  "payments",
  "telegram_outbox",
  "platform_settings",
  "telegram_channels",
  "notification_campaigns",
  "audit_logs",
]);

const DEFAULTS: Record<string, Row> = {
  profiles: { role: "user" },
  app_users: { role: "user" },
  tournaments: { format: "11x11", status: "ACTIVE", rules: "{}" },
  matches: { home_score: 0, away_score: 0, status: "SCHEDULED" },
  match_events: { extra_minute: 0 },
  match_media: { type: "HIGHLIGHT" },
  fees: { amount: 0 },
  team_invoices: { amount: 0, status: "UNPAID" },
  payments: { amount: 0, method: "CASH" },
  telegram_outbox: { status: "PENDING" },
  platform_settings: { is_public: 1 },
  telegram_channels: { is_active: 1, channel_type: "channel" },
  notification_campaigns: { status: "DRAFT", target: "channel" },
  audit_logs: { action: "update" },
};

function sqlitePath() {
  const env = process.env.SQLITE_PATH || process.env.DATABASE_PATH;
  if (env && env.trim()) return env.trim();
  const railwayData = "/data";
  if (fs.existsSync(railwayData)) return path.join(railwayData, "tfc-league.sqlite");
  return path.join(process.cwd(), "data", "tfc-league.sqlite");
}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function getDb() {
  if (globalThis.__tfcSqliteDb) return globalThis.__tfcSqliteDb;
  const file = sqlitePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  seed(db);
  globalThis.__tfcSqliteDb = db;
  return db;
}

function migrate(db: any) {
  db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  name TEXT,
  avatar_url TEXT,
  photo_url TEXT,
  telegram_id INTEGER UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  telegram_id INTEGER UNIQUE NOT NULL,
  telegram_username TEXT,
  full_name TEXT,
  photo_url TEXT,
  role TEXT DEFAULT 'user',
  last_login_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '11x11',
  rules TEXT DEFAULT '{}',
  status TEXT DEFAULT 'ACTIVE',
  logo_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  name TEXT,
  photo_url TEXT,
  position TEXT,
  number INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS season_teams (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (season_id, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
  matchday INTEGER,
  kickoff_at TEXT,
  venue TEXT,
  home_team_id TEXT REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'SCHEDULED',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_events (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id),
  player_id TEXT REFERENCES players(id),
  assist_player_id TEXT REFERENCES players(id),
  type TEXT NOT NULL,
  minute INTEGER,
  extra_minute INTEGER DEFAULT 0,
  note TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_lineups (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  goalkeeper_player_id TEXT REFERENCES players(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (match_id, team_id)
);

CREATE TABLE IF NOT EXISTS player_ratings (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  user_id TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 10),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (match_id, player_id, user_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS match_media (
  id TEXT PRIMARY KEY,
  match_id TEXT UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'HIGHLIGHT',
  title TEXT,
  url TEXT,
  highlight_url TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_photos (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
  url TEXT,
  storage_path TEXT,
  caption TEXT,
  uploaded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fees (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_invoices (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  status TEXT DEFAULT 'UNPAID',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES team_invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT DEFAULT 'CASH',
  paid_at TEXT DEFAULT CURRENT_TIMESTAMP,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  is_public INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_channels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  username TEXT,
  channel_type TEXT DEFAULT 'channel',
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  last_test_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target TEXT DEFAULT 'channel',
  status TEXT DEFAULT 'DRAFT',
  sent_at TEXT,
  result_json TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_seasons_tournament ON seasons(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);
CREATE INDEX IF NOT EXISTS idx_matches_matchday ON matches(season_id, matchday);
CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_channels_active ON telegram_channels(is_active, is_default);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notification_campaigns(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
`);
}

function countRows(db: any, table: string) {
  return Number(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c ?? 0);
}

function seed(db: any) {
  if (countRows(db, "platform_settings") === 0) {
    const settings = [
      ["app_name", "League OS"],
      ["app_subtitle", "Futbol ligalari uchun professional boshqaruv platformasi"],
      ["brand_primary", "#22c55e"],
      ["brand_secondary", "#0ea5e9"],
      ["timezone", "Asia/Tashkent"],
      ["default_language", "uz"],
      ["support_contact", ""],
      ["telegram_bot_username", process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || ""],
      ["telegram_bot_token", process.env.TELEGRAM_BOT_TOKEN || ""],
      ["telegram_default_chat_id", process.env.TELEGRAM_CHAT_ID || ""],
      ["site_url", process.env.NEXT_PUBLIC_SITE_URL || ""],
    ];
    const stmt = db.prepare("INSERT INTO platform_settings (id,key,value,is_public,created_at,updated_at) VALUES (?,?,?,?,?,?)");
    for (const [key, value] of settings) {
      const secret = ["telegram_bot_token"].includes(key);
      stmt.run(createId(), key, value, secret ? 0 : 1, nowIso(), nowIso());
    }
  }

  if (countRows(db, "tournaments") > 0) return;

  const tournamentId = createId();
  const seasonId = createId();
  const teams = ["North City FC", "River United", "Capital Stars", "Green Wolves"].map((name) => ({ id: createId(), name }));

  db.prepare(
    "INSERT INTO tournaments (id,title,format,status,logo_url,created_at) VALUES (?,?,?,?,?,?)"
  ).run(tournamentId, "Demo League", "11x11", "ACTIVE", null, nowIso());

  db.prepare(
    "INSERT INTO seasons (id,tournament_id,title,start_date,end_date,created_at) VALUES (?,?,?,?,?,?)"
  ).run(seasonId, tournamentId, "Season 2026", null, null, nowIso());

  const insertTeam = db.prepare("INSERT INTO teams (id,name,logo_url,created_at) VALUES (?,?,?,?)");
  const insertSt = db.prepare("INSERT INTO season_teams (id,season_id,team_id,created_at) VALUES (?,?,?,?)");
  const insertPlayer = db.prepare("INSERT INTO players (id,team_id,full_name,name,position,number,created_at) VALUES (?,?,?,?,?,?,?)");

  for (const [teamIndex, team] of teams.entries()) {
    insertTeam.run(team.id, team.name, null, nowIso());
    insertSt.run(createId(), seasonId, team.id, nowIso());
    for (let i = 1; i <= 5; i++) {
      const fullName = `${team.name.split(" ")[0]} Player ${i}`;
      insertPlayer.run(createId(), team.id, fullName, fullName, i === 1 ? "GK" : "Player", i, nowIso());
    }
  }

  const insertMatch = db.prepare(
    "INSERT INTO matches (id,season_id,matchday,kickoff_at,venue,home_team_id,away_team_id,home_score,away_score,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  );
  insertMatch.run(createId(), seasonId, 1, null, "Tashkent", teams[0].id, teams[1].id, 0, 0, "SCHEDULED", nowIso());
  insertMatch.run(createId(), seasonId, 1, null, "Tashkent", teams[2].id, teams[3].id, 0, 0, "SCHEDULED", nowIso());
}

function columnsOf(table: string): string[] {
  const db = getDb();
  return db.prepare(`PRAGMA table_info(${table})`).all().map((r: any) => String(r.name));
}

function tableRows(table: string): Row[] {
  assertTable(table);
  return getDb().prepare(`SELECT * FROM ${table}`).all().map((r: Row) => normalizeRow(table, { ...r }));
}

function normalizeRow(table: string, row: Row): Row {
  if (table === "tournaments" && typeof row.rules === "string") {
    try { row.rules = JSON.parse(row.rules); } catch { /* keep as string */ }
  }
  if (table === "telegram_outbox" && typeof row.payload === "string") {
    try { row.payload = JSON.parse(row.payload); } catch { /* keep as string */ }
  }
  if (table === "notification_campaigns" && typeof row.result_json === "string") {
    try { row.result_json = JSON.parse(row.result_json); } catch { /* keep as string */ }
  }
  if (table === "audit_logs" && typeof row.payload === "string") {
    try { row.payload = JSON.parse(row.payload); } catch { /* keep as string */ }
  }
  if (table === "players" && !row.name) row.name = row.full_name;
  if (table === "match_media" && !row.highlight_url) row.highlight_url = row.url;
  if (table === "match_photos" && !row.storage_path) row.storage_path = row.url;
  return row;
}

function serializeValue(table: string, column: string, value: any): any {
  if (value === undefined) return null;
  if ((table === "tournaments" && column === "rules") || (table === "telegram_outbox" && column === "payload") || (table === "notification_campaigns" && column === "result_json") || (table === "audit_logs" && column === "payload")) {
    return typeof value === "string" ? value : JSON.stringify(value ?? {});
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function assertTable(table: string) {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);
}

function compare(a: any, b: any) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return String(a) === String(b);
}

function applyFilters(rows: Row[], filters: Filter[]) {
  let out = rows;
  for (const filter of filters) {
    if (filter.type === "eq") {
      out = out.filter((row) => compare(row[filter.column], filter.value));
    } else if (filter.type === "neq") {
      out = out.filter((row) => !compare(row[filter.column], filter.value));
    } else if (filter.type === "is") {
      out = out.filter((row) => {
        const v = row[filter.column];
        if (filter.value === null) return v === null || v === undefined;
        return compare(v, filter.value);
      });
    } else if (filter.type === "in") {
      const values = filter.values.map((v) => String(v));
      out = out.filter((row) => values.includes(String(row[filter.column])));
    } else if (["gte", "lte", "gt", "lt"].includes(filter.type)) {
      out = out.filter((row) => {
        const a = row[filter.column];
        const b = filter.value;
        const an = Number(a);
        const bn = Number(b);
        const numeric = Number.isFinite(an) && Number.isFinite(bn);
        const av: any = numeric ? an : String(a ?? "");
        const bv: any = numeric ? bn : String(b ?? "");
        if (filter.type === "gte") return av >= bv;
        if (filter.type === "lte") return av <= bv;
        if (filter.type === "gt") return av > bv;
        return av < bv;
      });
    } else if (filter.type === "like") {
      const needle = String(filter.value ?? "").replaceAll("%", "");
      out = out.filter((row) => {
        const hay = String(row[filter.column] ?? "");
        return filter.caseInsensitive ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle);
      });
    } else if (filter.type === "or") {
      out = out.filter((row) => evalOr(row, filter.expression));
    }
  }
  return out;
}

function evalOr(row: Row, expression: string) {
  const clauses: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      clauses.push(expression.slice(start, i));
      start = i + 1;
    }
  }
  clauses.push(expression.slice(start));

  return clauses.some((rawClause) => {
    const clause = rawClause.trim();
    if (clause.startsWith("and(") && clause.endsWith(")")) {
      const inner = clause.slice(4, -1);
      return inner.split(",").every((part) => evalAtom(row, part));
    }
    return evalAtom(row, clause);
  });
}

function evalAtom(row: Row, atom: string) {
  const match = atom.trim().match(/^([a-zA-Z0-9_]+)\.eq\.(.*)$/);
  if (!match) return false;
  return compare(row[match[1]], match[2]);
}

function applyOrder(rows: Row[], orders: Order[]) {
  const copy = [...rows];
  for (const order of [...orders].reverse()) {
    copy.sort((a, b) => {
      const av = a[order.column];
      const bv = b[order.column];
      const an = av === null || av === undefined || av === "";
      const bn = bv === null || bv === undefined || bv === "";
      if (an || bn) {
        if (an && bn) return 0;
        const nullFirst = order.nullsFirst ?? false;
        return an ? (nullFirst ? -1 : 1) : (nullFirst ? 1 : -1);
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return order.ascending ? cmp : -cmp;
    });
  }
  return copy;
}

function attachRelations(table: string, rows: Row[]): Row[] {
  if (!rows.length) return rows;
  if (table === "matches") {
    const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
    const seasons = new Map(tableRows("seasons").map((s) => [s.id, s]));
    return rows.map((r) => ({ ...r, home: teams.get(r.home_team_id) ?? null, away: teams.get(r.away_team_id) ?? null, season: seasons.get(r.season_id) ?? null }));
  }
  if (table === "seasons") {
    const tournaments = new Map(tableRows("tournaments").map((t) => [t.id, t]));
    return rows.map((r) => ({ ...r, tournament: tournaments.get(r.tournament_id) ?? null }));
  }
  if (table === "season_teams") {
    const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
    const seasons = new Map(tableRows("seasons").map((s) => [s.id, s]));
    return rows.map((r) => ({ ...r, team: teams.get(r.team_id) ?? null, season: seasons.get(r.season_id) ?? null }));
  }
  if (table === "match_events") {
    const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
    const players = new Map(tableRows("players").map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      team: teams.get(r.team_id) ?? null,
      player: players.get(r.player_id) ?? null,
      scorer: players.get(r.player_id) ?? null,
      assist: players.get(r.assist_player_id) ?? null,
      assist_player: players.get(r.assist_player_id) ?? null,
    }));
  }
  if (table === "match_lineups") {
    const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
    const players = new Map(tableRows("players").map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, team: teams.get(r.team_id) ?? null, gk: players.get(r.goalkeeper_player_id) ?? null, goalkeeper: players.get(r.goalkeeper_player_id) ?? null }));
  }
  if (table === "players") {
    const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
    return rows.map((r) => ({ ...r, team: teams.get(r.team_id) ?? null }));
  }
  return rows;
}

function selectRows(payload: LocalQueryPayload) {
  let rows = attachRelations(payload.table, tableRows(payload.table));
  rows = applyFilters(rows, payload.filters);
  rows = applyOrder(rows, payload.orders);
  if (typeof payload.offsetCount === "number") rows = rows.slice(payload.offsetCount);
  if (typeof payload.limitCount === "number") rows = rows.slice(0, payload.limitCount);
  return rows;
}

function insertRows(table: string, values: any): Row[] {
  assertTable(table);
  const db = getDb();
  const cols = columnsOf(table);
  const arr = Array.isArray(values) ? values : [values];
  const inserted: Row[] = [];

  for (const raw of arr) {
    const row: Row = { ...(DEFAULTS[table] ?? {}), ...(raw ?? {}) };
    if (!row.id && cols.includes("id")) row.id = createId();
    if (!row.created_at && cols.includes("created_at")) row.created_at = nowIso();
    if (cols.includes("updated_at")) row.updated_at = nowIso();
    if (table === "players" && !row.name && row.full_name) row.name = row.full_name;
    if (table === "match_media" && !row.url && row.highlight_url) row.url = row.highlight_url;
    if (table === "match_photos" && !row.url && row.storage_path) row.url = row.storage_path;

    const keys = Object.keys(row).filter((k) => cols.includes(k));
    const placeholders = keys.map(() => "?").join(",");
    const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders})`;
    db.prepare(sql).run(...keys.map((k) => serializeValue(table, k, row[k])));
    inserted.push(normalizeRow(table, { ...row }));
  }
  return attachRelations(table, inserted);
}

function updateRows(payload: LocalQueryPayload): Row[] {
  const table = payload.table;
  assertTable(table);
  const db = getDb();
  const cols = columnsOf(table);
  const values = (payload.values ?? {}) as Row;
  const rows = applyFilters(tableRows(table), payload.filters);
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (cols.includes("updated_at") && values.updated_at === undefined) values.updated_at = nowIso();
  const keys = Object.keys(values).filter((k) => cols.includes(k) && k !== "id");
  if (!ids.length || !keys.length) return attachRelations(table, rows);
  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  const sql = `UPDATE ${table} SET ${setSql} WHERE id = ?`;
  const stmt = db.prepare(sql);
  for (const id of ids) stmt.run(...keys.map((k) => serializeValue(table, k, values[k])), id);
  return attachRelations(table, tableRows(table).filter((r) => ids.includes(r.id)));
}

function deleteRows(payload: LocalQueryPayload): Row[] {
  const table = payload.table;
  assertTable(table);
  const db = getDb();
  const rows = applyFilters(tableRows(table), payload.filters);
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return [];
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  for (const id of ids) stmt.run(id);
  return rows;
}

function upsertRows(payload: LocalQueryPayload): Row[] {
  const table = payload.table;
  assertTable(table);
  const db = getDb();
  const cols = columnsOf(table);
  const conflictCols = (payload.onConflict || "id").split(",").map((x) => x.trim()).filter(Boolean);
  const arr = Array.isArray(payload.values) ? payload.values : [payload.values];
  const output: Row[] = [];

  for (const raw of arr) {
    const row: Row = { ...(DEFAULTS[table] ?? {}), ...(raw ?? {}) };
    if (!row.id && cols.includes("id")) row.id = createId();
    if (!row.created_at && cols.includes("created_at")) row.created_at = nowIso();
    if (cols.includes("updated_at")) row.updated_at = nowIso();
    if (table === "players" && !row.name && row.full_name) row.name = row.full_name;
    if (table === "match_media" && !row.url && row.highlight_url) row.url = row.highlight_url;
    if (table === "match_photos" && !row.url && row.storage_path) row.url = row.storage_path;

    const where = conflictCols.map((k) => `${k} = ?`).join(" AND ");
    const existing = db.prepare(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`).get(...conflictCols.map((k) => serializeValue(table, k, row[k])));
    if (existing?.id) {
      const keys = Object.keys(row).filter((k) => cols.includes(k) && k !== "id" && !conflictCols.includes(k));
      if (keys.length) {
        const setSql = keys.map((k) => `${k} = ?`).join(", ");
        db.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`).run(...keys.map((k) => serializeValue(table, k, row[k])), existing.id);
      }
      output.push(normalizeRow(table, { ...existing, ...row, id: existing.id }));
    } else {
      output.push(...insertRows(table, row));
    }
  }
  return attachRelations(table, output);
}

export async function executeLocalQuery(payload: LocalQueryPayload): Promise<LocalQueryResult<any>> {
  try {
    assertTable(payload.table);
    let rows: Row[] = [];

    if (payload.action === "select") rows = selectRows(payload);
    if (payload.action === "insert") rows = insertRows(payload.table, payload.values);
    if (payload.action === "update") rows = updateRows(payload);
    if (payload.action === "delete") rows = deleteRows(payload);
    if (payload.action === "upsert") rows = upsertRows(payload);

    const count = payload.count === "exact" ? rows.length : null;
    if (payload.head) return { data: null, error: null, count };

    if (payload.singleMode === "single") {
      if (rows.length !== 1) return { data: null, error: { message: rows.length === 0 ? "Row not found" : "Multiple rows returned" }, count };
      return { data: rows[0], error: null, count };
    }
    if (payload.singleMode === "maybeSingle") {
      if (rows.length > 1) return { data: null, error: { message: "Multiple rows returned" }, count };
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  } catch (err: any) {
    return { data: null, error: { message: err?.message ?? "SQLite error" }, count: null };
  }
}

export async function executeRpc(name: string, args?: Record<string, unknown>): Promise<LocalQueryResult<any[]>> {
  try {
    if (name === "tfc_top_scorers") return { data: topEvents(args, "GOAL", "goals"), error: null };
    if (name === "tfc_top_assists") return { data: topAssists(args), error: null };
    return { data: [], error: null };
  } catch (err: any) {
    return { data: null, error: { message: err?.message ?? "RPC error" } };
  }
}

function topEvents(args: Record<string, unknown> | undefined, type: string, valueName: string) {
  const seasonId = String(args?.p_season_id ?? "");
  const limit = Number(args?.p_limit ?? 10);
  const matches = tableRows("matches").filter((m) => !seasonId || m.season_id === seasonId);
  const matchIds = new Set(matches.map((m) => m.id));
  const events = tableRows("match_events").filter((e) => matchIds.has(e.match_id) && e.type === type && e.player_id);
  const players = new Map(tableRows("players").map((p) => [p.id, p]));
  const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
  const map = new Map<string, any>();
  for (const e of events) {
    const key = e.player_id;
    const p = players.get(e.player_id) ?? {};
    const team = teams.get(e.team_id || p.team_id) ?? {};
    const row = map.get(key) ?? { player_id: key, full_name: p.full_name ?? p.name ?? "Player", team_name: team.name ?? "-", team_logo_url: team.logo_url ?? null, [valueName]: 0 };
    row[valueName] += 1;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b[valueName] - a[valueName]).slice(0, limit);
}

function topAssists(args: Record<string, unknown> | undefined) {
  const seasonId = String(args?.p_season_id ?? "");
  const limit = Number(args?.p_limit ?? 10);
  const matches = tableRows("matches").filter((m) => !seasonId || m.season_id === seasonId);
  const matchIds = new Set(matches.map((m) => m.id));
  const events = tableRows("match_events").filter((e) => matchIds.has(e.match_id) && e.type === "GOAL" && e.assist_player_id);
  const players = new Map(tableRows("players").map((p) => [p.id, p]));
  const teams = new Map(tableRows("teams").map((t) => [t.id, t]));
  const map = new Map<string, any>();
  for (const e of events) {
    const key = e.assist_player_id;
    const p = players.get(e.assist_player_id) ?? {};
    const team = teams.get(p.team_id || e.team_id) ?? {};
    const row = map.get(key) ?? { player_id: key, full_name: p.full_name ?? p.name ?? "Player", team_name: team.name ?? "-", team_logo_url: team.logo_url ?? null, assists: 0 };
    row.assists += 1;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.assists - a.assists).slice(0, limit);
}

export async function updateUserRoleByTelegramId(telegramId: number, role: string) {
  const db = getDb();
  db.prepare("UPDATE app_users SET role = ? WHERE telegram_id = ?").run(role, telegramId);
}

export const PUBLIC_READ_TABLES = new Set([
  "tournaments",
  "seasons",
  "teams",
  "players",
  "season_teams",
  "matches",
  "match_events",
  "match_lineups",
  "player_ratings",
  "match_media",
  "match_photos",
  "platform_settings",
]);

export function isPublicReadTable(table: string) {
  return PUBLIC_READ_TABLES.has(table);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM platform_settings WHERE key = ? LIMIT 1").get(key);
  return row?.value ?? null;
}

export async function getSettingsMap(includePrivate = false): Promise<Record<string, string>> {
  const db = getDb();
  const rows = db.prepare(includePrivate ? "SELECT key,value FROM platform_settings" : "SELECT key,value FROM platform_settings WHERE is_public = 1").all();
  const out: Record<string, string> = {};
  for (const r of rows) out[String(r.key)] = String(r.value ?? "");
  return out;
}

export async function upsertSetting(key: string, value: string, isPublic = true) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM platform_settings WHERE key = ?").get(key);
  if (existing?.id) {
    db.prepare("UPDATE platform_settings SET value = ?, is_public = ?, updated_at = ? WHERE key = ?").run(value, isPublic ? 1 : 0, nowIso(), key);
  } else {
    db.prepare("INSERT INTO platform_settings (id,key,value,is_public,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(createId(), key, value, isPublic ? 1 : 0, nowIso(), nowIso());
  }
}

export async function appSummary() {
  const db = getDb();
  const tableNames = ["tournaments", "seasons", "teams", "players", "matches", "app_users", "telegram_channels", "notification_campaigns"];
  const counts: Record<string, number> = {};
  for (const t of tableNames) counts[t] = countRows(db, t);
  const admins = db.prepare("SELECT COUNT(*) AS c FROM app_users WHERE role = 'admin'").get().c ?? 0;
  return { counts, admins: Number(admins), sqlite_path: sqlitePath() };
}
