import nodemailer from "nodemailer";
import { config } from "./config.js";
import { decryptSecret, looksEncrypted } from "./utils.js";
import { getSettings } from "./services/settingsService.js";

export type MailAccount = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export async function resolveMailAccount(): Promise<MailAccount> {
  const all = await getSettings();
  const mail = (all.mail as Record<string, unknown> | undefined) ?? {};
  const host = String(mail.host || config.smtpHost || "").trim();
  const port = Number(mail.port || config.smtpPort || 587) || 587;
  const user = String(mail.user || config.smtpUser || "").trim();
  let pass = String(mail.pass || config.smtpPass || "");
  if (looksEncrypted(pass)) {
    try {
      pass = decryptSecret(pass);
    } catch {
      /* keep stored value */
    }
  }
  const from = String(mail.from || config.smtpFrom || user || "").trim();
  const enabled = mail.enabled !== false;
  return { enabled, host, port, user, pass, from };
}

export async function mailConfigured() {
  const account = await resolveMailAccount();
  return Boolean(account.enabled && account.host && account.from);
}

export async function sendMail(input: { to: string; subject: string; text: string; html: string }) {
  const account = await resolveMailAccount();
  if (!account.enabled || !account.host || !account.from) {
    console.warn(`[mail] SMTP is not configured. Skip send to ${input.to}: ${input.subject}`);
    return { sent: false as const };
  }
  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.port === 465,
    auth: account.user ? { user: account.user, pass: account.pass } : undefined,
  });
  await transporter.sendMail({
    from: account.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return { sent: true as const };
}

export function passwordResetEmail(input: { name: string; resetUrl: string; siteName: string }) {
  const subject = `Reset your ${input.siteName} password`;
  const text = [
    `Hi ${input.name},`,
    "",
    `We received a request to reset your ${input.siteName} password.`,
    "Open this link to choose a new password (it expires in 1 hour):",
    input.resetUrl,
    "",
    "If you did not ask for this, you can ignore this email.",
  ].join("\n");
  const html = `
    <p>Hi ${escapeHtml(input.name)},</p>
    <p>We received a request to reset your ${escapeHtml(input.siteName)} password.</p>
    <p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#00A341;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Reset password</a></p>
    <p>This link expires in 1 hour. If you did not ask for this, you can ignore this email.</p>
  `;
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
