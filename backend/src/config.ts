import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function stripSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function isLocalHttpUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function configuredPublicUrl() {
  const frontend = stripSlash(process.env.FRONTEND_URL ?? "");
  const render = stripSlash(process.env.RENDER_EXTERNAL_URL ?? "");
  if (process.env.NODE_ENV === "production") {
    if (frontend && !isLocalHttpUrl(frontend)) return frontend;
    if (render && !isLocalHttpUrl(render)) return render;
  }
  return frontend || "http://localhost:5173";
}

function configuredGoogleRedirectUri(origin: string) {
  const explicit = stripSlash(process.env.GOOGLE_REDIRECT_URI ?? "");
  if (explicit && !(process.env.NODE_ENV === "production" && isLocalHttpUrl(explicit))) {
    return explicit;
  }
  return `${origin}/api/auth/google/callback`;
}

const publicUrl = configuredPublicUrl();

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    "DATABASE_URL",
    "postgres://linkwave:linkwave_dev_password@127.0.0.1:5432/linkwavehub"
  ),
  jwtSecret: required("JWT_SECRET", "linkwavehub-dev-jwt-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  encryptionKey: required(
    "ENCRYPTION_KEY",
    "linkwavehub-32-byte-key-change!!"
  ),
  frontendUrl: publicUrl,
  cookieName: "lwh_token",
  currency: process.env.DEFAULT_CURRENCY ?? "GHS",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  uploadDir: path.resolve(__dirname, "../../uploads"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: configuredGoogleRedirectUri(publicUrl),
  korapayPublicKey: process.env.KORAPAY_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || "",
  korapaySecretKey: process.env.KORAPAY_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY || "",
  korapayEncryptionKey: process.env.KORAPAY_ENCRYPTION_KEY || process.env.PAYSTACK_ENCRYPTION_KEY || "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? process.env.MAIL_FROM ?? "",
};
