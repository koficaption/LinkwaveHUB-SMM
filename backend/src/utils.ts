import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import slugify from "slugify";
import { config, LIVE_GOOGLE_CALLBACK, LIVE_HOSTS, LIVE_SITE_URL, isLocalHttpUrl } from "./config.js";

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

export function publicChildPanelId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CP-${date}-${rand}`;
}

export function normalizeDomain(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/:].*$/, "");
}

const DEPOSIT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newDepositCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = "LBG";
  for (const byte of bytes) out += DEPOSIT_CODE_ALPHABET[byte % DEPOSIT_CODE_ALPHABET.length];
  return out;
}

export function paymentReference(depositCode?: string): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  if (depositCode) return `${depositCode}-${suffix}`;
  return `PAY-${Date.now()}-${suffix}`;
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

export function calcCharge(pricePer1000: number, quantity: number, priceUnit: "per_1000" | "each" = "per_1000"): number {
  if (priceUnit === "each") return Number((pricePer1000 * quantity).toFixed(4));
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
  const host = hostname.split(":")[0].toLowerCase();
  if (isLocalHostname(host)) return true;
  if (LIVE_HOSTS.has(host)) return true;
  if (origin && origin.replace(/\/$/, "") === config.frontendUrl.replace(/\/$/, "")) return true;
  return (
    host.endsWith(".onrender.com") ||
    host.endsWith(".cursor.sh") ||
    host.endsWith(".cursorusercontent.com") ||
    host.endsWith(".trycloudflare.com") ||
    host.endsWith(".loca.lt") ||
    host.endsWith(".ngrok-free.app") ||
    host.endsWith(".ngrok.io")
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
    const hostname = host.split(":")[0].toLowerCase();
    if (config.isProd && LIVE_HOSTS.has(hostname)) return LIVE_SITE_URL;
    const scheme = config.isProd && proto !== "https" ? "https" : proto || "https";
    return `${scheme}://${host}`.replace(/\/$/, "");
  }
  return config.frontendUrl.replace(/\/$/, "");
}

export function googleCallbackUri(req: Parameters<typeof publicOriginFromRequest>[0]): string {
  if (config.isProd) return LIVE_GOOGLE_CALLBACK;
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

export function googleAppOrigin(req: Parameters<typeof publicOriginFromRequest>[0]): string {
  if (config.isProd) return LIVE_SITE_URL;
  return publicOriginFromRequest(req);
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

export function normalizeReferralCode(code?: string | null) {
  if (!code || typeof code !== "string") return "";
  const cleaned = code.trim().replace(/^.*[?&]ref=/i, "").split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9]{4,40}$/.test(cleaned)) return "";
  return cleaned;
}

export function referralCodeFromRequest(req: { body?: { referralCode?: string }; query?: Record<string, unknown>; cookies?: Record<string, string> }) {
  const queryRef = typeof req.query?.ref === "string" ? req.query.ref : "";
  return (
    normalizeReferralCode(req.body?.referralCode) ||
    normalizeReferralCode(queryRef) ||
    normalizeReferralCode(req.cookies?.lwh_ref)
  );
}

export function normalizeStoreSlug(slug?: string | null) {
  if (!slug || typeof slug !== "string") return "";
  const cleaned = slug.trim().toLowerCase().replace(/^\/store\//, "").split(/[/?#]/)[0];
  if (!/^[a-z0-9-]{2,80}$/.test(cleaned)) return "";
  return cleaned;
}

export function storeSlugFromQuery(req: { query?: Record<string, unknown> }) {
  const queryStore = typeof req.query?.store === "string" ? req.query.store : "";
  const querySlug = typeof req.query?.storeSlug === "string" ? req.query.storeSlug : "";
  return normalizeStoreSlug(queryStore) || normalizeStoreSlug(querySlug);
}

export function storeSlugFromRequest(
  req: { body?: { storeSlug?: string }; query?: Record<string, unknown>; cookies?: Record<string, string> },
  opts?: { includeCookie?: boolean }
) {
  const includeCookie = opts?.includeCookie !== false;
  const body = typeof req.body?.storeSlug === "string" ? req.body.storeSlug : "";
  const cookie = includeCookie && typeof req.cookies?.lwh_panel === "string" ? req.cookies.lwh_panel : "";
  return normalizeStoreSlug(body) || storeSlugFromQuery(req) || normalizeStoreSlug(cookie);
}

export function setPanelCookie(res: { cookie: (name: string, value: string, opts: Record<string, unknown>) => void }, slug: string) {
  const value = normalizeStoreSlug(slug);
  if (!value) return;
  res.cookie("lwh_panel", value, {
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: false,
    secure: config.frontendUrl.startsWith("https"),
  });
}

export function setReferralCookie(res: { cookie: (name: string, value: string, opts: Record<string, unknown>) => void }, code: string) {
  const value = normalizeReferralCode(code);
  if (!value) return;
  res.cookie("lwh_ref", value, {
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: false,
    secure: config.frontendUrl.startsWith("https"),
  });
}

export function captureReferralFromRequest(
  req: { path: string; query?: Record<string, unknown> },
  res: { cookie: (name: string, value: string, opts: Record<string, unknown>) => void }
) {
  const pathCode = req.path.match(/^\/r\/([A-Za-z0-9]{4,40})$/i)?.[1] || "";
  const queryRef = typeof req.query?.ref === "string" ? req.query.ref : "";
  const code = normalizeReferralCode(queryRef) || normalizeReferralCode(pathCode);
  if (code) setReferralCookie(res, code);
  return code;
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
