import { AppError } from "../errors.js";
import { config, LIVE_HOSTS } from "../config.js";
import { getRecaptchaConfig } from "./settingsService.js";

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

export async function verifyRecaptchaToken(token?: string | null, ip?: string) {
  const cfg = await getRecaptchaConfig();
  if (!cfg.required) return;
  const value = String(token || "").trim();
  if (!value) {
    throw new AppError("Complete the Google verification to continue", 400);
  }
  const body = new URLSearchParams({
    secret: cfg.secret,
    response: value,
  });
  if (ip) body.set("remoteip", ip);
  let json: { success?: boolean; hostname?: string; "error-codes"?: string[] };
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(12_000),
    });
    json = await response.json() as { success?: boolean; hostname?: string; "error-codes"?: string[] };
  } catch {
    throw new AppError("Google verification is unavailable. Try again.", 503);
  }
  if (!json.success) {
    throw new AppError("Google verification failed. Tick the box again and retry.", 400);
  }
  const hostname = String(json.hostname || "").toLowerCase();
  if (hostname && !allowedRecaptchaHosts().has(hostname)) {
    throw new AppError("Google verification failed. Tick the box again and retry.", 400);
  }
}
