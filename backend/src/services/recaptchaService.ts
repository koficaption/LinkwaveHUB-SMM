import { AppError } from "../errors.js";
import { getRecaptchaConfig } from "./settingsService.js";

export async function verifyRecaptchaToken(token?: string | null, ip?: string) {
  const cfg = await getRecaptchaConfig();
  if (!cfg.required) return;
  const value = String(token || "").trim();
  if (!value) {
    throw new AppError("Complete the Google verification to create an account", 400);
  }
  const body = new URLSearchParams({
    secret: cfg.secret,
    response: value,
  });
  if (ip) body.set("remoteip", ip);
  let json: { success?: boolean };
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(12_000),
    });
    json = await response.json() as { success?: boolean };
  } catch {
    throw new AppError("Google verification is unavailable. Try again.", 503);
  }
  if (!json.success) {
    throw new AppError("Google verification failed. Tick the box again and retry.", 400);
  }
}
