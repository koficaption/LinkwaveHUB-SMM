import crypto from "node:crypto";
import { AppError } from "../errors.js";
import { config, LIVE_HOSTS } from "../config.js";
import { getRecaptchaConfig } from "./settingsService.js";

const TOKEN_TTL_MS = 3 * 60 * 1000;
const usedTokens = new Map<string, number>();

function allowedRecaptchaHosts() {
  const hosts = new Set<string>(["localhost", "127.0.0.1", "testkey.google.com", ...LIVE_HOSTS]);
  for (const raw of [config.frontendUrl, config.googleRedirectUri]) {
    try {
      const host = new URL(raw).hostname.toLowerCase();
      if (host) hosts.add(host);
    } catch {
      // ignore invalid configured URLs
    }
  }
  return hosts;
}

function pruneUsedTokens(now = Date.now()) {
  for (const [hash, expires] of usedTokens) {
    if (expires <= now) usedTokens.delete(hash);
  }
}

type SiteVerifyResponse = {
  success?: boolean;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

/**
 * Official Google reCAPTCHA v2 siteverify.
 * Production never skips this when verification is enabled — missing keys or a missing
 * token reject the request instead of creating an account.
 */
export async function verifyRecaptchaToken(token?: string | null, ip?: string) {
  const cfg = await getRecaptchaConfig();
  if (!cfg.enabled) return;

  if (!cfg.siteKey || !cfg.secret) {
    if (!config.isProd) return;
    throw new AppError("Google verification is not configured. Try again later.", 503);
  }

  const value = String(token || "").trim();
  if (!value) {
    throw new AppError("Complete the Google verification to continue", 400);
  }

  const tokenHash = crypto.createHash("sha256").update(value).digest("hex");
  pruneUsedTokens();
  if (usedTokens.has(tokenHash)) {
    throw new AppError("Google verification failed. Tick the box again and retry.", 400);
  }

  const body = new URLSearchParams({
    secret: cfg.secret,
    response: value,
  });
  if (ip) body.set("remoteip", ip);

  let json: SiteVerifyResponse;
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(12_000),
    });
    json = await response.json() as SiteVerifyResponse;
  } catch {
    throw new AppError("Google verification is unavailable. Try again.", 503);
  }

  if (!json.success) {
    throw new AppError("Google verification failed. Tick the box again and retry.", 400);
  }

  const challenged = json.challenge_ts ? Date.parse(json.challenge_ts) : NaN;
  if (Number.isFinite(challenged) && Date.now() - challenged > TOKEN_TTL_MS) {
    throw new AppError("Google verification expired. Tick the box again and retry.", 400);
  }

  const hostname = String(json.hostname || "").toLowerCase();
  if (hostname && !allowedRecaptchaHosts().has(hostname)) {
    throw new AppError("Google verification failed. Tick the box again and retry.", 400);
  }

  usedTokens.set(tokenHash, Date.now() + TOKEN_TTL_MS);
}
