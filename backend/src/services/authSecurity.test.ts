import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../errors.js";
import {
  assertHumanUserAgent,
  assertNotDisposableEmail,
  canonicalEmail,
  looksLikeAutomatedSignup,
  normalizeClientIp,
} from "./signupGuard.js";
import {
  evaluateSiteVerify,
  isGoogleTestRecaptchaKeys,
  GOOGLE_TEST_SECRET_KEY,
  GOOGLE_TEST_SITE_KEY,
} from "./recaptchaService.js";

test("canonicalEmail strips gmail dots and plus aliases", () => {
  assert.equal(canonicalEmail("John.Doe+bot@gmail.com"), "johndoe@gmail.com");
  assert.equal(canonicalEmail("johndoe@googlemail.com"), "johndoe@gmail.com");
  assert.equal(canonicalEmail("Ada+promo@yahoo.com"), "ada@yahoo.com");
});

test("disposable email domains are rejected", () => {
  assert.throws(() => assertNotDisposableEmail("bot@mailinator.com"), AppError);
  assert.doesNotThrow(() => assertNotDisposableEmail("person@gmail.com"));
});

test("automated signup patterns are flagged", () => {
  assert.equal(looksLikeAutomatedSignup({ fullName: "user123", email: "user123@gmail.com" }), true);
  assert.equal(looksLikeAutomatedSignup({ fullName: "Kwame Mensah", email: "kwame.mensah@gmail.com" }), false);
  assert.equal(looksLikeAutomatedSignup({ fullName: "Ama 2024", email: "ama2024@gmail.com" }), false);
});

test("client IP mapping strips ipv4-mapped addresses", () => {
  assert.equal(normalizeClientIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeClientIp("::1"), "127.0.0.1");
});

test("production rejects curl-like user agents", () => {
  assert.throws(() => assertHumanUserAgent("curl/8.5.0", true), AppError);
  assert.throws(() => assertHumanUserAgent("", true), AppError);
  assert.doesNotThrow(() => assertHumanUserAgent("Mozilla/5.0 Chrome/120", true));
  assert.doesNotThrow(() => assertHumanUserAgent("curl/8.5.0", false));
});

test("Google dummy recaptcha keys are detected", () => {
  assert.equal(isGoogleTestRecaptchaKeys(GOOGLE_TEST_SITE_KEY, "other"), true);
  assert.equal(isGoogleTestRecaptchaKeys("6Lreal", GOOGLE_TEST_SECRET_KEY), true);
  assert.equal(isGoogleTestRecaptchaKeys("6Lreal", "secret"), false);
});

test("siteverify success is required", () => {
  assert.throws(() => evaluateSiteVerify({ success: false }), AppError);
  assert.doesNotThrow(() => evaluateSiteVerify({
    success: true,
    hostname: "localhost",
    challenge_ts: new Date().toISOString(),
  }));
});

test("expired and unknown hostnames fail siteverify", () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.throws(() => evaluateSiteVerify({ success: true, challenge_ts: old, hostname: "localhost" }), AppError);
  assert.throws(() => evaluateSiteVerify({ success: true, hostname: "evil.example", challenge_ts: new Date().toISOString() }), AppError);
});
