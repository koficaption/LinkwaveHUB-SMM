import { Router } from "express";
import { ok } from "../errors.js";
import { asyncHandler, validate } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  apiApplySchema,
  apiDeveloperSettingsSchema,
  apiKeyCreateSchema,
  apiKeyUpdateSchema,
  apiWebhookSchema,
} from "../validators.js";
import * as apiDev from "../services/apiDeveloperService.js";
import * as catalog from "../services/catalogService.js";
import * as orders from "../services/orderService.js";
import * as wallet from "../services/walletService.js";

export const developerRouter = Router();
developerRouter.use(requireAuth);

developerRouter.get("/me", asyncHandler(async (req, res) => {
  const developer = await apiDev.getMyDeveloper(req.user!.id);
  const usage = developer ? await apiDev.myUsage(req.user!.id) : null;
  const settings = await apiDev.getApiSettings();
  res.json(ok({
    developer,
    scopes: ["services:read", "orders:create", "orders:read", "orders:cancel", "balance:read"],
    settings: {
      enabled: settings.enabled,
      defaultRateLimit: settings.defaultRateLimit,
      resellerRateLimit: settings.resellerRateLimit,
      premiumRateLimit: settings.premiumRateLimit,
      maxKeysPerDeveloper: settings.maxKeysPerDeveloper,
      maxWebhooksPerDeveloper: settings.maxWebhooksPerDeveloper,
    },
    usage,
  }));
}));

developerRouter.post("/apply", validate(apiApplySchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await apiDev.applyForApi(req.user!, req.body), "Application submitted"));
}));

developerRouter.patch("/settings", validate(apiDeveloperSettingsSchema), asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.updateMyDeveloperSettings(req.user!, req.body), "Settings saved"));
}));

developerRouter.get("/keys", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listMyKeys(req.user!.id)));
}));

developerRouter.post("/keys", validate(apiKeyCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await apiDev.createApiKey(req.user!, req.body), "API key created"));
}));

developerRouter.patch("/keys/:id", validate(apiKeyUpdateSchema), asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.updateApiKey(req.user!, req.params.id, req.body)));
}));

developerRouter.post("/keys/:id/revoke", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.revokeApiKey(req.user!, req.params.id), "API key revoked"));
}));

developerRouter.post("/keys/:id/regenerate", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.regenerateApiKey(req.user!, req.params.id), "API key regenerated"));
}));

developerRouter.get("/webhooks", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listMyWebhooks(req.user!.id)));
}));

developerRouter.post("/webhooks", validate(apiWebhookSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await apiDev.createWebhook(req.user!, req.body), "Webhook created"));
}));

developerRouter.patch("/webhooks/:id", validate(apiWebhookSchema.partial()), asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.updateWebhook(req.user!, req.params.id, req.body)));
}));

developerRouter.delete("/webhooks/:id", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.deleteWebhook(req.user!, req.params.id)));
}));

developerRouter.post("/webhooks/:id/rotate-secret", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.rotateWebhookSecret(req.user!, req.params.id), "Webhook secret rotated"));
}));

developerRouter.get("/webhooks/:id/deliveries", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listWebhookDeliveries(
    req.user!.id,
    req.params.id,
    Number(req.query.page || 1),
    Number(req.query.limit || 20)
  )));
}));

developerRouter.get("/logs", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listMyLogs(req.user!.id, {
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    status: req.query.status as string | undefined,
  })));
}));

developerRouter.get("/usage", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.myUsage(req.user!.id)));
}));

developerRouter.get("/services", asyncHandler(async (req, res) => {
  const result = await catalog.listProducts({
    apiAvailable: "yes",
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50),
    search: req.query.search as string | undefined,
    platformId: req.query.platformId as string | undefined,
    categoryId: req.query.categoryId as string | undefined,
  });
  res.json(ok({
    ...result,
    items: result.items.map(catalog.toApiService),
  }));
}));

developerRouter.get("/orders", asyncHandler(async (req, res) => {
  res.json(ok(await orders.listOrders({
    user: req.user!,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    source: "api",
  })));
}));

developerRouter.get("/wallet", asyncHandler(async (req, res) => {
  res.json(ok(await wallet.getWallet(req.user!.id)));
}));
