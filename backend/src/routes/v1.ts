import { Router } from "express";
import { AppError } from "../errors.js";
import { asyncHandler, validate } from "../middleware/errorHandler.js";
import { requireApiKey, requireScope } from "../middleware/apiAuth.js";
import { apiV1OrderSchema } from "../validators.js";
import { openApiV1 } from "../openapi/v1.js";
import * as catalog from "../services/catalogService.js";
import { publicProductName } from "../services/catalogClassify.js";
import * as orders from "../services/orderService.js";
import * as wallet from "../services/walletService.js";
import * as refills from "../services/refillService.js";
import { clientIp, publicAppOrigin } from "../utils.js";

export const v1Router = Router();

v1Router.get("/openapi.json", (_req, res) => {
  const origin = publicAppOrigin();
  res.json(openApiV1(origin));
});

v1Router.use(requireApiKey);

v1Router.get("/services", requireScope("services:read"), asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(100, Number(req.query.limit || 50));
  const result = await catalog.listProducts({
    platformId: (req.query.platform as string) || undefined,
    categoryId: (req.query.category as string) || undefined,
    search: (req.query.search as string) || undefined,
    page,
    limit,
    apiAvailable: "yes",
  });
  res.json({
    success: true,
    services: result.items.map(catalog.toApiService),
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
}));

v1Router.get("/balance", requireScope("balance:read"), asyncHandler(async (req, res) => {
  const w = await wallet.getWallet(req.user!.id);
  res.json({
    success: true,
    balance: Number(w.available_balance),
    currency: "GHS",
    status: req.user!.status,
  });
}));

v1Router.post("/orders", requireScope("orders:create"), validate(apiV1OrderSchema), asyncHandler(async (req, res) => {
  const productId = req.body.service || req.body.service_id || req.body.productId;
  const target = req.body.target || req.body.link;
  const created = await orders.placeOrder({
    user: req.user!,
    productId,
    quantity: req.body.quantity,
    target,
    viaApi: true,
    apiKeyId: req.apiKey!.id,
  });
  if (!created) throw new AppError("Order could not be created", 500);
  const order = created as Record<string, unknown>;
  res.status(201).json({
    success: true,
    order: {
      id: order.public_id,
      service: order.product_id,
      quantity: order.quantity,
      status: order.status,
    },
  });
}));

v1Router.get("/orders", requireScope("orders:read"), asyncHandler(async (req, res) => {
  const result = await orders.listOrders({
    user: req.user!,
    status: req.query.status as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    search: (req.query.order_id as string) || (req.query.search as string) || undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    source: "api",
  });
  res.json({
    success: true,
    orders: result.items.map((row) => toPublicApiOrder(row as Record<string, unknown>)),
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
}));

v1Router.get("/orders/:id", requireScope("orders:read"), asyncHandler(async (req, res) => {
  const order = await orders.getOrder(req.params.id, req.user!) as Record<string, unknown>;
  res.json({ success: true, order: toPublicApiOrder(order) });
}));

v1Router.post("/orders/:id/cancel", requireScope("orders:cancel"), asyncHandler(async (req, res) => {
  const order = await orders.cancelApiOrder(req.params.id, req.user!, clientIp(req)) as Record<string, unknown>;
  res.json({
    success: true,
    order: {
      id: order.public_id,
      status: order.status,
    },
  });
}));

v1Router.post("/orders/:id/refill", requireScope("orders:create"), asyncHandler(async (req, res) => {
  const refill = await refills.requestRefill(req.params.id, req.user!, clientIp(req), undefined, { requireApi: true });
  res.status(201).json({
    success: true,
    refill: {
      id: refill.public_id,
      order_id: refill.order_public_id,
      status: refill.status,
      created_at: refill.requested_at ?? refill.created_at,
    },
  });
}));

v1Router.use((_req, _res, next) => next(new AppError("Route not found", 404, "not_found")));

function toPublicApiOrder(order: Record<string, unknown>) {
  return {
    id: order.public_id,
    service: order.product_id,
    service_name: publicProductName(String(order.product_name || "")),
    quantity: order.quantity,
    target: order.target,
    charge: Number(order.charge),
    status: order.status,
    start_count: order.start_count ?? null,
    remains: order.remains ?? null,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}
