import { queryOne } from "../db.js";
import { AppError } from "../errors.js";

const MAX_NEW_ACCOUNTS_PER_IP_DAY = 6;

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

export function normalizeClientIp(ip?: string | null) {
  let value = String(ip || "").trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  if (value === "::1") return "127.0.0.1";
  return value;
}

export function assertNotDisposableEmail(email: string) {
  const domain = String(email).split("@")[1]?.toLowerCase().trim() || "";
  if (!domain) return;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    throw new AppError("Use a regular email address. Temporary inboxes are not allowed.", 400);
  }
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
