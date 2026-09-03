import type { Request, Response } from "express";
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { completeVerifiedPayment } from "../services/walletService.js";

export async function handleKorapayWebhook(req: Request, res: Response) {
  if (!config.korapaySecretKey) {
    throw new AppError("Korapay is not configured", 503);
  }
  const signature = req.headers["x-korapay-signature"];
  if (typeof signature !== "string") {
    throw new AppError("Missing Korapay signature", 401);
  }
  const raw = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
  const payload = JSON.parse(raw.toString("utf8")) as {
    event?: string;
    data?: { reference?: string; status?: string };
  };
  const hash = createHmac("sha256", config.korapaySecretKey)
    .update(JSON.stringify(payload.data ?? {}))
    .digest("hex");
  if (hash !== signature) {
    throw new AppError("Invalid Korapay signature", 401);
  }

  if (payload.event === "charge.success" && payload.data?.reference) {
    try {
      await completeVerifiedPayment(payload.data.reference);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) {
        res.json({ received: true, ignored: true });
        return;
      }
      throw error;
    }
  }
  res.json({ received: true });
}
