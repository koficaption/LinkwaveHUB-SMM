import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { makeSlug } from "../utils.js";
import { detectPlatform, detectServiceCategory, isSellableProductName, publicProductName } from "./catalogClassify.js";
import { parsePanelFlag, parseRefillHint } from "./refillParse.js";
import { writeAudit } from "./auditService.js";
import { getSettings } from "./settingsService.js";
import { listProviderServices } from "./providerService.js";
import type { AuthUser } from "../middleware/auth.js";

function money4(value: number) {
  return Number(Math.max(0, value).toFixed(4));
}

function categorySlug(name: string) {
  const slug = makeSlug(name).slice(0, 70);
  return slug || `cat-${Buffer.from(name).toString("hex").slice(0, 10)}`;
}

export async function importProviderPackages(
  providerId: string,
  actor: AuthUser,
  ip?: string,
  opts?: { markupPercent?: number }
) {
  const { provider, services } = await listProviderServices(providerId);
  if (!services.length) throw new AppError("This provider returned no packages to import", 400);

  const settings = await getSettings();
  const pricing = (settings.pricing ?? {}) as {
    customerMarkupPercent?: number;
    resellerMarkupPercent?: number;
    minimumProfitPer1000?: number;
    usdToGhs?: number;
    importMarkupPercent?: number;
  };
  const usdToGhs = Number(pricing.usdToGhs ?? 15.4);
  const markup = Number(
    opts?.markupPercent ?? pricing.importMarkupPercent ?? pricing.customerMarkupPercent ?? 40
  );
  const resellerMarkup = Number(pricing.resellerMarkupPercent ?? 15);
  const minProfit = Number(pricing.minimumProfitPer1000 ?? 0.5);

  const result = await withTransaction(async (client) => {
    await client.query("SET LOCAL statement_timeout = '300s'");
    const platforms = await query<{ id: string; slug: string }>(`SELECT id, slug FROM platforms`, [], client);
    const categories = await query<{ id: string; slug: string }>(`SELECT id, slug FROM categories`, [], client);
    const platformBySlug = new Map(platforms.map((row) => [row.slug, row.id]));
    const categoryBySlug = new Map(categories.map((row) => [row.slug, row.id]));
    let platformsCreated = 0;
    let categoriesCreated = 0;

    async function ensurePlatform(meta: { name: string; slug: string; icon: string; color: string }) {
      const existing = platformBySlug.get(meta.slug);
      if (existing) return existing;
      const row = await queryOne<{ id: string }>(
        `INSERT INTO platforms (name, slug, description, icon, color, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(sort_order),0)+1 FROM platforms), TRUE)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [meta.name, meta.slug, `${meta.name} services imported from the connected panel`, meta.icon, meta.color],
        client
      );
      platformBySlug.set(meta.slug, row!.id);
      platformsCreated += 1;
      return row!.id;
    }

    async function ensureCategory(name: string, sort = 900) {
      const slug = categorySlug(name);
      const existing = categoryBySlug.get(slug);
      if (existing) return existing;
      const row = await queryOne<{ id: string }>(
        `INSERT INTO categories (name, slug, description, sort_order, is_active)
         VALUES ($1,$2,$3,$4, TRUE)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = LEAST(categories.sort_order, EXCLUDED.sort_order), is_active = TRUE
         RETURNING id`,
        [name.slice(0, 80), slug, "Imported from the connected SMM provider", sort],
        client
      );
      categoryBySlug.set(slug, row!.id);
      categoriesCreated += 1;
      return row!.id;
    }

    const linked = new Set<string>();
    const rows: {
      platformId: string;
      categoryId: string;
      name: string;
      slug: string;
      description: string | null;
      minQty: number;
      maxQty: number;
      price: number;
      cost: number;
      reseller: number;
      delivery: string;
      serviceId: string;
      features: string;
      refill: boolean;
      refillDays: number;
      providerRefill: boolean;
    }[] = [];
    for (const service of services) {
      const serviceId = String(service.service ?? "").trim();
      if (!serviceId) continue;
      const rawName = String(service.name || "").trim();
      if (!isSellableProductName(rawName)) continue;
      const displayName = publicProductName(rawName).slice(0, 180);
      if (!displayName) continue;
      const panelCategory = String(service.category || "General").slice(0, 80);
      const platform = detectPlatform(panelCategory, displayName);
      const platformId = await ensurePlatform(platform);
      const serviceCategory = detectServiceCategory(panelCategory, displayName);
      const categoryId = await ensureCategory(serviceCategory.name, serviceCategory.sort);
      const linkKey = `${platformId}:${categoryId}`;
      if (!linked.has(linkKey)) {
        await query(
          `INSERT INTO platform_categories (platform_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [platformId, categoryId],
          client
        );
        linked.add(linkKey);
      }
      const rateUsd = Number(service.rate ?? 0);
      const cost = money4(rateUsd * usdToGhs);
      const priced = money4(cost * (1 + markup / 100));
      const price = money4(Math.max(priced, cost + minProfit));
      const reseller = money4(Math.max(cost * (1 + resellerMarkup / 100), cost));
      let minQty = Math.max(1, Number(service.min ?? 1) || 1);
      let maxQty = Math.max(minQty, Number(service.max ?? minQty) || minQty);
      const providerRefill = parsePanelFlag(service.refill);
      const hint = parseRefillHint(`${rawName} ${displayName}`, "", providerRefill);
      const refill = hint.supported;
      const features = [
        service.type ? String(service.type) : "",
        refill ? (hint.days === 365 ? "Lifetime refill" : `${hint.days} day refill`) : "No refill",
        service.cancel ? "Cancel anytime" : "",
      ].filter(Boolean);
      rows.push({
        platformId,
        categoryId,
        name: displayName,
        slug: `p-${String(provider.id).replace(/-/g, "").slice(0, 8)}-${serviceId}`.toLowerCase(),
        description: null,
        minQty,
        maxQty,
        price,
        cost,
        reseller,
        delivery: /instant|fast/i.test(`${rawName} ${displayName}`) ? "instant" : "gradual",
        serviceId,
        features: JSON.stringify(features),
        refill,
        refillDays: hint.days,
        providerRefill,
      });
    }

    const unique = new Map<string, (typeof rows)[number]>();
    for (const row of rows) unique.set(row.serviceId, row);
    rows.length = 0;
    rows.push(...unique.values());

    const batchSize = 400;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await query(
        `INSERT INTO products (
           platform_id, category_id, provider_id, name, slug, description,
           min_quantity, max_quantity, price_per_1000, cost_per_1000, reseller_price_per_1000,
           status, delivery_type, avg_delivery_time, provider_service_id, features,
           refill_supported, provider_refill_supported, refill_days, refill_limit, refill_service_id
         )
         SELECT
           x.platform_id, x.category_id, $1::uuid, x.name, x.slug, x.description,
           x.min_quantity, x.max_quantity, x.price_per_1000, x.cost_per_1000, x.reseller_price_per_1000,
           'active', x.delivery_type::delivery_type, 'Panel delivery', x.provider_service_id, x.features::jsonb,
           x.refill_supported, x.provider_refill_supported, x.refill_days, 1, x.provider_service_id
         FROM unnest(
           $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::text[],
           $7::int[], $8::int[], $9::numeric[], $10::numeric[], $11::numeric[],
           $12::text[], $13::text[], $14::text[], $15::boolean[], $16::int[], $17::boolean[]
         ) AS x(
           platform_id, category_id, name, slug, description,
           min_quantity, max_quantity, price_per_1000, cost_per_1000, reseller_price_per_1000,
           delivery_type, provider_service_id, features, refill_supported, refill_days, provider_refill_supported
         )
         ON CONFLICT (provider_id, provider_service_id) WHERE provider_id IS NOT NULL AND provider_service_id IS NOT NULL
         DO UPDATE SET
           platform_id = EXCLUDED.platform_id,
           category_id = EXCLUDED.category_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           min_quantity = EXCLUDED.min_quantity,
           max_quantity = EXCLUDED.max_quantity,
           price_per_1000 = EXCLUDED.price_per_1000,
           cost_per_1000 = EXCLUDED.cost_per_1000,
           reseller_price_per_1000 = EXCLUDED.reseller_price_per_1000,
           status = 'active',
           delivery_type = EXCLUDED.delivery_type,
           features = EXCLUDED.features,
           refill_supported = products.refill_supported OR EXCLUDED.refill_supported,
           refill_days = CASE WHEN EXCLUDED.refill_supported THEN EXCLUDED.refill_days ELSE products.refill_days END,
           provider_refill_supported = EXCLUDED.provider_refill_supported,
           updated_at = NOW()`,
        [
          providerId,
          batch.map((row) => row.platformId),
          batch.map((row) => row.categoryId),
          batch.map((row) => row.name),
          batch.map((row) => row.slug),
          batch.map((row) => row.description),
          batch.map((row) => row.minQty),
          batch.map((row) => row.maxQty),
          batch.map((row) => row.price),
          batch.map((row) => row.cost),
          batch.map((row) => row.reseller),
          batch.map((row) => row.delivery),
          batch.map((row) => row.serviceId),
          batch.map((row) => row.features),
          batch.map((row) => row.refill),
          batch.map((row) => row.refillDays),
          batch.map((row) => row.providerRefill),
        ],
        client
      );
      upserted += batch.length;
    }

    const serviceIds = rows.map((row) => row.serviceId);
    const deactivated = await queryOne<{ count: string }>(
      `WITH updated AS (
         UPDATE products SET status = 'inactive', updated_at = NOW()
         WHERE provider_id = $1
           AND provider_service_id IS NOT NULL
           AND NOT (provider_service_id = ANY($2::text[]))
           AND status = 'active'
         RETURNING id
       )
       SELECT COUNT(*) FROM updated`,
      [providerId, serviceIds],
      client
    );

    return {
      packages: services.length,
      upserted,
      platformsCreated,
      categoriesCreated,
      deactivated: Number(deactivated?.count ?? 0),
      usdToGhs,
      markupPercent: markup,
    };
  });

  await writeAudit({
    actor,
    action: "provider.import",
    targetType: "provider",
    targetId: providerId,
    details: result,
    ip,
  });
  return result;
}

export function shouldImportPackages(input: Record<string, unknown>, adapter?: string) {
  const usedAdapter = String(input.adapter || adapter || "generic_http");
  if (usedAdapter !== "generic_http") return false;
  if (input.importPackages === true) return true;
  if (input.importPackages === false) return false;
  return Boolean(input.apiKey);
}

export type ImportResult = {
  packages: number;
  upserted: number;
  platformsCreated: number;
  categoriesCreated: number;
  deactivated: number;
  usdToGhs: number;
  markupPercent: number;
};
