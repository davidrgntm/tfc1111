export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/session";
import { safeUploadPath, uploadFilePath } from "@/lib/storage";

async function requireAdmin() {
  const session = await getSession();
  return Boolean(session?.tg?.id && session.role === "admin");
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ data: null, error: { message: "Admin huquqi kerak" } }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const bucket = safeUploadPath(String(form.get("bucket") || "files"));
    const filePath = safeUploadPath(String(form.get("path") || "file.bin"));
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ data: null, error: { message: "File topilmadi" } }, { status: 400 });
    }

    const target = uploadFilePath(bucket, filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ data: { path: filePath }, error: null });
  } catch (err: any) {
    return NextResponse.json({ data: null, error: { message: err?.message ?? "Upload error" } }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ data: null, error: { message: "Admin huquqi kerak" } }, { status: 403 });
  }

  try {
    const body = await req.json();
    const bucket = safeUploadPath(String(body.bucket || "files"));
    const paths = Array.isArray(body.paths) ? body.paths.map((x: unknown) => safeUploadPath(String(x))) : [];
    for (const p of paths) {
      const target = uploadFilePath(bucket, p);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    return NextResponse.json({ data: { paths }, error: null });
  } catch (err: any) {
    return NextResponse.json({ data: null, error: { message: err?.message ?? "Remove error" } }, { status: 500 });
  }
}
