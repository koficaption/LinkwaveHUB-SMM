import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.frontendUrl, credentials: true }));
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
