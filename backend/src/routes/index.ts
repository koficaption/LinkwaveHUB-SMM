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
import * as refills from "../services/refillService.js";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
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
  resellerUpgradeSchema,
  paymentVerifySchema,
  dashboardResetSchema,
  apiAdminDeveloperPatchSchema,
} from "../validators.js";
import * as googleAuth from "../services/googleAuth.js";
import * as affiliates from "../services/affiliateService.js";
import * as catalogImport from "../services/catalogImportService.js";
import { config } from "../config.js";
import { clientIp, googleAppOrigin, googleCallbackUri, publicAppOrigin } from "../utils.js";
import { sendMail } from "../mailer.js";
import { developerRouter } from "./developer.js";
import * as apiDev from "../services/apiDeveloperService.js";
import * as platformReset from "../services/platformResetService.js";

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const forgotLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });

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

router.use("/developer", developerRouter);

router.get("/health", (_req, res) => res.json(ok({ status: "ok", service: "LinkBoost Growth API" })));
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
    refill: req.query.refill as string | undefined,
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
router.post("/auth/forgot-password", forgotLimit, validate(forgotPasswordSchema), asyncHandler(async (req, res) => {
  const result = await auth.requestPasswordReset({
    email: req.body.email,
    origin: publicAppOrigin(req.get("origin")),
    ip: clientIp(req),
  });
  res.json(ok(result, result.message));
}));
router.post("/auth/reset-password", authLimit, validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  await auth.resetPasswordWithToken(req.body.token, req.body.password);
  res.json(ok(null, "Password updated. You can sign in now."));
}));
router.get("/auth/google/config", (req, res) => {
  const origin = googleAppOrigin(req);
  res.json(ok({
    enabled: googleAuth.googleEnabled(),
    clientId: config.googleClientId || null,
    redirectEnabled: Boolean(config.googleClientId && config.googleClientSecret),
    origin,
    redirectUri: googleCallbackUri(req),
  }));
});
router.get("/auth/google/start", authLimit, (req, res) => {
  const origin = googleAppOrigin(req);
  if (!googleAuth.googleEnabled() || !config.googleClientSecret) {
    return res.redirect(`${origin}/login?google=unconfigured`);
  }
  const redirectUri = googleCallbackUri(req);
  const queryRef = typeof req.query.ref === "string" ? req.query.ref.trim() : "";
  const cookieRef = typeof req.cookies?.lwh_ref === "string" ? String(req.cookies.lwh_ref).trim() : "";
  const state = googleAuth.createGoogleState(redirectUri, queryRef || cookieRef);
  res.redirect(googleAuth.googleRedirectUrl(state, redirectUri));
});
router.get("/auth/google/callback", asyncHandler(async (req, res) => {
  const origin = googleAppOrigin(req);
  const error = typeof req.query.error === "string" ? req.query.error : "";
  if (error) {
    return res.redirect(`${origin}/login?google=denied`);
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    return res.redirect(`${origin}/login?google=failed`);
  }
  try {
    const googleState = googleAuth.verifyGoogleState(state);
    const result = await googleAuth.loginWithGoogleCode(code, googleState.redirectUri, googleState.referralCode);
    setAuthCookie(res, result.token, req);
    return res.redirect(`${origin}/auth/callback?token=${encodeURIComponent(result.token)}`);
  } catch {
    return res.redirect(`${origin}/login?google=failed`);
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
    ? await googleAuth.loginWithGoogleAccessToken(body.accessToken, body.referralCode)
    : body.credential
      ? await googleAuth.loginWithGoogleIdToken(body.credential, body.referralCode)
      : body.code
        ? await googleAuth.loginWithGoogleCode(body.code, "postmessage", body.referralCode)
        : (() => { throw new AppError("Google credential is required", 400); })();
  if (body.referralCode) {
    await affiliates.attachReferrer(result.user.id, body.referralCode);
    await affiliates.settleMissedCommissionsForDepositor(result.user.id);
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
router.post("/affiliates/claim", requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ referralCode: z.string().min(1).max(40) }).parse(req.body);
  const attached = await affiliates.attachReferrer(req.user!.id, body.referralCode);
  if (attached) await affiliates.settleMissedCommissionsForDepositor(req.user!.id);
  res.json(ok({ attached: Boolean(attached) }));
}));
router.get("/affiliates/public", asyncHandler(async (_req, res) => {
  res.json(ok(await affiliates.affiliateConfig()));
}));

router.get("/account/reseller-upgrade", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await resellers.getUpgradeOffer(req.user!)));
}));
router.post("/account/reseller-upgrade", requireAuth, validate(resellerUpgradeSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await resellers.applyForResellerUpgrade(req.user!, req.body), "Application submitted"));
}));

router.get("/orders", requireAuth, asyncHandler(async (req, res) => {
  res.json(ok(await orders.listOrders({
    user: req.user,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    refill: req.query.refill as string | undefined,
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
router.post("/orders/:id/refill", requireAuth, asyncHandler(async (req, res) => {
  res.status(201).json(ok(await refills.requestRefill(req.params.id, req.user!, clientIp(req)), "Refill requested"));
}));
router.get("/orders/:id/refills", requireAuth, asyncHandler(async (req, res) => {
  const order = await orders.getOrder(req.params.id, req.user!);
  res.json(ok({ order, items: await refills.listOrderRefills(req.params.id) }));
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
  res.json(ok(await wallet.initiateDeposit(req.user!, req.body.amount, req.body.methodCode, req.body.returnUrl), "Deposit initiated"));
}));
router.post("/payments/verify", requireAuth, validate(paymentVerifySchema), asyncHandler(async (req, res) => {
  res.json(ok(await wallet.completeVerifiedPayment(req.body.reference, { userId: req.user!.id }), "Payment verified"));
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
const resetLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false });
admin.post("/reset-dashboard", resetLimit, validate(dashboardResetSchema), asyncHandler(async (req, res) => {
  const result = await platformReset.resetDashboard({
    confirm: req.body.confirm,
    actor: req.user!,
    ip: clientIp(req),
    userAgent: req.get("user-agent") || undefined,
  });
  res.json(ok(result, "Dashboard reset. Customers, orders, and profit are now zero."));
}));
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
    refill: req.query.refill as string | undefined,
    providerId: req.query.providerId as string | undefined,
    apiAvailable: req.query.apiAvailable as string | undefined,
    resellerAvailable: req.query.resellerAvailable as string | undefined,
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
    providerId: req.query.providerId as string | undefined,
    refill: req.query.refill as string | undefined,
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
admin.post("/orders/:id/sync", asyncHandler(async (req, res) => {
  res.json(ok(await orders.refreshOrderFromProvider(req.params.id, req.user!), "Status refreshed from provider"));
}));
admin.post("/orders/:id/refill", asyncHandler(async (req, res) => {
  res.status(201).json(ok(await refills.requestRefill(req.params.id, req.user!, clientIp(req), req.body?.note), "Refill requested"));
}));
admin.post("/orders/bulk-refill", asyncHandler(async (req, res) => {
  const body = z.object({ ids: z.array(z.string()).min(1).max(100) }).parse(req.body);
  const results: { id: string; ok: boolean; message?: string }[] = [];
  for (const id of body.ids) {
    try {
      await refills.requestRefill(id, req.user!, clientIp(req));
      results.push({ id, ok: true });
    } catch (error) {
      results.push({ id, ok: false, message: error instanceof Error ? error.message : "Not eligible" });
    }
  }
  res.json(ok({
    eligible: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  }));
}));
admin.get("/refills/overview", asyncHandler(async (_req, res) => {
  res.json(ok(await refills.refillOverview()));
}));
admin.get("/refills", asyncHandler(async (req, res) => {
  res.json(ok(await refills.listRefills({
    user: req.user,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    providerId: req.query.providerId as string | undefined,
    platformId: req.query.platformId as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  })));
}));
admin.post("/refills/:id/retry", asyncHandler(async (req, res) => {
  res.json(ok(await refills.retryRefill(req.params.id, req.user!, clientIp(req)), "Refill retried"));
}));
admin.post("/refills/:id/note", asyncHandler(async (req, res) => {
  const body = z.object({ note: z.string().min(1).max(2000) }).parse(req.body);
  res.json(ok(await refills.addRefillNote(req.params.id, body.note, req.user!, clientIp(req))));
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
admin.get("/reseller-applications", asyncHandler(async (req, res) => {
  res.json(ok(await resellers.listResellerApplications(req.query.status as string | undefined)));
}));
admin.post("/reseller-applications/:id/approve", asyncHandler(async (req, res) => {
  res.json(ok(await resellers.approveResellerApplication(req.params.id, req.user!, clientIp(req)), "Customer promoted to reseller"));
}));
admin.post("/reseller-applications/:id/reject", asyncHandler(async (req, res) => {
  const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
  res.json(ok(await resellers.rejectResellerApplication(req.params.id, req.user!, clientIp(req), body.reason), "Application rejected"));
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
  req.setTimeout(300000);
  const created = await providers.createProvider(req.body, req.user!, clientIp(req));
  let imported = null;
  if (catalogImport.shouldImportPackages(req.body, created.adapter as string)) {
    imported = await catalogImport.importProviderPackages(String(created.id), req.user!, clientIp(req));
  }
  res.status(201).json(ok({ ...created, imported }, imported ? `Provider created and ${imported.upserted} packages imported` : "Provider created"));
}));
admin.patch("/providers/:id", validate(providerSchema.partial()), asyncHandler(async (req, res) => {
  req.setTimeout(300000);
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
  req.setTimeout(300000);
  const markupPercent = req.body?.markupPercent != null ? Number(req.body.markupPercent) : undefined;
  const imported = await catalogImport.importProviderPackages(req.params.id, req.user!, clientIp(req), {
    markupPercent: Number.isFinite(markupPercent) ? markupPercent : undefined,
  });
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

admin.get("/settings", asyncHandler(async (_req, res) => res.json(ok(await settings.getAdminSettings()))));
admin.put("/settings/:key", asyncHandler(async (req, res) => {
  res.json(ok(await settings.updateSettings(req.params.key, req.body.value ?? req.body, req.user!, clientIp(req)), "Settings saved"));
}));
admin.post("/settings/mail/test", asyncHandler(async (req, res) => {
  const to = typeof req.body?.to === "string" && req.body.to.includes("@") ? req.body.to : req.user!.email;
  const siteName = String(((await settings.getSettings()).general as Record<string, unknown>).siteName || "LinkBoost Growth SMM");
  const result = await sendMail({
    to,
    subject: `${siteName} test email`,
    text: `This is a test email from ${siteName}. If you received it, password-reset mail is working.`,
    html: `<p>This is a test email from ${siteName}. If you received it, password-reset mail is working.</p>`,
  });
  if (!result.sent) throw new AppError("Email is not connected yet. Save SMTP details first (Gmail: smtp.gmail.com, port 587, your Gmail and an App Password).", 400);
  res.json(ok({ to }, "Test email sent"));
}));

admin.get("/api/overview", asyncHandler(async (_req, res) => {
  res.json(ok(await apiDev.adminApiOverview()));
}));
admin.get("/api/developers", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listDevelopersAdmin({
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  })));
}));
admin.post("/api/developers/:id/approve", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.setDeveloperStatus(req.params.id, "approved", req.user!, clientIp(req)), "Developer approved"));
}));
admin.post("/api/developers/:id/reject", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.setDeveloperStatus(req.params.id, "rejected", req.user!, clientIp(req)), "Application rejected"));
}));
admin.post("/api/developers/:id/suspend", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.setDeveloperStatus(req.params.id, "suspended", req.user!, clientIp(req)), "API access suspended"));
}));
admin.post("/api/developers/:id/activate", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.setDeveloperStatus(req.params.id, "approved_reactivate", req.user!, clientIp(req)), "API access activated"));
}));
admin.patch("/api/developers/:id", validate(apiAdminDeveloperPatchSchema), asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.patchDeveloperAdmin(req.params.id, req.body, req.user!, clientIp(req))));
}));
admin.get("/api/keys", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listKeysAdmin({
    search: req.query.search as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  })));
}));
admin.post("/api/keys/:id/revoke", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.revokeApiKey(req.user!, req.params.id, true), "API key revoked"));
}));
admin.get("/api/requests", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listRequestsAdmin({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50),
    developerId: req.query.developerId as string | undefined,
  })));
}));
admin.get("/api/orders", asyncHandler(async (req, res) => {
  res.json(ok(await orders.listOrders({
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    source: "api",
  })));
}));
admin.get("/api/usage", asyncHandler(async (_req, res) => {
  res.json(ok(await apiDev.adminApiOverview()));
}));
admin.get("/api/webhooks", asyncHandler(async (req, res) => {
  res.json(ok(await apiDev.listWebhooksAdmin({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  })));
}));
admin.get("/api/settings", asyncHandler(async (_req, res) => {
  res.json(ok(await apiDev.getApiSettings()));
}));
admin.put("/api/settings", asyncHandler(async (req, res) => {
  res.json(ok(await settings.updateSettings("api", req.body.value ?? req.body, req.user!, clientIp(req)), "API settings saved"));
}));

router.use("/admin", admin);
