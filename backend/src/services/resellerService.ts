import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { makeSlug, uniqueSlug } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import type { AuthUser } from "../middleware/auth.js";

export async function listResellers(status?: string) {
  const params: unknown[] = [];
  const where = status ? (params.push(status), "WHERE r.status = $1") : "";
  return query(
    `SELECT r.*, u.full_name, u.email, u.status AS user_status, w.balance AS wallet_balance,
      (SELECT COUNT(*)::int FROM orders o WHERE o.reseller_id = r.id) AS order_count,
      (SELECT COALESCE(SUM(reseller_profit),0) FROM orders o WHERE o.reseller_id = r.id) AS total_profit
     FROM resellers r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN wallets w ON w.user_id = u.id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
}

export async function getReseller(id: string) {
  const reseller = await queryOne(
    `SELECT r.*, u.full_name, u.email, w.balance AS wallet_balance
     FROM resellers r JOIN users u ON u.id = r.user_id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE r.id = $1 OR r.user_id::text = $1 OR r.store_slug = $1`,
    [id]
  );
  if (!reseller) throw new AppError("Reseller not found", 404);
  const products = await query(
    `SELECT rp.*, p.name, p.price_per_1000, p.reseller_price_per_1000, p.status AS product_status
     FROM reseller_products rp JOIN products p ON p.id = rp.product_id
     WHERE rp.reseller_id = $1`,
    [reseller.id]
  );
  const orders = await query(
    `SELECT o.public_id, o.status, o.charge, o.reseller_profit, o.created_at, p.name AS product_name
     FROM orders o JOIN products p ON p.id = o.product_id
     WHERE o.reseller_id = $1 ORDER BY o.created_at DESC LIMIT 30`,
    [reseller.id]
  );
  return { reseller, products, orders };
}

export async function getPublicStorefront(slug: string) {
  const reseller = await queryOne(
    `SELECT r.id, r.store_name, r.store_slug, r.logo_url, r.brand_color, r.tagline, r.markup_percent, r.status
     FROM resellers r WHERE r.store_slug = $1`,
    [slug]
  );
  if (!reseller || reseller.status !== "active") throw new AppError("Storefront not found", 404);
  const products = await query(
    `SELECT p.id, p.name, p.slug, p.description, p.min_quantity, p.max_quantity,
            p.avg_delivery_time, p.delivery_type, p.features, p.image_url,
            pl.name AS platform_name, pl.slug AS platform_slug, pl.icon AS platform_icon, pl.color AS platform_color,
            c.name AS category_name, c.slug AS category_slug,
            COALESCE(rp.selling_price,
              ROUND(COALESCE(p.reseller_price_per_1000, p.price_per_1000) * (1 + r.markup_percent/100.0), 4)
            ) AS display_price_per_1000
     FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     JOIN resellers r ON r.id = $1
     LEFT JOIN reseller_products rp ON rp.reseller_id = r.id AND rp.product_id = p.id
     WHERE p.status = 'active' AND pl.is_active = TRUE AND (rp.is_enabled IS NULL OR rp.is_enabled = TRUE)
     ORDER BY pl.sort_order, p.name`,
    [reseller.id]
  );
  return { store: reseller, products };
}

export async function setResellerStatus(id: string, status: string, actor: AuthUser, ip?: string) {
  const allowed = ["pending", "active", "suspended", "rejected"];
  if (!allowed.includes(status)) throw new AppError("Invalid reseller status");
  const row = await queryOne(`UPDATE resellers SET status = $2 WHERE id = $1 RETURNING *`, [id, status]);
  if (!row) throw new AppError("Reseller not found", 404);
  if (status === "active") {
    await query(`UPDATE users SET role = 'reseller', status = 'active' WHERE id = $1`, [row.user_id]);
  }
  await notify({
    userId: row.user_id,
    title: "Reseller status updated",
    body: `Your reseller account is now ${status}.`,
    type: "reseller",
  });
  await writeAudit({ actor, action: `reseller.${status}`, targetType: "reseller", targetId: id, ip });
  return row;
}

export async function updateStorefront(userId: string, input: Record<string, unknown>) {
  const current = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
  if (!current) throw new AppError("Reseller profile not found", 404);
  let slug = current.store_slug;
  if (input.storeName && input.storeName !== current.store_name) {
    slug = uniqueSlug(String(input.storeName));
  }
  return queryOne(
    `UPDATE resellers SET
      store_name = COALESCE($2, store_name),
      store_slug = $3,
      tagline = COALESCE($4, tagline),
      brand_color = COALESCE($5, brand_color),
      logo_url = COALESCE($6, logo_url),
      markup_percent = COALESCE($7, markup_percent)
     WHERE user_id = $1 RETURNING *`,
    [
      userId,
      input.storeName ?? null,
      slug,
      input.tagline ?? null,
      input.brandColor ?? null,
      input.logoUrl ?? null,
      input.markupPercent ?? null,
    ]
  );
}

export async function setResellerProductPrice(userId: string, productId: string, sellingPrice: number, isEnabled = true) {
  const reseller = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
  if (!reseller) throw new AppError("Reseller profile not found", 404);
  if (reseller.status !== "active") throw new AppError("Reseller account is not active", 403);
  const product = await queryOne(`SELECT reseller_price_per_1000, price_per_1000 FROM products WHERE id = $1`, [productId]);
  if (!product) throw new AppError("Product not found", 404);
  const floor = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
  if (sellingPrice < floor) throw new AppError(`Selling price cannot be below GHS ${floor.toFixed(2)} per 1000`);
  return queryOne(
    `INSERT INTO reseller_products (reseller_id, product_id, selling_price, is_enabled)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (reseller_id, product_id)
     DO UPDATE SET selling_price = EXCLUDED.selling_price, is_enabled = EXCLUDED.is_enabled
     RETURNING *`,
    [reseller.id, productId, sellingPrice, isEnabled]
  );
}

export async function resellerStats(userId: string) {
  const reseller = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
  if (!reseller) throw new AppError("Reseller profile not found", 404);
  const stats = await queryOne(
    `SELECT
       COUNT(*)::int AS orders,
       COALESCE(SUM(charge),0) AS sales,
       COALESCE(SUM(reseller_profit),0) AS profit,
       COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today_orders
     FROM orders WHERE reseller_id = $1`,
    [reseller.id]
  );
  return { reseller, stats };
}

export { makeSlug };
