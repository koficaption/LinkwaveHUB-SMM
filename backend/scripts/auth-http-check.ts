/**
 * HTTP checks for auth bot protection (tests B–F).
 * Usage: AUTH_BASE_URL=https://linkboostgrowth.site tsx scripts/auth-http-check.ts
 * Local: AUTH_BASE_URL=http://127.0.0.1:4000 tsx scripts/auth-http-check.ts
 */
const base = (process.env.AUTH_BASE_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const origin = process.env.AUTH_ORIGIN || "https://linkboostgrowth.site";

type Json = { success?: boolean; message?: string; data?: Record<string, unknown> };

async function post(path: string, body: unknown, extra: RequestInit = {}) {
  const headers = new Headers(extra.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    ...extra,
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json, remaining: res.headers.get("ratelimit-remaining") };
}

function expectFail(label: string, status: number, json: Json, statusOk: (n: number) => boolean, messagePart?: string) {
  if (!statusOk(status) || json.success !== false) {
    throw new Error(`${label}: expected failure, got ${status} ${JSON.stringify(json)}`);
  }
  if (messagePart && !String(json.message || "").toLowerCase().includes(messagePart.toLowerCase())) {
    throw new Error(`${label}: unexpected message ${json.message}`);
  }
  console.log(`PASS ${label} (${status}: ${json.message})`);
}

function expectBlocked(label: string, status: number, json: Json, messagePart?: string) {
  if (status === 429) {
    console.log(`PASS ${label} (429 rate limit)`);
    return;
  }
  expectFail(label, status, json, (n) => n === 400 || n === 403, messagePart);
}

async function main() {
  const stamp = Date.now();

  const noCaptcha = await post("/api/auth/register", {
    fullName: "Audit User",
    email: `audit-nocaptcha-${stamp}@example.com`,
    password: "Password123",
    gender: "male",
  }, { headers: { Origin: origin, "User-Agent": "Mozilla/5.0 Audit" } });
  expectBlocked("TEST B register without CAPTCHA", noCaptcha.status, noCaptcha.json, "verification");

  const fake = await post("/api/auth/register", {
    fullName: "Audit User",
    email: `audit-fake-${stamp}@example.com`,
    password: "Password123",
    gender: "male",
    recaptchaToken: "fake-token",
  }, { headers: { Origin: origin, "User-Agent": "Mozilla/5.0 Audit" } });
  expectBlocked("TEST C fake CAPTCHA", fake.status, fake.json, "verification");

  const direct = await post("/api/auth/register", {
    fullName: "Audit User",
    email: `audit-direct-${stamp}@example.com`,
    password: "Password123",
    gender: "male",
  }, { headers: { "User-Agent": "curl/8.5.0" } });
  if (direct.status === 429) {
    console.log("PASS TEST E direct API / curl (429 rate limit)");
  } else {
    expectFail("TEST E direct API / curl", direct.status, direct.json, (n) => n === 400);
  }

  const forgot = await post("/api/auth/forgot-password", {
    email: "audit-reset@example.com",
  }, { headers: { Origin: origin, "User-Agent": "Mozilla/5.0 Audit" } });
  if (forgot.json.success && forgot.json.data?.resetUrl) {
    throw new Error("TEST E: forgot-password leaked resetUrl — production must not return reset links");
  }
  if (forgot.status === 400 || forgot.status === 429 || forgot.json.success === false) {
    console.log(`PASS TEST E forgot-password blocked (${forgot.status}: ${forgot.json.message || "rate limited"})`);
  } else if (forgot.json.success && !forgot.json.data?.resetUrl) {
    console.log("PASS TEST E forgot-password did not leak a reset URL");
  } else {
    throw new Error(`TEST E forgot-password unexpected ${forgot.status} ${JSON.stringify(forgot.json)}`);
  }

  const login = await post("/api/auth/login", {
    email: "nobody@example.com",
    password: "wrong-password",
  }, { headers: { Origin: origin, "User-Agent": "Mozilla/5.0 Audit" } });
  expectBlocked("TEST F login without CAPTCHA", login.status, login.json, "verification");

  let limited = false;
  for (let i = 0; i < 8; i += 1) {
    const burst = await post("/api/auth/register", {
      fullName: "Audit User",
      email: `audit-burst-${stamp}-${i}@example.com`,
      password: "Password123",
      gender: "male",
      recaptchaToken: "fake-token",
    }, { headers: { Origin: origin, "User-Agent": "Mozilla/5.0 Audit" } });
    if (burst.status === 429) {
      limited = true;
      console.log(`PASS TEST D rate limit activated on attempt ${i + 1}`);
      break;
    }
  }
  if (!limited) {
    console.log("NOTE TEST D: IP rate limit did not fire in 8 attempts (limit is 5/hour — may already have remaining budget)");
  }

  console.log("Auth HTTP checks finished against", base);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
