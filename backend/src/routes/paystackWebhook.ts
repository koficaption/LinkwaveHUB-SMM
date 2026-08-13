import type { Request, Response } from "express";
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { completeVerifiedPayment } from "../services/walletService.js";

export async function handlePaystackWebhook(req: Request, res: Response) {
  if (!config.paystackSecretKey) {
    throw new AppError("Paystack is not configured", 503);
  }
  const signature = req.headers["x-paystack-signature"];
  if (typeof signature !== "string") {
    throw new AppError("Missing Paystack signature", 401);
  }
  const raw = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
  const hash = createHmac("sha512", config.paystackSecretKey).update(raw).digest("hex");
  if (hash !== signature) {
    throw new AppError("Invalid Paystack signature", 401);
  }

  const payload = JSON.parse(raw.toString("utf8")) as {
    event?: string;
    data?: { reference?: string };
  };
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
