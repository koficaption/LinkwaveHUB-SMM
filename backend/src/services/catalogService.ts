import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { like, makeSlug, uniqueSlug } from "../utils.js";
import { looksLikeProviderCategory, publicCategoryName, publicProductDescription, publicProductName, isSellableProductName, isCanonicalCategorySlug, looksLikePerUnitProduct } from "./catalogClassify.js";
import { parseRefillHint } from "./refillParse.js";
import { writeAudit } from "./auditService.js";
import type { AuthUser } from "../middleware/auth.js";

const productSelect = `
  p.id, p.name, p.slug, p.description, p.min_quantity, p.max_quantity,
  p.price_per_1000, p.cost_per_1000, p.reseller_price_per_1000, p.status,
  p.delivery_type, p.avg_delivery_time, p.provider_service_id, p.image_url,
  p.features, p.created_at, p.updated_at, p.platform_id, p.category_id, p.provider_id,
  p.refill_supported, p.refill_days, p.refill_type, p.refill_service_id, p.refill_instructions,
  p.refill_limit, p.provider_refill_supported, p.reseller_available, p.api_available,
  p.api_price_per_1000, p.api_min_quantity, p.api_max_quantity, p.price_unit,
  (p.price_per_1000 - p.cost_per_1000) AS profit_per_1000,
  pl.name AS platform_name, pl.slug AS platform_slug, pl.icon AS platform_icon,
  pl.color AS platform_color, pl.icon_url AS platform_icon_url,
  c.name AS category_name, c.slug AS category_slug,
  pr.name AS provider_name
`;

export async function listPlatforms(opts: { includeInactive?: boolean } = {}) {
  const where = opts.includeInactive
    ? ""
    : `WHERE is_active = TRUE
       AND EXISTS (SELECT 1 FROM products x WHERE x.platform_id = p.id AND x.status = 'active')`;
  return query(
    `SELECT p.*,
      (SELECT COUNT(*)::int FROM products x WHERE x.platform_id = p.id AND x.status = 'active') AS product_count
     FROM platforms p ${where} ORDER BY sort_order, name`
  );
}

export async function getPlatform(idOrSlug: string) {
  const platform = await queryOne(
    `SELECT * FROM platforms WHERE id::text = $1 OR slug = $1`,
    [idOrSlug]
  );
  if (!platform) throw new AppError("Platform not found", 404);
  const categories = await query(
    `SELECT c.* FROM categories c
     JOIN platform_categories pc ON pc.category_id = c.id
     WHERE pc.platform_id = $1 AND c.is_active = TRUE
     ORDER BY c.sort_order, c.name`,
    [platform.id]
  );
  return { ...platform, categories };
}

export async function createPlatform(input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const name = String(input.name);
  const slug = uniqueSlug(name);
  const row = await queryOne(
    `INSERT INTO platforms (name, slug, description, icon, icon_url, color, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      name,
      slug,
      input.description ?? null,
      input.icon ?? null,
      input.iconUrl ?? null,
      input.color ?? "#0D9488",
      input.sortOrder ?? 0,
      input.isActive ?? true,
    ]
  );
  if (Array.isArray(input.categoryIds) && row) {
    await setPlatformCategories(row.id, input.categoryIds as string[]);
  }
  await writeAudit({ actor, action: "platform.create", targetType: "platform", targetId: row?.id, ip });
  return row;
}

export async function updatePlatform(id: string, input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const current = await queryOne(`SELECT * FROM platforms WHERE id = $1`, [id]);
  if (!current) throw new AppError("Platform not found", 404);
  const row = await queryOne(
    `UPDATE platforms SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      icon = COALESCE($4, icon),
      icon_url = COALESCE($5, icon_url),
      color = COALESCE($6, color),
      sort_order = COALESCE($7, sort_order),
      is_active = COALESCE($8, is_active)
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.name ?? null,
      input.description ?? null,
      input.icon ?? null,
      input.iconUrl ?? null,
      input.color ?? null,
      input.sortOrder ?? null,
      input.isActive ?? null,
    ]
  );
  if (Array.isArray(input.categoryIds)) {
    await setPlatformCategories(id, input.categoryIds as string[]);
  }
  await writeAudit({ actor, action: "platform.update", targetType: "platform", targetId: id, ip, details: input });
  return row;
}

export async function deletePlatform(id: string, actor: AuthUser, ip?: string) {
  const used = await queryOne(`SELECT id FROM products WHERE platform_id = $1 LIMIT 1`, [id]);
  if (used) throw new AppError("Cannot delete a platform that still has products", 400);
  await query(`DELETE FROM platforms WHERE id = $1`, [id]);
  await writeAudit({ actor, action: "platform.delete", targetType: "platform", targetId: id, ip });
}

async function setPlatformCategories(platformId: string, categoryIds: string[]) {
  await query(`DELETE FROM platform_categories WHERE platform_id = $1`, [platformId]);
  for (const categoryId of categoryIds) {
    await query(
      `INSERT INTO platform_categories (platform_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [platformId, categoryId]
    );
  }
}

export async function listCategories(opts: { includeInactive?: boolean; platformId?: string } = {}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!opts.includeInactive) where.push("c.is_active = TRUE");
  if (opts.platformId) {
    params.push(opts.platformId);
    where.push(`EXISTS (
      SELECT 1 FROM platform_categories pc
      JOIN platforms pl ON pl.id = pc.platform_id
      WHERE pc.category_id = c.id
        AND (pc.platform_id::text = $${params.length} OR pl.slug = $${params.length})
    )`);
  }
  const countSql = opts.platformId
    ? `(SELECT COUNT(*)::int FROM products x
        JOIN platforms pl ON pl.id = x.platform_id
        WHERE x.category_id = c.id AND x.status = 'active'
          AND (x.platform_id::text = $1 OR pl.slug = $1))`
    : `(SELECT COUNT(*)::int FROM products x WHERE x.category_id = c.id AND x.status = 'active')`;
  const sql = `SELECT c.*,
    ${countSql} AS product_count,
    COALESCE((SELECT json_agg(pc.platform_id) FROM platform_categories pc WHERE pc.category_id = c.id), '[]'::json) AS platform_ids,
    COALESCE((
      SELECT jsonb_object_agg(pc.platform_id::text, cnt.c)
      FROM platform_categories pc
      JOIN LATERAL (
        SELECT COUNT(*)::int AS c
        FROM products x
        WHERE x.platform_id = pc.platform_id AND x.category_id = c.id AND x.status = 'active'
      ) cnt ON TRUE
      WHERE pc.category_id = c.id
    ), '{}'::jsonb) AS platform_counts
    FROM categories c ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY c.sort_order, c.name`;
  const rows = await query(sql, params);
  return rows
    .filter((row) => opts.includeInactive || isCanonicalCategorySlug(String(row.slug || "")))
    .filter((row) => opts.includeInactive || !looksLikeProviderCategory(String(row.name || "")))
    .filter((row) => opts.includeInactive || Number(row.product_count || 0) > 0)
    .map((row) => opts.includeInactive ? row : ({ ...row, name: publicCategoryName(String(row.name || "")) }));
}

export async function createCategory(input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const row = await queryOne(
    `INSERT INTO categories (name, slug, description, icon, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      input.name,
      uniqueSlug(String(input.name)),
      input.description ?? null,
      input.icon ?? null,
      input.sortOrder ?? 0,
      input.isActive ?? true,
    ]
  );
  if (Array.isArray(input.platformIds) && row) {
    for (const platformId of input.platformIds as string[]) {
      await query(
        `INSERT INTO platform_categories (platform_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [platformId, row.id]
      );
    }
  }
  await writeAudit({ actor, action: "category.create", targetType: "category", targetId: row?.id, ip });
  return row;
}

export async function updateCategory(id: string, input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const row = await queryOne(
    `UPDATE categories SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      icon = COALESCE($4, icon),
      sort_order = COALESCE($5, sort_order),
      is_active = COALESCE($6, is_active)
     WHERE id = $1 RETURNING *`,
    [id, input.name ?? null, input.description ?? null, input.icon ?? null, input.sortOrder ?? null, input.isActive ?? null]
  );
  if (!row) throw new AppError("Category not found", 404);
  if (Array.isArray(input.platformIds)) {
    await query(`DELETE FROM platform_categories WHERE category_id = $1`, [id]);
    for (const platformId of input.platformIds as string[]) {
      await query(
        `INSERT INTO platform_categories (platform_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [platformId, id]
      );
    }
  }
  await writeAudit({ actor, action: "category.update", targetType: "category", targetId: id, ip });
  return row;
}

export async function deleteCategory(id: string, actor: AuthUser, ip?: string) {
  const used = await queryOne(`SELECT id FROM products WHERE category_id = $1 LIMIT 1`, [id]);
  if (used) throw new AppError("Cannot delete a category that still has products", 400);
  await query(`DELETE FROM categories WHERE id = $1`, [id]);
  await writeAudit({ actor, action: "category.delete", targetType: "category", targetId: id, ip });
}

export async function listProducts(opts: {
  platformId?: string;
  categoryId?: string;
  status?: string;
  search?: string;
  includeInactive?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
  resellerPrice?: boolean;
  refill?: string;
  providerId?: string;
  apiAvailable?: string;
  resellerAvailable?: string;
  loyaltyDiscountPercent?: number;
  panelResellerId?: string;
}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!opts.includeInactive) {
    where.push(`p.status = 'active'`);
    where.push(`p.name ~* '[A-Za-z]{3,}'`);
    where.push(`p.name !~* 'not[[:space:]]*available|unavailable|out[[:space:]]*of[[:space:]]*stock|do[[:space:]]*not[[:space:]]*order'`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`p.status = $${params.length}`);
  }
  if (opts.platformId) {
    params.push(opts.platformId);
    where.push(`(p.platform_id::text = $${params.length} OR pl.slug = $${params.length})`);
  }
  if (opts.categoryId) {
    params.push(opts.categoryId);
    where.push(`(p.category_id::text = $${params.length} OR c.slug = $${params.length})`);
  }
  if (opts.providerId) {
    params.push(opts.providerId);
    where.push(`p.provider_id::text = $${params.length}`);
  }
  if (opts.refill === "yes" || opts.refill === "supported") where.push(`p.refill_supported = TRUE`);
  if (opts.refill === "no" || opts.refill === "unsupported") where.push(`p.refill_supported = FALSE`);
  if (opts.apiAvailable === "yes") where.push(`p.api_available = TRUE`);
  if (opts.apiAvailable === "no") where.push(`p.api_available = FALSE`);
  if (opts.resellerAvailable === "yes") where.push(`p.reseller_available = TRUE`);
  if (opts.resellerAvailable === "no") where.push(`p.reseller_available = FALSE`);
  if (opts.panelResellerId) where.push(`p.reseller_available IS NOT FALSE`);
  const search = like(opts.search);
  if (search) {
    params.push(search);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }

  const sortMap: Record<string, string> = {
    newest: "p.created_at DESC",
    oldest: "p.created_at ASC",
    price_asc: "p.price_per_1000 ASC",
    price_desc: "p.price_per_1000 DESC",
    name: "p.name ASC",
    catalog: "pl.sort_order, c.sort_order, p.name ASC",
  };
  const orderBy = sortMap[opts.sort ?? "newest"] ?? "p.created_at DESC";
  const requested = Math.max(1, Number(opts.limit ?? 50) || 50);
  const limit = Math.min(2000, requested);
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * limit;

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     ${whereSql}`,
    params
  );

  params.push(limit, offset);
  let items = await query(
    `SELECT ${productSelect}
     FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN providers pr ON pr.id = p.provider_id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  if (opts.panelResellerId) {
    items = await applyPanelPrices(items, opts.panelResellerId);
  }

  return {
    items: items.map((p) => sanitizeProduct(p, Boolean(opts.resellerPrice), Boolean(opts.includeInactive), opts.panelResellerId ? 0 : opts.loyaltyDiscountPercent)),
    total: Number(countRow?.count ?? 0),
    page,
    limit,
  };
}

export async function getProduct(idOrSlug: string, opts: { admin?: boolean; reseller?: boolean; loyaltyDiscountPercent?: number; panelResellerId?: string } = {}) {
  const row = await queryOne(
    `SELECT ${productSelect}
     FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN providers pr ON pr.id = p.provider_id
     WHERE p.id::text = $1 OR p.slug = $1`,
    [idOrSlug]
  );
  if (!row) throw new AppError("Product not found", 404);
  if (!opts.admin && (row.status !== "active" || !isSellableProductName(String(row.name || "")))) {
    throw new AppError("Product not found", 404);
  }
  const priced = opts.panelResellerId ? (await applyPanelPrices([row], opts.panelResellerId))[0] : row;
  if (!priced) throw new AppError("Product not found", 404);
  return sanitizeProduct(priced, Boolean(opts.reseller), Boolean(opts.admin), opts.panelResellerId ? 0 : opts.loyaltyDiscountPercent);
}

export async function createProduct(input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  if (Number(input.maxQuantity) < Number(input.minQuantity)) {
    throw new AppError("Maximum quantity must be greater than or equal to minimum quantity");
  }
  const row = await queryOne(
    `INSERT INTO products (
      platform_id, category_id, provider_id, name, slug, description,
      min_quantity, max_quantity, price_per_1000, cost_per_1000, reseller_price_per_1000,
      status, delivery_type, avg_delivery_time, provider_service_id, image_url, features,
      refill_supported, refill_days, refill_type, refill_service_id, refill_instructions,
      refill_limit, provider_refill_supported, reseller_available, api_available,
      api_price_per_1000, api_min_quantity, api_max_quantity, price_unit
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
    RETURNING *`,
    [
      input.platformId,
      input.categoryId,
      input.providerId ?? null,
      input.name,
      uniqueSlug(String(input.name)),
      input.description ?? null,
      input.minQuantity,
      input.maxQuantity,
      input.pricePer1000,
      input.costPer1000,
      input.resellerPricePer1000 ?? null,
      input.status ?? "active",
      input.deliveryType ?? "gradual",
      input.avgDeliveryTime ?? null,
      input.providerServiceId ?? null,
      input.imageUrl ?? null,
      JSON.stringify(input.features ?? []),
      Boolean(input.refillSupported),
      Number(input.refillDays ?? 30),
      input.refillType ?? null,
      input.refillServiceId ?? null,
      input.refillInstructions ?? null,
      Number(input.refillLimit ?? 1) || 1,
      Boolean(input.providerRefillSupported),
      input.resellerAvailable !== false,
      Boolean(input.apiAvailable),
      input.apiPricePer1000 ?? null,
      input.apiMinQuantity ?? null,
      input.apiMaxQuantity ?? null,
      input.priceUnit === "each" || looksLikePerUnitProduct(String(input.name || ""), Number(input.minQuantity), Number(input.maxQuantity), {
        cost: Number(input.costPer1000),
        providerServiceId: input.providerServiceId == null ? "" : String(input.providerServiceId),
      })
        ? "each"
        : "per_1000",
    ]
  );
  await writeAudit({ actor, action: "product.create", targetType: "product", targetId: row?.id, ip, details: { name: input.name } });
  return getProduct(row!.id, { admin: true });
}

export async function updateProduct(id: string, input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const current = await queryOne(`SELECT * FROM products WHERE id = $1`, [id]);
  if (!current) throw new AppError("Product not found", 404);
  await query(
    `UPDATE products SET
      platform_id = COALESCE($2, platform_id),
      category_id = COALESCE($3, category_id),
      provider_id = COALESCE($4, provider_id),
      name = COALESCE($5, name),
      description = COALESCE($6, description),
      min_quantity = COALESCE($7, min_quantity),
      max_quantity = COALESCE($8, max_quantity),
      price_per_1000 = COALESCE($9, price_per_1000),
      cost_per_1000 = COALESCE($10, cost_per_1000),
      reseller_price_per_1000 = COALESCE($11, reseller_price_per_1000),
      status = COALESCE($12, status),
      delivery_type = COALESCE($13, delivery_type),
      avg_delivery_time = COALESCE($14, avg_delivery_time),
      provider_service_id = COALESCE($15, provider_service_id),
      image_url = COALESCE($16, image_url),
      features = COALESCE($17::jsonb, features),
      refill_supported = COALESCE($18, refill_supported),
      refill_days = COALESCE($19, refill_days),
      refill_type = COALESCE($20, refill_type),
      refill_service_id = COALESCE($21, refill_service_id),
      refill_instructions = COALESCE($22, refill_instructions),
      refill_limit = COALESCE($23, refill_limit),
      provider_refill_supported = COALESCE($24, provider_refill_supported),
      reseller_available = COALESCE($25, reseller_available),
      api_available = COALESCE($26, api_available),
      api_price_per_1000 = COALESCE($27, api_price_per_1000),
      api_min_quantity = COALESCE($28, api_min_quantity),
      api_max_quantity = COALESCE($29, api_max_quantity),
      price_unit = COALESCE($30, price_unit)
     WHERE id = $1`,
    [
      id,
      input.platformId ?? null,
      input.categoryId ?? null,
      input.providerId === undefined ? null : input.providerId,
      input.name ?? null,
      input.description ?? null,
      input.minQuantity ?? null,
      input.maxQuantity ?? null,
      input.pricePer1000 ?? null,
      input.costPer1000 ?? null,
      input.resellerPricePer1000 === undefined ? null : input.resellerPricePer1000,
      input.status ?? null,
      input.deliveryType ?? null,
      input.avgDeliveryTime ?? null,
      input.providerServiceId ?? null,
      input.imageUrl ?? null,
      input.features ? JSON.stringify(input.features) : null,
      input.refillSupported === undefined ? null : Boolean(input.refillSupported),
      input.refillDays === undefined ? null : Number(input.refillDays),
      input.refillType === undefined ? null : input.refillType,
      input.refillServiceId === undefined ? null : input.refillServiceId,
      input.refillInstructions === undefined ? null : input.refillInstructions,
      input.refillLimit === undefined ? null : Number(input.refillLimit),
      input.providerRefillSupported === undefined ? null : Boolean(input.providerRefillSupported),
      input.resellerAvailable === undefined ? null : Boolean(input.resellerAvailable),
      input.apiAvailable === undefined ? null : Boolean(input.apiAvailable),
      input.apiPricePer1000 === undefined ? null : input.apiPricePer1000,
      input.apiMinQuantity === undefined ? null : input.apiMinQuantity,
      input.apiMaxQuantity === undefined ? null : input.apiMaxQuantity,
      looksLikePerUnitProduct(
        String(input.name ?? current.name ?? ""),
        Number(input.minQuantity ?? current.min_quantity),
        Number(input.maxQuantity ?? current.max_quantity),
        {
          cost: Number(input.costPer1000 ?? current.cost_per_1000),
          providerServiceId: input.providerServiceId === undefined
            ? String(current.provider_service_id ?? "")
            : String(input.providerServiceId ?? ""),
        }
      )
        ? "each"
        : input.priceUnit === undefined
          ? null
          : input.priceUnit,
    ]
  );
  await writeAudit({ actor, action: "product.update", targetType: "product", targetId: id, ip });
  return getProduct(id, { admin: true });
}

export async function deleteProduct(id: string, actor: AuthUser, ip?: string) {
  const used = await queryOne(`SELECT id FROM orders WHERE product_id = $1 LIMIT 1`, [id]);
  if (used) {
    await query(`UPDATE products SET status = 'inactive' WHERE id = $1`, [id]);
    await writeAudit({ actor, action: "product.disable", targetType: "product", targetId: id, ip });
    return { disabled: true };
  }
  await query(`DELETE FROM products WHERE id = $1`, [id]);
  await writeAudit({ actor, action: "product.delete", targetType: "product", targetId: id, ip });
  return { deleted: true };
}

export async function duplicateProduct(id: string, actor: AuthUser, ip?: string) {
  const current = await getProduct(id, { admin: true });
  return createProduct(
    {
      platformId: current.platform_id,
      categoryId: current.category_id,
      providerId: current.provider_id,
      name: `${current.name} (Copy)`,
      description: current.description,
      minQuantity: current.min_quantity,
      maxQuantity: current.max_quantity,
      pricePer1000: Number(current.price_per_1000),
      costPer1000: Number(current.cost_per_1000),
      resellerPricePer1000: current.reseller_price_per_1000 ? Number(current.reseller_price_per_1000) : null,
      status: "inactive",
      deliveryType: current.delivery_type,
      avgDeliveryTime: current.avg_delivery_time,
      providerServiceId: current.provider_service_id,
      imageUrl: current.image_url,
      features: current.features,
      refillSupported: current.refill_supported,
      refillDays: current.refill_days,
      refillType: current.refill_type,
      refillServiceId: current.refill_service_id,
      refillInstructions: current.refill_instructions,
      refillLimit: current.refill_limit,
      providerRefillSupported: current.provider_refill_supported,
      resellerAvailable: current.reseller_available,
      apiAvailable: current.api_available,
      apiPricePer1000: current.api_price_per_1000 ? Number(current.api_price_per_1000) : null,
      apiMinQuantity: current.api_min_quantity ? Number(current.api_min_quantity) : null,
      apiMaxQuantity: current.api_max_quantity ? Number(current.api_max_quantity) : null,
      priceUnit: current.price_unit === "each" ? "each" : "per_1000",
    },
    actor,
    ip
  );
}

export async function bulkProductStatus(ids: string[], status: "active" | "inactive", actor: AuthUser, ip?: string) {
  await query(`UPDATE products SET status = $2 WHERE id = ANY($1::uuid[])`, [ids, status]);
  await writeAudit({
    actor,
    action: status === "active" ? "product.bulk_enable" : "product.bulk_disable",
    targetType: "product",
    details: { ids },
    ip,
  });
}

async function applyPanelPrices(items: Record<string, unknown>[], resellerId: string) {
  const reseller = await queryOne<{ markup_percent: string }>(
    `SELECT markup_percent FROM resellers WHERE id = $1 AND status = 'active'`,
    [resellerId]
  );
  if (!reseller) return items;
  const rows = await query<{ product_id: string; selling_price: string | null; is_enabled: boolean }>(
    `SELECT product_id, selling_price, is_enabled FROM reseller_products WHERE reseller_id = $1`,
    [resellerId]
  );
  const map = new Map(rows.map((row) => [String(row.product_id), row]));
  const markup = Number(reseller.markup_percent || 0);
  return items.flatMap((product) => {
    const custom = map.get(String(product.id));
    if (custom?.is_enabled === false) return [];
    const base = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
    const display = custom?.selling_price != null
      ? Number(custom.selling_price)
      : Number((base * (1 + markup / 100)).toFixed(4));
    return [{ ...product, panel_display_price: display }];
  });
}

function sanitizeProduct(row: Record<string, unknown>, reseller: boolean, admin: boolean, loyaltyDiscountPercent = 0) {
  const product = { ...row };
  const hint = parseRefillHint(String(product.name || ""), "", Boolean(product.refill_supported));
  if (hint.supported) {
    product.refill_supported = true;
    product.refill_days = hint.fromName ? hint.days : Number(product.refill_days || hint.days);
  }
  product.category_name = publicCategoryName(String(product.category_name || ""));
  product.description = publicProductDescription(product.description as string | null);
  const perUnit = product.price_unit === "each" || looksLikePerUnitProduct(
    String(product.name || ""),
    Number(product.min_quantity),
    Number(product.max_quantity),
    { cost: Number(product.cost_per_1000), providerServiceId: String(product.provider_service_id ?? "") }
  );
  if (!admin) {
    product.name = publicProductName(String(product.name || ""));
    delete product.cost_per_1000;
    delete product.profit_per_1000;
    delete product.provider_service_id;
    delete product.provider_id;
    delete product.provider_name;
  }
  let display = Number(product.price_per_1000);
  if (product.panel_display_price != null) {
    display = Number(product.panel_display_price);
  } else if (reseller && product.reseller_price_per_1000 != null) {
    display = Number(product.reseller_price_per_1000);
  } else if (!reseller && loyaltyDiscountPercent > 0) {
    display = Number((display * (1 - loyaltyDiscountPercent / 100)).toFixed(4));
    product.loyalty_discount_percent = loyaltyDiscountPercent;
  }
  product.display_price_per_1000 = display;
  product.price_unit = perUnit ? "each" : "per_1000";
  return product;
}

export function toApiService(product: Record<string, unknown>) {
  const apiPrice = Number(product.api_price_per_1000);
  const price = Number.isFinite(apiPrice) && apiPrice > 0
    ? apiPrice
    : Number(product.display_price_per_1000 ?? product.price_per_1000);
  return {
    id: product.id,
    platform: product.platform_name,
    category: product.category_name,
    name: publicProductName(String(product.name || "")),
    description: product.description,
    min: Number(product.api_min_quantity || product.min_quantity),
    max: Number(product.api_max_quantity || product.max_quantity),
    price,
    price_unit: product.price_unit === "each" ? "each" : "per_1000",
    currency: "GHS",
    delivery: product.avg_delivery_time,
    delivery_type: product.delivery_type,
    status: product.status,
  };
}

export { makeSlug };
