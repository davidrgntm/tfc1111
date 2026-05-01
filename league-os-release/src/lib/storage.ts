import "server-only";
import fs from "node:fs";
import path from "node:path";

export function safeUploadPath(p: string) {
  return p.replace(/^\/+/, "").replace(/\.\./g, "").replace(/\\/g, "/");
}

export function uploadRoot() {
  const env = process.env.UPLOAD_DIR || process.env.UPLOAD_ROOT;
  if (env && env.trim()) return env.trim();
  if (fs.existsSync("/data")) return "/data/uploads";
  return path.join(process.cwd(), "public", "uploads");
}

export function uploadFilePath(bucket: string, filePath: string) {
  return path.join(uploadRoot(), safeUploadPath(bucket), safeUploadPath(filePath));
}

export function uploadPublicUrl(bucket: string, filePath: string) {
  return `/uploads/${safeUploadPath(bucket)}/${safeUploadPath(filePath)}`;
}
