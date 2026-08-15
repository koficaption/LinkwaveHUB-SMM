import type { Product } from "@/types";
import { publicCategoryName, publicProductDescription, publicProductName } from "@/utils/catalog";
import { productRefill } from "@/utils/refill";

const COUNTRIES: { test: RegExp; name: string }[] = [
  { test: /\busa\b|united states|\bus\b/i, name: "USA" },
  { test: /\buk\b|united kingdom|britain/i, name: "UK" },
  { test: /\bghana\b|\bgh\b/i, name: "Ghana" },
  { test: /\bnigeria\b|\bng\b/i, name: "Nigeria" },
  { test: /\bindia\b|\bin\b/i, name: "India" },
  { test: /\bbrazil\b|\bbr\b/i, name: "Brazil" },
  { test: /\bturkey\b|\btr\b/i, name: "Turkey" },
  { test: /\bgermany\b|\bde\b/i, name: "Germany" },
  { test: /\bfrance\b|\bfr\b/i, name: "France" },
  { test: /\barab\b|mena/i, name: "Arab" },
];

export type OrderGuide = {
  facts: { label: string; value: string }[];
  notes: string[];
};

function haystack(product: Product) {
  return `${publicProductName(product.name)} ${product.category_name} ${product.platform_name} ${(product.features || []).join(" ")}`;
}

function linkType(product: Product) {
  const text = haystack(product).toLowerCase();
  const platform = product.platform_name || "Profile";
  if (/follower|subscriber|member/.test(text)) return `${platform} Profile URL`;
  if (/stor(?:y|ies)/.test(text)) return `${platform} Story Link`;
  if (/\blive\b/.test(text)) return `${platform} Live URL`;
  if (/comment|like|view|share|save|reaction|vote|impression|reach/.test(text)) return `${platform} Post Link`;
  if (/telegram|channel/.test(text)) return "Telegram Channel / Post Link";
  return `${platform} URL`;
}

function location(product: Product) {
  const text = haystack(product);
  return COUNTRIES.find((row) => row.test.test(text))?.name || "Global";
}

function quality(product: Product) {
  const text = haystack(product);
  if (/\bhq\b|high\s*quality|premium|real\s*organic/i.test(text)) return "High Quality";
  if (/\breal\b|organic/i.test(text)) return "Real";
  if (/\bbot\b/i.test(text)) return "Bot";
  if (/\bmix(ed)?\b/i.test(text)) return "Mix Quality";
  return "Mix Quality";
}

function startTime(product: Product) {
  const text = haystack(product);
  const speed = text.match(/(\d+\s*k?\+?\s*\/\s*day)/i);
  if (/instant/i.test(text)) return speed ? `Instant · ${speed[1].replace(/\s+/g, "")}` : "Instant";
  if (/super\s*fast|very\s*fast/i.test(text)) return "Super Fast";
  if (speed) return speed[1].replace(/\s+/g, " ");
  return product.avg_delivery_time || "After the order is accepted";
}

function refillTime(product: Product) {
  const refill = productRefill(product);
  const text = haystack(product);
  if (/no\s*refill|non[\s-]*refill/i.test(text) && !product.refill_supported) return "No refill";
  if (!refill.supported) return "No refill";
  if (refill.days >= 365) return "Lifetime ♻️";
  return `${refill.days} Days ♻️`;
}

export function orderGuide(product: Product): OrderGuide {
  const refill = productRefill(product);
  const extra = publicProductDescription(product.description);
  const notes = [
    extra,
    ...(product.features || []).filter((item) => item && !/^imported/i.test(item)),
    product.refill_instructions,
    "If demand is high, start time and speed can change.",
    "Wait until an order on the same link finishes before placing another on that link.",
    "Use a public profile, post, or video link. Do not send passwords.",
    refill.supported ? `Drops during the ${refill.days >= 365 ? "lifetime" : `${refill.days}-day`} refill window can be requested from Orders.` : null,
  ].filter((item): item is string => Boolean(item && item.trim()));

  return {
    facts: [
      { label: "Link", value: linkType(product) },
      { label: "Location", value: location(product) },
      { label: "Quality", value: quality(product) },
      { label: "Start Time", value: startTime(product) },
      { label: "Refill Time", value: refillTime(product) },
      { label: "Category", value: `${product.platform_name} · ${publicCategoryName(product.category_name)}` },
      { label: "Min / Max", value: `${product.min_quantity.toLocaleString()} / ${product.max_quantity.toLocaleString()}` },
    ],
    notes: [...new Set(notes)],
  };
}
