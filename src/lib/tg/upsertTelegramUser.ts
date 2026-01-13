// src/lib/tg/upsertTelegramUser.ts
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TgUser = {
  id: number | string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

// UUIDv5 (sha1) - deterministic: tg:<id> => doim bir xil uuid chiqadi
function uuidToBytes(uuid: string) {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}
function bytesToUuid(buf: Buffer) {
  const hex = buf.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
function uuidv5(name: string, namespaceUuid: string) {
  const ns = uuidToBytes(namespaceUuid);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = crypto.createHash("sha1").update(Buffer.concat([ns, nameBytes])).digest();

  // set version 5
  hash[6] = (hash[6] & 0x0f) | 0x50;
  // set variant RFC4122
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return bytesToUuid(hash.subarray(0, 16));
}

// istasang env bilan alohida namespace qilamiz, hozircha fixed
const NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; // DNS namespace

export async function upsertTelegramUser(tg: TgUser) {
  const telegramId = String(tg.id);
  const profileId = uuidv5(`tg:${telegramId}`, NAMESPACE);

  const fullName =
    `${tg.first_name ?? ""} ${tg.last_name ?? ""}`.trim() ||
    tg.username ||
    `tg_${telegramId}`;

  // profiles jadvali sendagi schema.sql’da bor (id, full_name, avatar_url)
  // shu jadvalga upsert qilamiz
  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      id: profileId,
      full_name: fullName,
      avatar_url: tg.photo_url ?? null,
    },
    { onConflict: "id" }
  );

  if (error) {
    // jadval bo‘lmasa yoki constraint bo‘lsa ham session ishlashi uchun
    // profileId qaytaramiz (keyin DB ni tozalab olamiz)
    return { id: profileId, warning: error.message };
  }

  return { id: profileId };
}
