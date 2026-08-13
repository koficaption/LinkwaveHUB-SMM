import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { router } from "./routes/index.js";
import { v1Router } from "./routes/v1.js";
import { errorHandler, asyncHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";
import { handleKorapayWebhook } from "./routes/korapayWebhook.js";
import { isAllowedWebHost } from "./utils.js";
import { syncRefillStatuses } from "./services/refillService.js";
import { syncWebhookDeliveries } from "./services/apiWebhookService.js";

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
const dashboardLimit = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1")) return next();
  return dashboardLimit(req, res, next);
});

fs.mkdirSync(config.uploadDir, { recursive: true });
app.use("/uploads", express.static(config.uploadDir));
app.use("/api/v1", v1Router);
app.use("/api", router);

app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

async function start() {
  await migrate();
  await seedIfEmpty();
  app.listen(config.port, () => {
    console.log(`LinkBoost Growth API listening on http://localhost:${config.port}`);
  });
  setInterval(() => {
    syncRefillStatuses().catch((err) => console.error("Refill status sync failed", err));
  }, 60_000);
  setInterval(() => {
    syncWebhookDeliveries().catch((err) => console.error("Webhook delivery sync failed", err));
  }, 60_000);
}

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
