"use client";

import { createLocalQueryClient, type LocalQueryPayload, type LocalQueryResult } from "@/lib/local-query";

async function execute(payload: LocalQueryPayload): Promise<LocalQueryResult<any>> {
  const res = await fetch("/api/local-db", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { data: null, error: { message: `Local DB HTTP ${res.status}` } };
  }
  return res.json();
}

const storage = {
  from(bucket: string) {
    return {
      async upload(filePath: string, file: File | Blob, _options?: Record<string, unknown>) {
        const form = new FormData();
        form.append("bucket", bucket);
        form.append("path", filePath);
        form.append("file", file);
        const res = await fetch("/api/local-storage", { method: "POST", body: form });
        if (!res.ok) return { data: null, error: { message: `Upload HTTP ${res.status}` } };
        return res.json();
      },
      getPublicUrl(filePath: string) {
        return { data: { publicUrl: `/uploads/${bucket}/${filePath}` } };
      },
      async remove(paths: string[]) {
        const res = await fetch("/api/local-storage", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bucket, paths }),
        });
        if (!res.ok) return { data: null, error: { message: `Remove HTTP ${res.status}` } };
        return res.json();
      },
    };
  },
};

export const dbClient = createLocalQueryClient(execute, storage);
