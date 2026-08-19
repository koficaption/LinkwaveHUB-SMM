import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { config } from "./config.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8);
    const safeExt = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext) ? ext : ".png";
    cb(null, `${crypto.randomBytes(12).toString("hex")}${safeExt}`);
  },
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      cb(new Error("Choose an image file"));
      return;
    }
    cb(null, true);
  },
});
