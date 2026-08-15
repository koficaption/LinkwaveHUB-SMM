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
import { handleKorapayWebhook } from "./routes/korapayWebhook.js";
import { isAllowedWebHost, captureReferralFromRequest } from "./utils.js";
import { syncRefillStatuses } from "./services/refillService.js";
import { syncWebhookDeliveries } from "./services/apiWebhookService.js";
import { syncOpenOrdersFromProvider } from "./services/orderService.js";

const app = express();

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

app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://www.gstatic.com"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://www.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
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
  if (req.path.startsWith("/api/v1")) return next();
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
}

app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

async function start() {
  await migrate();
  await seedIfEmpty();
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`LinkBoost Growth API listening on http://0.0.0.0:${config.port}`);
  });
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
