import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { router } from "./routes/index.js";
import { v1Router } from "./routes/v1.js";
import { errorHandler, asyncHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";
import { ensurePrimaryAdmin } from "./services/platformResetService.js";
import { handleKorapayWebhook } from "./routes/korapayWebhook.js";
import { isAllowedWebHost, captureReferralFromRequest } from "./utils.js";
import { syncRefillStatuses } from "./services/refillService.js";
import { syncWebhookDeliveries } from "./services/apiWebhookService.js";
import { syncOpenOrdersFromProvider } from "./services/orderService.js";
import { ensureKorapayPaymentMethod } from "./services/walletService.js";

const app = express();
let bootReady = false;

function liveness(_req: express.Request, res: express.Response) {
  res.status(200).json({
    success: true,
    message: "Success",
    data: { status: "ok", service: "LinkBoost Growth API", ready: bootReady },
  });
}

app.set("trust proxy", 1);
app.get("/health", liveness);
app.get("/api/health", liveness);
app.head("/health", (_req, res) => res.status(200).end());
app.head("/api/health", (_req, res) => res.status(200).end());

app.use((req, res, next) => {
  if (!config.isProd) return next();
  if (req.path === "/health" || req.path === "/api/health") return next();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (host === "www.linkboostgrowth.site" || host.endsWith(".onrender.com")) {
    return res.redirect(301, `https://linkboostgrowth.site${req.originalUrl || "/"}`);
  }
  return next();
});

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  if (origin === config.frontendUrl) return callback(null, true);
  try {
    const host = new URL(origin).hostname;
    if (isAllowedWebHost(host, origin)) return callback(null, true);
  } catch {
    /* ignore */
  }
  callback(null, false);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://accounts.google.com",
        "https://apis.google.com",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://accounts.google.com",
        "https://apis.google.com",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ],
      frameSrc: [
        "'self'",
        "https://accounts.google.com",
        "https://www.google.com",
        "https://recaptcha.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ],
      childSrc: [
        "'self'",
        "https://www.google.com",
        "https://recaptcha.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ],
      connectSrc: [
        "'self'",
        "https://accounts.google.com",
        "https://oauth2.googleapis.com",
        "https://www.googleapis.com",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://www.gstatic.com", "https://www.google.com"],
    },
  },
}));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1")) {
    return cors({
      origin: true,
      credentials: false,
      allowedHeaders: ["Authorization", "API-Key", "Content-Type", "Accept", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    })(req, res, next);
  }
  return cors({ origin: corsOrigin, credentials: true })(req, res, next);
});
app.post(
  "/api/payments/webhooks/korapay",
  express.raw({ type: "application/json" }),
  asyncHandler(handleKorapayWebhook)
);
app.post(
  "/api/payments/webhooks/paystack",
  express.raw({ type: "application/json" }),
  asyncHandler(handleKorapayWebhook)
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  captureReferralFromRequest(req, res);
  next();
});
const dashboardLimit = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/api/health" || req.path.startsWith("/api/v1")) return next();
  return dashboardLimit(req, res, next);
});

fs.mkdirSync(config.uploadDir, { recursive: true });
app.use("/uploads", express.static(config.uploadDir));
app.use("/api/v1", v1Router);
app.use("/api", router);

const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
    },
  }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    const ref = req.path.match(/^\/r\/([A-Za-z0-9]{4,40})$/i);
    if (ref) {
      captureReferralFromRequest(req, res);
      return res.redirect(302, `/register?ref=${encodeURIComponent(ref[1])}`);
    }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  app.head("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).end();
  });
}

app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

async function start() {
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, "0.0.0.0", () => {
      console.log(`LinkBoost Growth API listening on http://0.0.0.0:${config.port}`);
      resolve();
    });
    server.on("error", reject);
  });
  try {
    await migrate();
    await seedIfEmpty();
    await ensurePrimaryAdmin();
    await ensureKorapayPaymentMethod();
    bootReady = true;
  } catch (err) {
    console.error("Failed to start API", err);
    process.exit(1);
  }
  setInterval(() => {
    syncRefillStatuses().catch((err) => console.error("Refill status sync failed", err));
  }, 60_000);
  setInterval(() => {
    syncOpenOrdersFromProvider().catch((err) => console.error("Order status sync failed", err));
  }, 45_000);
  setTimeout(() => {
    syncOpenOrdersFromProvider().catch((err) => console.error("Order status sync failed", err));
  }, 8_000);
  setInterval(() => {
    syncWebhookDeliveries().catch((err) => console.error("Webhook delivery sync failed", err));
  }, 60_000);
}

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
