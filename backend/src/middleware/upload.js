import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Keep in step with MAX_FILES / FILE_ACCEPT in frontend/src/components/ui.jsx
export const MAX_FILES = 10;
const ALLOWED = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.zip'];

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'File type not allowed')),
});

export const toFiles = (files = []) => files.map((f) => ({ name: f.originalname, path: `/uploads/${f.filename}`, size: f.size }));
