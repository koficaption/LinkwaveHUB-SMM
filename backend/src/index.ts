import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { router } from "./routes/index.js";
import { errorHandler, asyncHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";
import { handleKorapayWebhook } from "./routes/korapayWebhook.js";

const app = express();

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  if (origin === config.frontendUrl) return callback(null, true);
  try {
    const host = new URL(origin).hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".cursor.sh") ||
      host.endsWith(".cursorusercontent.com")
    ) {
      return callback(null, true);
    }
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
app.use(cors({ origin: corsOrigin, credentials: true }));
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
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

fs.mkdirSync(config.uploadDir, { recursive: true });
app.use("/uploads", express.static(config.uploadDir));
app.use("/api", router);

app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

async function start() {
  await migrate();
  await seedIfEmpty();
  app.listen(config.port, () => {
    console.log(`LinkWaveHub API listening on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
