import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  phone: z.string().max(30).optional(),
  whatsappNumber: z.string().max(30).optional(),
  asReseller: z.boolean().optional(),
  storeName: z.string().min(2).max(80).optional(),
  referralCode: z.string().max(40).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export const profileSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().max(30).optional().nullable(),
  whatsappNumber: z.string().max(30).optional().nullable(),
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

export const productSchema = z.object({
  platformId: z.string().uuid(),
  categoryId: z.string().uuid(),
  providerId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().nullable(),
  minQuantity: z.number().int().positive(),
  maxQuantity: z.number().int().positive(),
  pricePer1000: z.number().nonnegative(),
  costPer1000: z.number().nonnegative(),
  resellerPricePer1000: z.number().nonnegative().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
  deliveryType: z.enum(["instant", "gradual", "mixed"]).optional(),
  avgDeliveryTime: z.string().max(80).optional().nullable(),
  providerServiceId: z.string().max(80).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  features: z.array(z.string()).optional(),
});

export const orderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  target: z.string().min(3).max(500),
  storeSlug: z.string().max(80).optional(),
});

export const walletDepositSchema = z.object({
  amount: z.number().positive(),
  methodCode: z.string().min(2).max(40),
  returnUrl: z.string().url().max(500).optional(),
});

export const ticketSchema = z.object({
  subject: z.string().min(3).max(160),
  category: z.string().min(2).max(40),
  message: z.string().min(5).max(4000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
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
});

export const resellerPriceSchema = z.object({
  productId: z.string().uuid(),
  sellingPrice: z.number().nonnegative(),
  isEnabled: z.boolean().optional(),
});

export const adminBroadcastSchema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(4000),
  audience: z.enum(["customers", "resellers", "child_panels", "all", "user"]),
  userId: z.string().uuid().optional(),
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
});

export const paymentVerifySchema = z.object({
  reference: z.string().min(4).max(80),
});
