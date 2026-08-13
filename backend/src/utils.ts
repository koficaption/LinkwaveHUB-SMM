import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import slugify from "slugify";
import { config, isLocalHttpUrl } from "./config.js";

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

export function publicRefillId(): string {
  return `RF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
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

export function looksEncrypted(value: string) {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((part) => /^[0-9a-f]+$/i.test(part));
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
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

function headerValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return typeof value === "string" ? value : "";
}

export function isLocalHostname(hostname: string) {
  const host = hostname.split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function isAllowedWebHost(hostname: string, origin?: string): boolean {
  if (isLocalHostname(hostname)) return true;
  if (origin && origin.replace(/\/$/, "") === config.frontendUrl.replace(/\/$/, "")) return true;
  return (
    hostname.endsWith(".onrender.com") ||
    hostname.endsWith(".cursor.sh") ||
    hostname.endsWith(".cursorusercontent.com") ||
    hostname.endsWith(".trycloudflare.com") ||
    hostname.endsWith(".loca.lt") ||
    hostname.endsWith(".ngrok-free.app") ||
    hostname.endsWith(".ngrok.io")
  );
}

export function publicOriginFromRequest(req: {
  protocol?: string;
  get?: (name: string) => string | undefined;
  headers: Record<string, unknown>;
}): string {
  const forwardedHost = headerValue(req.headers["x-forwarded-host"]);
  const host = (forwardedHost || req.get?.("host") || headerValue(req.headers.host)).split(",")[0].trim();
  const forwardedProto = headerValue(req.headers["x-forwarded-proto"]);
  const proto = (forwardedProto || req.protocol || "https").split(",")[0].trim();
  if (host && !isLocalHostname(host)) {
    const scheme = config.isProd && proto !== "https" ? "https" : proto || "https";
    return `${scheme}://${host}`.replace(/\/$/, "");
  }
  return config.frontendUrl.replace(/\/$/, "");
}

export function googleCallbackUri(req: Parameters<typeof publicOriginFromRequest>[0]): string {
  const origin = publicOriginFromRequest(req);
  const explicit = (process.env.GOOGLE_REDIRECT_URI || "").replace(/\/$/, "");
  if (explicit && !isLocalHttpUrl(explicit)) {
    try {
      if (new URL(explicit).origin === origin) return explicit;
    } catch {
      /* ignore */
    }
  }
  return `${origin}/api/auth/google/callback`;
}

export function publicAppOrigin(originHeader?: string | string[]): string {
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (origin) {
    try {
      const host = new URL(origin).hostname;
      if (isAllowedWebHost(host, origin)) return origin.replace(/\/$/, "");
    } catch {
      /* ignore */
    }
  }
  return config.frontendUrl.replace(/\/$/, "");
}

/** Checkout providers redirect the payer's browser here after payment. Only /app/* paths are allowed. */
export function safeCheckoutReturnUrl(candidate: string | undefined, fallbackPath: string): string {
  const path = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;
  const fallback = `${config.frontendUrl.replace(/\/$/, "")}${path}`;
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    if (!url.pathname.startsWith("/app/")) return fallback;
    return `${url.origin}${url.pathname}`;
  } catch {
    return fallback;
  }
}
