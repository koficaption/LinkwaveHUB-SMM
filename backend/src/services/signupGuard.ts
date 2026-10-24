import { queryOne } from "../db.js";
import { AppError } from "../errors.js";

const MAX_NEW_ACCOUNTS_PER_IP_DAY = 3;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minemail.com",
  "10minutemail.com",
  "33mail.com",
  "bouncr.com",
  "correotemporal.org",
  "crazymailing.com",
  "discarded.email",
  "dispostable.com",
  "dropmail.me",
  "einrot.com",
  "emailfake.com",
  "emailondeck.com",
  "emailtemporario.com.br",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerillamail.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "guerrillamail.info",
  "inboxbear.com",
  "inboxkitten.com",
  "instant-mail.de",
  "mail-temporaire.fr",
  "mailcatch.com",
  "maildrop.cc",
  "mailforspam.com",
  "mailinator.com",
  "mailnator.com",
  "mailnesia.com",
  "mailnull.com",
  "mailtemp.net",
  "meltmail.com",
  "minutemail.com",
  "minuteinbox.com",
  "mintemail.com",
  "moakt.com",
  "mytrashmail.com",
  "nothing.email",
  "pokemail.net",
  "sharklasers.com",
  "spam4.me",
  "spamfree24.org",
  "spamgourmet.com",
  "spamobox.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempail.net",
  "tempinbox.com",
  "tempmail.address",
  "tempmail.com",
  "tempmail.net",
  "tempmail.plus",
  "tempmail.us",
  "tempmailaddress.com",
  "tempmailo.com",
  "temporarioemail.com.br",
  "throwaway.email",
  "throwawaymail.com",
  "tmail.ws",
  "tmails.net",
  "tmpmail.net",
  "tmpmail.org",
  "trash-mail.com",
  "trashmail.com",
  "trashmailer.com",
  "wegwerfadresse.de",
  "wegwerfmail.de",
  "yopmail.com",
]);

const AUTOMATED_USER_AGENTS = /(?:curl|wget|python-requests|python-urllib|go-http-client|scrapy|httpclient|libwww-perl|okhttp|postmanruntime|insomnia|java\/|php\/|libcurl|aiohttp|httpie|node-fetch|undici|axios\/|powershell|sqlmap)/i;

export function normalizeClientIp(ip?: string | null) {
  let value = String(ip || "").trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  if (value === "::1") return "127.0.0.1";
  return value;
}

export function canonicalEmail(email: string) {
  const trimmed = String(email || "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  } else {
    local = local.split("+")[0];
  }
  return `${local}@${domain}`;
}

export function assertNotDisposableEmail(email: string) {
  const domain = String(email).split("@")[1]?.toLowerCase().trim() || "";
  if (!domain) return;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    throw new AppError("Use a regular email address. Temporary inboxes are not allowed.", 400);
  }
}

export function assertHumanUserAgent(userAgent?: string | null, isProd = false) {
  if (!isProd) return;
  const ua = String(userAgent || "").trim();
  if (!ua || AUTOMATED_USER_AGENTS.test(ua)) {
    throw new AppError("Open the site in your browser and try again.", 400);
  }
}

export async function assertEmailAvailable(email: string, exceptUserId?: string) {
  const exact = String(email).trim().toLowerCase();
  const canonical = canonicalEmail(email);
  const existing = await queryOne<{ id: string; deleted_at: string | null }>(
    `SELECT id, deleted_at FROM users
     WHERE LOWER(email) = $1
        OR (
          SPLIT_PART(LOWER(email), '@', 2) IN ('gmail.com', 'googlemail.com')
          AND $2 LIKE '%@gmail.com'
          AND REPLACE(SPLIT_PART(SPLIT_PART(LOWER(email), '@', 1), '+', 1), '.', '')
            || '@gmail.com' = $2
        )
     LIMIT 1`,
    [exact, canonical]
  );
  if (!existing) return;
  if (exceptUserId && existing.id === exceptUserId) return;
  if (existing.deleted_at) return existing;
  throw new AppError("An account with this email already exists", 409);
}

export async function assertNewAccountIpLimit(ip?: string | null) {
  const value = normalizeClientIp(ip);
  if (!value || value === "unknown" || value === "127.0.0.1") return;
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM users
     WHERE deleted_at IS NULL
       AND created_at > NOW() - INTERVAL '24 hours'
       AND last_login_ip = $1`,
    [value]
  );
  if (Number(row?.count ?? 0) >= MAX_NEW_ACCOUNTS_PER_IP_DAY) {
    throw new AppError("Too many accounts were created from this network. Try again tomorrow.", 429);
  }
}

export function looksLikeAutomatedSignup(input: { fullName?: string; email?: string }) {
  const name = String(input.fullName || "").trim().toLowerCase().replace(/\s+/g, "");
  const local = String(input.email || "").split("@")[0]?.toLowerCase() || "";
  if (!name || !local) return false;
  const cannedName = /^(test|user|asdf|qwerty|abcd)\d*$/.test(name);
  const cannedEmail = /^(test|user|asdf|qwerty|abcd)\d*$/.test(local);
  if (cannedName && cannedEmail) return true;
  if (cannedName && /^[a-z]{1,4}\d{5,}$/.test(local)) return true;
  return false;
}

export function assertNotAutomatedSignup(input: { fullName?: string; email?: string }) {
  if (looksLikeAutomatedSignup(input)) {
    throw new AppError("Unable to create account", 400);
  }
}
