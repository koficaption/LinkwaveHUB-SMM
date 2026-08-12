import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AppError, ok } from "../errors.js";
import { asyncHandler, validate } from "../middleware/errorHandler.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import * as auth from "../services/authService.js";
import * as catalog from "../services/catalogService.js";
import * as orders from "../services/orderService.js";
import * as wallet from "../services/walletService.js";
import * as users from "../services/userService.js";
import * as resellers from "../services/resellerService.js";
import * as support from "../services/supportService.js";
import * as settings from "../services/settingsService.js";
import * as analytics from "../services/analyticsService.js";
import * as providers from "../services/providerService.js";
import * as notifications from "../services/notificationService.js";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  profileSchema,
  platformSchema,
  categorySchema,
  productSchema,
  orderSchema,
  walletDepositSchema,
  ticketSchema,
  ticketReplySchema,
  userCreateSchema,
  userUpdateSchema,
  providerSchema,
  storefrontSchema,
  resellerPriceSchema,
  paymentMethodSchema,
  adminBroadcastSchema,
} from "../validators.js";
import * as googleAuth from "../services/googleAuth.js";
import * as affiliates from "../services/affiliateService.js";
import * as catalogImport from "../services/catalogImportService.js";
import { config } from "../config.js";
import { clientIp } from "../utils.js";

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

function setAuthCookie(res: import("express").Response, token: string, req?: import("express").Request) {
  const forwardedProto = typeof req?.headers["x-forwarded-proto"] === "string" ? req.headers["x-forwarded-proto"] : "";
  const secure = config.isProd || req?.secure || forwardedProto.includes("https");
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export const router = Router();

router.get("/health", (_req, res) => res.json(ok({ status: "ok", service: "LinkWaveHub API" })));
router.get("/settings/public", asyncHandler(async (_req, res) => {
  res.json(ok(await settings.getPublicSettings()));
}));

router.get("/platforms", optionalAuth, asyncHandler(async (req, res) => {
  const admin = req.user?.role === "admin";
  res.json(ok(await catalog.listPlatforms({ includeInactive: admin && req.query.all === "1" })));
}));
router.get("/platforms/:id", asyncHandler(async (req, res) => {
  res.json(ok(await catalog.getPlatform(req.params.id)));
}));
router.get("/categories", optionalAuth, asyncHandler(async (req, res) => {
  res.json(ok(await catalog.listCategories({
    includeInactive: req.user?.role === "admin" && req.query.all === "1",
    platformId: req.query.platformId as string | undefined,
  })));
}));
router.get("/products", optionalAuth, asyncHandler(async (req, res) => {
  const admin = req.user?.role === "admin";
  res.json(ok(await catalog.listProducts({
    platformId: req.query.platformId as string | undefined,
    categoryId: req.query.categoryId as string | undefined,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    sort: req.query.sort as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50),
    includeInactive: admin && req.query.all === "1",
    resellerPrice: req.user?.role === "reseller",
  })));
}));
router.get("/products/:id", optionalAuth, asyncHandler(async (req, res) => {
  res.json(ok(await catalog.getProduct(req.params.id, {
    admin: req.user?.role === "admin",
    reseller: req.user?.role === "reseller",
  })));
}));
router.get("/store/:slug", asyncHandler(async (req, res) => {
  res.json(ok(await resellers.getPublicStorefront(req.params.slug)));
}));

router.post("/auth/register", authLimit, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await auth.registerUser({ ...req.body, ip: clientIp(req) });
  setAuthCookie(res, result.token, req);
  res.status(201).json(ok(result, "Account created successfully"));
}));
router.post("/auth/login", authLimit, validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await auth.loginUser(req.body.email, req.body.password, clientIp(req), req.get("user-agent") || undefined);
  setAuthCookie(res, result.token, req);
  res.json(ok(result, "Logged in successfully"));
}));
router.get("/auth/google/config", (_req, res) => {
  res.json(ok({
    enabled: googleAuth.googleEnabled(),
    clientId: config.googleClientId || null,
    redirectEnabled: Boolean(config.googleClientId && config.googleClientSecret),
  }));
});
router.get("/auth/google/start", authLimit, (req, res) => {
  if (!googleAuth.googleEnabled() || !config.googleClientSecret) {
    return res.redirect(`${config.frontendUrl}/login?google=unconfigured`);
  }
  const state = googleAuth.createGoogleState();
  res.redirect(googleAuth.googleRedirectUrl(state));
});
router.get("/auth/google/callback", asyncHandler(async (req, res) => {
  const error = typeof req.query.error === "string" ? req.query.error : "";
  if (error) {
    return res.redirect(`${config.frontendUrl}/login?google=denied`);
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    return res.redirect(`${config.frontendUrl}/login?google=failed`);
  }
  try {
    googleAuth.verifyGoogleState(state);
    const result = await googleAuth.loginWithGoogleCode(code);
    setAuthCookie(res, result.token, req);
    return res.redirect(`${config.frontendUrl}/auth/callback?token=${encodeURIComponent(result.token)}`);
  } catch {
    return res.redirect(`${config.frontendUrl}/login?google=failed`);
  }
}));
router.post("/auth/google", authLimit, asyncHandler(async (req, res) => {
  const body = z.object({
    credential: z.string().optional(),
    code: z.string().optional(),
    accessToken: z.string().optional(),
    referralCode: z.string().max(40).optional(),
  }).parse(req.body);
  const result = body.accessToken
    ? await googleAuth.loginWithGoogleAccessToken(body.accessToken)
    : body.credential
      ? await googleAuth.loginWithGoogleIdToken(body.credential)
      : body.code
        ? await googleAuth.loginWithGoogleCode(body.code, "postmessage")
        : (() => { throw new AppError("Google credential is required", 400); })();
  if (body.referralCode) {
    await affiliates.attachReferrer(result.user.id, body.referralCode);
  }
  setAuthCookie(res, result.token, req);
  res.json(ok(result, "Logged in with Google"));
}));
router.post("/auth/logout", (req, res) => {
  res.clearCookie(config.cookieName, { path: "/" });
  res.json(ok(null, "Logged out"));
});
router.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await auth.getMe(req.user!.id)));
}));
router.patch("/auth/profile", requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  res.json(ok(await auth.updateProfile(req.user!.id, req.body), "Profile updated"));
}));
router.post("/auth/password", requireAuth, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  await auth.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  res.json(ok(null, "Password changed"));
}));
router.get("/affiliates/me", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await affiliates.getMyAffiliate(req.user!.id)));
}));
router.get("/affiliates/public", asyncHandler(async (_req, res) => {
  res.json(ok(await affiliates.affiliateConfig()));
}));

router.get("/orders", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await orders.listOrders({
    user: req.user,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  })));
}));
router.get("/orders/:id", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await orders.getOrder(req.params.id, req.user!)));
}));
router.post("/orders/quote", optionalAuth, validate(orderSchema), asyncHandler(async (req, res) => {
  res.json(ok(await orders.quoteOrder(req.body.productId, req.body.quantity, req.user, req.body.storeSlug)));
}));
router.post("/orders", requireAuth, validate(orderSchema), asyncHandler(async (req, res) => {
  const order = await orders.placeOrder({
    user: req.user!,
    productId: req.body.productId,
    quantity: req.body.quantity,
    target: req.body.target,
    storeSlug: req.body.storeSlug,
  });
  res.status(201).json(ok(order, "Order placed successfully"));
}));

router.get("/wallet", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await wallet.getWallet(req.user!.id)));
}));
router.get("/wallet/transactions", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await wallet.listTransactions(req.user!.id, Number(req.query.page || 1), Number(req.query.limit || 20))));
}));
router.get("/payments/methods", asyncHandler(async (_req, res) => {
  res.json(ok(await wallet.listPaymentMethods(false)));
}));
router.post("/payments/deposit", requireAuth, validate(walletDepositSchema), asyncHandler(async (req, res) => {
  res.json(ok(await wallet.initiateDeposit(req.user!, req.body.amount, req.body.methodCode), "Deposit initiated"));
}));

router.get("/support", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await support.listTickets(req.user!, req.query.status as string | undefined)));
}));
router.post("/support", requireAuth, validate(ticketSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await support.createTicket(req.user!, req.body), "Ticket created"));
}));
router.get("/support/:id", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await support.getTicket(req.params.id, req.user!)));
}));
router.post("/support/:id/reply", requireAuth, validate(ticketReplySchema), asyncHandler(async (req, res) => {
  res.json(ok(await support.replyTicket(req.params.id, req.user!, req.body.message)));
}));

router.get("/notifications", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await notifications.listNotifications(req.user!.id)));
}));
router.post("/notifications/:id/read", requireAuth, asyncHandler(async (req, res) => {
  await notifications.markRead(req.params.id, req.user!.id);
  res.json(ok(null));
}));
router.post("/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  await notifications.markAllRead(req.user!.id);
  res.json(ok(null));
}));

router.get("/reseller/me", requireAuth, requireRole("reseller", "admin"), asyncHandler(async (req, res) => {
  res.json(ok(await resellers.resellerStats(req.user!.id)));
}));
router.patch("/reseller/storefront", requireAuth, requireRole("reseller", "admin"), validate(storefrontSchema), asyncHandler(async (req, res) => {
  res.json(ok(await resellers.updateStorefront(req.user!.id, req.body), "Storefront updated"));
}));
router.put("/reseller/prices", requireAuth, requireRole("reseller", "admin"), validate(resellerPriceSchema), asyncHandler(async (req, res) => {
  res.json(ok(await resellers.setResellerProductPrice(req.user!.id, req.body.productId, req.body.sellingPrice, req.body.isEnabled)));
}));
router.get("/reseller/orders", requireAuth, requireRole("reseller", "admin"), asyncHandler(async (req, res) => {
  res.json(ok(await orders.listOrders({
    user: req.user,
    resellerOnly: true,
    status: req.query.status as string | undefined,
    page: Number(req.query.page || 1),
  })));
}));

const admin = Router();
admin.use(requireAuth, requireRole("admin"));

admin.get("/overview", asyncHandler(async (_req, res) => res.json(ok(await analytics.adminOverview()))));
admin.get("/analytics/revenue", asyncHandler(async (req, res) => {
  const range = (req.query.range as "today" | "7d" | "30d" | "12m") || "7d";
  res.json(ok(await analytics.revenueChart(range)));
}));
admin.get("/analytics/orders", asyncHandler(async (_req, res) => res.json(ok(await analytics.ordersByStatus()))));
admin.get("/analytics/platforms", asyncHandler(async (_req, res) => res.json(ok(await analytics.salesByPlatform()))));
admin.get("/analytics/products", asyncHandler(async (_req, res) => res.json(ok(await analytics.productPerformance()))));
admin.get("/audit", asyncHandler(async (req, res) => {
  res.json(ok(await analytics.listAuditLogs(Number(req.query.page || 1), Number(req.query.limit || 40))));
}));

admin.post("/platforms", validate(platformSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await catalog.createPlatform(req.body, req.user!, clientIp(req)), "Platform created"));
}));
admin.patch("/platforms/:id", validate(platformSchema.partial()), asyncHandler(async (req, res) => {
  res.json(ok(await catalog.updatePlatform(req.params.id, req.body, req.user!, clientIp(req)), "Platform updated"));
}));
admin.delete("/platforms/:id", asyncHandler(async (req, res) => {
  await catalog.deletePlatform(req.params.id, req.user!, clientIp(req));
  res.json(ok(null, "Platform deleted"));
}));

admin.post("/categories", validate(categorySchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await catalog.createCategory(req.body, req.user!, clientIp(req)), "Category created"));
}));
admin.patch("/categories/:id", validate(categorySchema.partial()), asyncHandler(async (req, res) => {
  res.json(ok(await catalog.updateCategory(req.params.id, req.body, req.user!, clientIp(req)), "Category updated"));
}));
admin.delete("/categories/:id", asyncHandler(async (req, res) => {
  await catalog.deleteCategory(req.params.id, req.user!, clientIp(req));
  res.json(ok(null, "Category deleted"));
}));

admin.get("/products", asyncHandler(async (req, res) => {
  res.json(ok(await catalog.listProducts({
    platformId: req.query.platformId as string | undefined,
    categoryId: req.query.categoryId as string | undefined,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    sort: req.query.sort as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50),
    includeInactive: true,
  })));
}));
admin.post("/products", validate(productSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await catalog.createProduct(req.body, req.user!, clientIp(req)), "Product created successfully"));
}));
admin.patch("/products/:id", validate(productSchema.partial()), asyncHandler(async (req, res) => {
  res.json(ok(await catalog.updateProduct(req.params.id, req.body, req.user!, clientIp(req)), "Product updated"));
}));
admin.delete("/products/:id", asyncHandler(async (req, res) => {
  res.json(ok(await catalog.deleteProduct(req.params.id, req.user!, clientIp(req))));
}));
admin.post("/products/:id/duplicate", asyncHandler(async (req, res) => {
  res.json(ok(await catalog.duplicateProduct(req.params.id, req.user!, clientIp(req)), "Product duplicated"));
}));
admin.post("/products/bulk-status", asyncHandler(async (req, res) => {
  const body = z.object({ ids: z.array(z.string().uuid()).min(1), status: z.enum(["active", "inactive"]) }).parse(req.body);
  await catalog.bulkProductStatus(body.ids, body.status, req.user!, clientIp(req));
  res.json(ok(null, "Products updated"));
}));

admin.get("/orders", asyncHandler(async (req, res) => {
  res.json(ok(await orders.listOrders({
    user: req.user,
    status: req.query.status as string | undefined,
    platformId: req.query.platformId as string | undefined,
    search: req.query.search as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  })));
}));
admin.patch("/orders/:id/status", asyncHandler(async (req, res) => {
  const body = z.object({ status: z.string(), note: z.string().optional() }).parse(req.body);
  res.json(ok(await orders.updateOrderStatus({ id: req.params.id, status: body.status, note: body.note, actor: req.user!, ip: clientIp(req) })));
}));
admin.post("/orders/:id/refund", asyncHandler(async (req, res) => {
  res.json(ok(await orders.refundOrder(req.params.id, req.user!, req.body?.note, clientIp(req)), "Order refunded"));
}));
admin.post("/orders/:id/retry", asyncHandler(async (req, res) => {
  res.json(ok(await orders.retryOrder(req.params.id, req.user!, clientIp(req)), "Order submitted to provider"));
}));

admin.get("/users", asyncHandler(async (req, res) => {
  res.json(ok(await users.listUsers({
    search: req.query.search as string | undefined,
    role: req.query.role as string | undefined,
    status: req.query.status as string | undefined,
    page: Number(req.query.page || 1),
  })));
}));
admin.post("/users", validate(userCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await users.createUser(req.body, req.user!, clientIp(req)), "User created"));
}));
admin.get("/users/:id", asyncHandler(async (req, res) => {
  res.json(ok(await users.getUserDetail(req.params.id)));
}));
admin.patch("/users/:id", validate(userUpdateSchema), asyncHandler(async (req, res) => {
  res.json(ok(await users.updateUser(req.params.id, req.body, req.user!, clientIp(req))));
}));
admin.delete("/users/:id", asyncHandler(async (req, res) => {
  res.json(ok(await users.deleteUser(req.params.id, req.user!, clientIp(req))));
}));
admin.post("/users/:id/reset-password", asyncHandler(async (req, res) => {
  const body = z.object({ password: z.string().min(8) }).parse(req.body);
  await users.resetPassword(req.params.id, body.password, req.user!, clientIp(req));
  res.json(ok(null, "Password reset"));
}));
admin.post("/users/:id/wallet", asyncHandler(async (req, res) => {
  const body = z.object({ amount: z.number(), reason: z.string().min(2) }).parse(req.body);
  res.json(ok(await wallet.adminAdjustWallet(req.params.id, body.amount, body.reason, req.user!, clientIp(req))));
}));

admin.get("/resellers", asyncHandler(async (req, res) => {
  res.json(ok(await resellers.listResellers(req.query.status as string | undefined)));
}));
admin.get("/resellers/:id", asyncHandler(async (req, res) => {
  res.json(ok(await resellers.getReseller(req.params.id)));
}));
admin.post("/resellers/:id/status", asyncHandler(async (req, res) => {
  const body = z.object({ status: z.string() }).parse(req.body);
  res.json(ok(await resellers.setResellerStatus(req.params.id, body.status, req.user!, clientIp(req))));
}));

admin.get("/providers", asyncHandler(async (_req, res) => res.json(ok(await providers.listProviders()))));
admin.post("/providers", validate(providerSchema), asyncHandler(async (req, res) => {
  req.setTimeout(180000);
  const created = await providers.createProvider(req.body, req.user!, clientIp(req));
  let imported = null;
  if (catalogImport.shouldImportPackages(req.body, created.adapter as string)) {
    imported = await catalogImport.importProviderPackages(String(created.id), req.user!, clientIp(req));
  }
  res.status(201).json(ok({ ...created, imported }, imported ? `Provider created and ${imported.upserted} packages imported` : "Provider created"));
}));
admin.patch("/providers/:id", validate(providerSchema.partial()), asyncHandler(async (req, res) => {
  req.setTimeout(180000);
  const updated = await providers.updateProvider(req.params.id, req.body, req.user!, clientIp(req));
  let imported = null;
  if (catalogImport.shouldImportPackages(req.body, updated.adapter as string)) {
    imported = await catalogImport.importProviderPackages(String(updated.id), req.user!, clientIp(req));
  }
  res.json(ok({ ...updated, imported }, imported ? `Provider saved and ${imported.upserted} packages imported` : "Provider saved"));
}));
admin.delete("/providers/:id", asyncHandler(async (req, res) => {
  await providers.deleteProvider(req.params.id, req.user!, clientIp(req));
  res.json(ok(null, "Provider deleted"));
}));
admin.post("/providers/:id/balance", asyncHandler(async (req, res) => {
  res.json(ok(await providers.refreshProviderBalance(req.params.id)));
}));
admin.get("/providers/:id/services", asyncHandler(async (req, res) => {
  res.json(ok(await providers.listProviderServices(req.params.id)));
}));
admin.post("/providers/:id/import", asyncHandler(async (req, res) => {
  req.setTimeout(180000);
  const imported = await catalogImport.importProviderPackages(req.params.id, req.user!, clientIp(req));
  res.json(ok(imported, `${imported.upserted} packages imported from the provider`));
}));

admin.get("/payments", asyncHandler(async (req, res) => {
  res.json(ok(await wallet.listPayments({
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    page: Number(req.query.page || 1),
  })));
}));
admin.get("/payments/methods", asyncHandler(async (_req, res) => res.json(ok(await wallet.listPaymentMethods(true)))));
admin.post("/payments/methods", validate(paymentMethodSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await wallet.createPaymentMethod(req.body, req.user!, clientIp(req)), "Payment method created"));
}));
admin.patch("/payments/methods/:id", validate(paymentMethodSchema.partial()), asyncHandler(async (req, res) => {
  res.json(ok(await wallet.updatePaymentMethod(req.params.id, req.body, req.user!, clientIp(req)), "Payment method saved"));
}));
admin.post("/payments/:reference/confirm", asyncHandler(async (req, res) => {
  res.json(ok(await wallet.confirmPayment(req.params.reference, req.user!, clientIp(req)), "Payment confirmed"));
}));
admin.post("/payments/:reference/reject", asyncHandler(async (req, res) => {
  res.json(ok(await wallet.rejectPayment(req.params.reference, req.user!, clientIp(req))));
}));
admin.get("/wallets", asyncHandler(async (req, res) => {
  res.json(ok(await wallet.listAllWallets(req.query.search as string | undefined)));
}));

admin.get("/support", asyncHandler(async (req, res) => {
  res.json(ok(await support.listTickets(req.user!, req.query.status as string | undefined)));
}));
admin.patch("/support/:id", asyncHandler(async (req, res) => {
  res.json(ok(await support.updateTicket(req.params.id, req.body, req.user!)));
}));

admin.get("/affiliates", asyncHandler(async (_req, res) => {
  res.json(ok(await affiliates.listAffiliatesAdmin()));
}));

admin.get("/notifications/counts", asyncHandler(async (_req, res) => {
  res.json(ok(await notifications.audienceCounts()));
}));
admin.get("/notifications", asyncHandler(async (_req, res) => {
  res.json(ok(await notifications.listBroadcasts()));
}));
admin.post("/notifications", validate(adminBroadcastSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await notifications.broadcastNotification({
    title: req.body.title,
    body: req.body.body,
    audience: req.body.audience,
    userId: req.body.userId,
    actor: req.user!,
    ip: clientIp(req),
  }), "Notification sent"));
}));

admin.get("/settings", asyncHandler(async (_req, res) => res.json(ok(await settings.getSettings()))));
admin.put("/settings/:key", asyncHandler(async (req, res) => {
  res.json(ok(await settings.updateSettings(req.params.key, req.body.value ?? req.body, req.user!, clientIp(req)), "Settings saved"));
}));

router.use("/admin", admin);
