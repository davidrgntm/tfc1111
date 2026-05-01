import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createLocalQueryClient } from "@/lib/local-query";
import { executeLocalQuery, executeRpc } from "@/lib/db";
import { safeUploadPath, uploadFilePath, uploadPublicUrl } from "@/lib/storage";

const storage = {
  from(bucket: string) {
    return {
      async upload(filePath: string, file: File | Blob, _options?: Record<string, unknown>) {
        const cleanBucket = safeUploadPath(bucket);
        const clean = safeUploadPath(filePath);
        const target = uploadFilePath(cleanBucket, clean);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(target, buffer);
        return { data: { path: clean }, error: null };
      },
      getPublicUrl(filePath: string) {
        return { data: { publicUrl: uploadPublicUrl(bucket, filePath) } };
      },
      async remove(paths: string[]) {
        for (const p of paths) {
          const target = uploadFilePath(bucket, p);
          if (fs.existsSync(target)) fs.unlinkSync(target);
        }
        return { data: { paths }, error: null };
      },
    };
  },
};

export const dbAdmin = createLocalQueryClient(executeLocalQuery, storage, executeRpc);
