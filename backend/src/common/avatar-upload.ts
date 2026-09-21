import { mkdir, readdir, unlink } from "node:fs/promises";
import config from "../../config";
import { AppError } from "./errors";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function saveAvatar(file: File, userId: number): Promise<string> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new AppError(400, "INVALID_FILE", "avatar must be png/jpeg/webp/gif");
  if (file.size === 0) throw new AppError(400, "INVALID_FILE", "empty file");
  if (file.size > AVATAR_MAX_BYTES) throw new AppError(400, "FILE_TOO_LARGE", "avatar must be ≤ 2MB");

  const dir = config.UPLOADS_DIR;
  await mkdir(dir, { recursive: true });

  for (const f of await readdir(dir)) {
    if (f.startsWith(`${userId}-`)) await unlink(`${dir}/${f}`);
  }
  const filename = `${userId}-${Date.now()}.${ext}`;
  await Bun.write(`${dir}/${filename}`, file);
  return filename;
}
