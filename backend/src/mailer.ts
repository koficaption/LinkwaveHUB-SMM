import nodemailer from "nodemailer";
import { config } from "./config.js";

const smtpReady = Boolean(config.smtpHost && config.smtpFrom);

const transporter = smtpReady
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    })
  : null;

export function mailConfigured() {
  return Boolean(transporter);
}

export async function sendMail(input: { to: string; subject: string; text: string; html: string }) {
  if (!transporter || !config.smtpFrom) {
    console.warn(`[mail] SMTP is not configured. Skip send to ${input.to}: ${input.subject}`);
    return { sent: false as const };
  }
  await transporter.sendMail({
    from: config.smtpFrom,
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
