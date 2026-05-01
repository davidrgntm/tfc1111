export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import { uploadFilePath, safeUploadPath } from "@/lib/storage";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const params = await ctx.params;
  const parts = params.path ?? [];
  const bucket = safeUploadPath(parts[0] ?? "files");
  const rest = safeUploadPath(parts.slice(1).join("/"));
  const file = uploadFilePath(bucket, rest);
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const body = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
