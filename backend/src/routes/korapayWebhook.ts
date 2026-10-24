import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  const hash = createHmac("sha256", config.korapaySecretKey).update(raw).digest("hex");
  const received = Buffer.from(signature, "utf8");
  const expected = Buffer.from(hash, "utf8");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError("Invalid Korapay signature", 401);
  }
  let payload: {
    event?: string;
    data?: { reference?: string; status?: string };
  };
  try {
    payload = JSON.parse(raw.toString("utf8")) as typeof payload;
  } catch {
    throw new AppError("Invalid Korapay webhook payload", 400);
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
