import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { badRequest } from './errors.js';

export const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(badRequest('Upload a JPEG, PNG or WebP image.')),
});

/** Re-encodes (strips metadata, caps size) to WebP — this also rejects files that are not real images. */
export async function saveImage(buf: Buffer): Promise<string> {
  let out: Buffer;
  try {
    out = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch {
    throw badRequest('That file is not a valid image.');
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.webp`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), out);
  return `/uploads/${name}`;
}

export async function removeImage(url: string) {
  if (!url.startsWith('/uploads/')) return;
  await fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true });
}
