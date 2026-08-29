import { z } from "zod";

const blankToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const optionalText = (max: number, min = 1) =>
  z.preprocess(blankToUndefined, z.string().min(min).max(max).optional());

export const genderSchema = z.enum(["male", "female"]);
const optionalGender = z.preprocess(blankToUndefined, genderSchema.optional());

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  phone: optionalText(30),
  whatsappNumber: optionalText(30),
  gender: optionalGender,
  asReseller: z.boolean().optional(),
  storeName: optionalText(80, 2),
  referralCode: optionalText(40),
  storeSlug: optionalText(80, 2),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  storeSlug: optionalText(80, 2),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(72),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.preprocess(blankToUndefined, z.string().max(30).optional().nullable()),
  whatsappNumber: z.preprocess(blankToUndefined, z.string().max(30).optional().nullable()),
  gender: optionalGender,
});

export const platformSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(80).optional().nullable(),
  iconUrl: z.string().max(500).optional().nullable(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(80).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  platformIds: z.array(z.string().uuid()).optional(),
});

export const productServiceTypeSchema = z.enum([
  "api",
  "manual",
  "digital_product",
  "subscription",
  "account",
  "other",
]);

const blankToNull = (value: unknown) => {
  if (value === "" || value === undefined) return null;
  return value;
};

const optionalPositiveInt = (max = 1_000_000_000) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.trunc(n);
  }, z.number().int().positive().max(max).optional());

const optionalNonnegNumber = () =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }, z.number().nonnegative().nullable().optional());

const requiredNonnegNumber = () =>
  z.preprocess((value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }, z.number().nonnegative());

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().uuid().nullable().optional()
);

const optionalLongText = (max: number) =>
  z.preprocess(blankToNull, z.string().max(max).nullable().optional());

export const productSchema = z.object({
  platformId: z.string().uuid(),
  categoryId: z.string().uuid(),
  providerId: optionalUuid,
  name: z.string().min(2).max(200),
  description: optionalLongText(8000),
  minQuantity: optionalPositiveInt(),
  maxQuantity: optionalPositiveInt(),
  pricePer1000: requiredNonnegNumber(),
  costPer1000: requiredNonnegNumber().optional(),
  resellerPricePer1000: optionalNonnegNumber(),
  status: z.enum(["active", "inactive"]).optional(),
  deliveryType: z.preprocess((value) => {
    const code = String(value || "");
    if (code === "instant" || code === "gradual" || code === "mixed") return code;
    return value ? "gradual" : undefined;
  }, z.enum(["instant", "gradual", "mixed"]).optional()),
  avgDeliveryTime: optionalLongText(120),
  providerServiceId: optionalLongText(160),
  imageUrl: optionalLongText(4000),
  features: z.array(z.string()).optional(),
  refillSupported: z.boolean().optional(),
  refillDays: optionalPositiveInt(365),
  refillType: optionalLongText(80),
  refillServiceId: optionalLongText(160),
  refillInstructions: optionalLongText(4000),
  refillLimit: optionalPositiveInt(50),
  providerRefillSupported: z.boolean().optional(),
  resellerAvailable: z.boolean().optional(),
  apiAvailable: z.boolean().optional(),
  apiPricePer1000: optionalNonnegNumber(),
  apiMinQuantity: optionalPositiveInt(),
  apiMaxQuantity: optionalPositiveInt(),
  priceUnit: z.enum(["per_1000", "each"]).optional(),
  contactAdmin: z.boolean().optional(),
  serviceType: productServiceTypeSchema.optional(),
  stock: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.trunc(n);
  }, z.number().int().nonnegative().nullable().optional()),
  deliveryMethod: optionalLongText(80),
  orderInstructions: optionalLongText(4000),
});

export const productBulkSchema = z.object({
  platformId: z.string().uuid(),
  categoryId: z.string().uuid(),
  serviceType: productServiceTypeSchema.optional(),
  providerId: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    name: z.string().min(2).max(160),
    pricePer1000: z.number().nonnegative(),
    minQuantity: z.number().int().positive().optional(),
    maxQuantity: z.number().int().positive().optional(),
    refillSupported: z.boolean().optional(),
    refillDays: z.number().int().positive().max(365).optional(),
    description: z.string().max(2000).optional().nullable(),
    status: z.enum(["active", "inactive"]).optional(),
  })).min(1).max(50),
});

export const API_SCOPES = [
  "services:read",
  "orders:create",
  "orders:read",
  "orders:cancel",
  "balance:read",
] as const;

export const apiApplySchema = z.object({
  website: z.string().trim().min(2).max(300),
  websiteUrl: optionalText(300),
  name: optionalText(120),
  email: z.string().trim().email().optional(),
  companyName: optionalText(160),
  intendedUsage: optionalText(2000),
  expectedMonthlyRequests: z.number().int().positive().max(100_000_000).optional(),
});

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.enum(API_SCOPES)).optional(),
  allowedIps: z.array(z.string().trim().max(64)).max(50).optional(),
});

export const apiKeyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  permissions: z.array(z.enum(API_SCOPES)).optional(),
  allowedIps: z.array(z.string().trim().max(64)).max(50).optional(),
});

export const apiWebhookSchema = z.object({
  url: z.string().trim().url().max(500),
  description: optionalText(200),
  events: z.array(z.string().min(3).max(80)).min(1).optional(),
  isEnabled: z.boolean().optional(),
});

export const apiDeveloperSettingsSchema = z.object({
  allowedIps: z.array(z.string().trim().max(64)).max(50).optional(),
});

export const apiV1OrderSchema = z.object({
  service: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  quantity: z.coerce.number().int().positive(),
  target: z.string().min(3).max(500).optional(),
  link: z.string().min(3).max(500).optional(),
}).superRefine((value, ctx) => {
  if (!value.service && !value.service_id && !value.productId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "service is required", path: ["service"] });
  }
  if (!value.target && !value.link) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "target is required", path: ["target"] });
  }
});

export const apiAdminDeveloperPatchSchema = z.object({
  plan: z.enum(["free", "reseller", "premium"]).optional(),
  rateLimitPerMinute: z.number().int().positive().max(20000).optional(),
  adminNote: optionalText(2000),
  allowedIps: z.array(z.string().trim().max(64)).max(50).optional(),
});

export const orderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  target: z.string().min(3).max(500),
  storeSlug: z.string().max(80).optional(),
});

export const MIN_WALLET_DEPOSIT_GHS = 20;

export const walletDepositSchema = z.object({
  amount: z.number().min(MIN_WALLET_DEPOSIT_GHS, `Minimum deposit is GHS ${MIN_WALLET_DEPOSIT_GHS}`),
  methodCode: z.string().min(2).max(40),
  returnUrl: z.string().url().max(500).optional(),
  checkoutCurrency: z.string().trim().min(3).max(8).optional(),
});

export const ticketSchema = z.object({
  subject: z.string().min(3).max(160),
  category: z.string().min(2).max(40),
  message: z.string().min(5).max(4000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export const contactAdminSchema = z.object({
  quantity: z.number().int().positive(),
  details: z.string().min(3).max(1000),
});

export const ticketReplySchema = z.object({
  message: z.string().min(1).max(4000),
});

export const userCreateSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["customer", "reseller", "admin"]),
  phone: z.string().max(30).optional(),
});

export const userUpdateSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(["customer", "reseller", "admin"]).optional(),
  status: z.enum(["active", "suspended", "pending"]).optional(),
});

export const providerSchema = z.object({
  name: z.string().min(2).max(80),
  apiUrl: z.string().max(500).optional().nullable(),
  apiKey: z.string().max(500).optional().nullable(),
  adapter: z.string().max(40).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  isActive: z.boolean().optional(),
  currency: z.string().max(8).optional(),
  notes: z.string().max(1000).optional().nullable(),
  importPackages: z.boolean().optional(),
});

export const paymentMethodSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().max(40).optional(),
  description: z.string().max(500).optional().nullable(),
  adapter: z.enum(["manual", "mock", "paystack", "korapay"]).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  config: z.object({
    network: z.string().max(80).optional(),
    momoNumber: z.string().max(80).optional(),
    accountName: z.string().max(120).optional(),
    bankName: z.string().max(120).optional(),
    accountNumber: z.string().max(80).optional(),
    publicKey: z.string().max(200).optional(),
    instructions: z.string().max(2000).optional(),
  }).optional(),
});

export const storefrontSchema = z.object({
  storeName: z.string().min(2).max(80),
  tagline: z.string().max(160).optional().nullable(),
  brandColor: z.string().max(20).optional(),
  logoUrl: z.string().max(500).optional().nullable(),
  markupPercent: z.number().min(0).max(500).optional(),
  supportEmail: z.string().max(160).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  whatsappNumber: z.string().max(30).optional().nullable(),
});

export const resellerWithdrawSchema = z.object({
  amount: z.number().positive(),
  destination: z.enum(["momo", "wallet"]),
  momoNetwork: optionalText(40),
  momoNumber: optionalText(30),
  momoName: optionalText(80, 2),
});

export const resellerWithdrawalReviewSchema = z.object({
  status: z.enum(["paid", "rejected"]),
  adminNote: z.string().max(500).optional(),
});

export const resellerPriceSchema = z.object({
  productId: z.string().uuid(),
  sellingPrice: z.number().nonnegative(),
  isEnabled: z.boolean().optional(),
});

const optionalHttpUrl = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  return blankToUndefined(value);
}, z.string().max(500).url("Enter a valid channel link").optional());

export const adminBroadcastSchema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(4000),
  audience: z.enum(["customers", "resellers", "child_panels", "all", "user"]),
  userId: z.string().uuid().optional(),
  linkUrl: optionalHttpUrl,
  linkLabel: optionalText(80),
  popup: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.audience === "user" && !value.userId) {
    ctx.addIssue({ code: "custom", message: "Select a user to notify", path: ["userId"] });
  }
});

export const resellerUpgradeSchema = z.object({
  storeName: z.string().min(2).max(80),
  methodCode: z.string().min(1).max(40).optional(),
  senderName: z.string().max(120).optional(),
  senderNumber: z.string().max(30).optional(),
  returnUrl: z.string().url().max(500).optional(),
  checkoutCurrency: z.string().trim().min(3).max(8).optional(),
});

export const childPanelOrderSchema = z.object({
  domain: z.string().trim().min(3).max(253),
  panelCurrency: z.string().trim().min(3).max(8),
  adminUsername: z.string().trim().min(3).max(40),
  adminPassword: z.string().min(8).max(72),
  confirmPassword: z.string().min(8).max(72),
}).superRefine((value, ctx) => {
  if (value.adminPassword !== value.confirmPassword) {
    ctx.addIssue({ code: "custom", message: "Passwords do not match", path: ["confirmPassword"] });
  }
});

export const childPanelReviewSchema = z.object({
  status: z.enum(["processing", "active", "rejected", "cancelled"]),
  note: z.string().max(500).optional(),
});

export const paymentVerifySchema = z.object({
  reference: z.string().min(4).max(80),
});
