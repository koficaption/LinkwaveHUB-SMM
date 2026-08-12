import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import slugify from "slugify";
import { config } from "./config.js";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { id: string; role: string; email: string }): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as SignOptions);
}

export function verifyToken(token: string): { id: string; role: string; email: string } {
  return jwt.verify(token, config.jwtSecret) as { id: string; role: string; email: string };
}

export function makeSlug(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true });
}

export function uniqueSlug(value: string): string {
  return `${makeSlug(value)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function publicOrderId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LWH-${date}-${rand}`;
}

export function publicTicketId(): string {
  return `TCK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function paymentReference(): string {
  return `PAY-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function calcCharge(pricePer1000: number, quantity: number): number {
  return Number(((pricePer1000 * quantity) / 1000).toFixed(4));
}

export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function like(term: string | undefined): string | null {
  if (!term || !String(term).trim()) return null;
  return `%${String(term).trim().replace(/[%_]/g, "\\$&")}%`;
}

export function clientIp(req: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}
