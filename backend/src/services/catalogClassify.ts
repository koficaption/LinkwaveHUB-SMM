import { makeSlug } from "../utils.js";

const PROVIDER_NOISE = /resellers?mm|\bprovider\b|task\s*\/\s*farm|smm\s*panel|wholesale\s*panel/i;

const SERVICE_TYPES: { test: RegExp; name: string; slug: string }[] = [
  { test: /subscriber/i, name: "Subscribers", slug: "subscribers" },
  { test: /follower/i, name: "Followers", slug: "followers" },
  { test: /\blikes?\b|\blikers\b/i, name: "Likes", slug: "likes" },
  { test: /comment/i, name: "Comments", slug: "comments" },
  { test: /share|repost|retweet/i, name: "Shares", slug: "shares" },
  { test: /stor(?:y|ies)/i, name: "Stories", slug: "stories" },
  { test: /\blive\b/i, name: "Live Stream", slug: "live" },
  { test: /view|watch|play/i, name: "Views", slug: "views" },
  { test: /save|bookmark/i, name: "Saves", slug: "saves" },
  { test: /member/i, name: "Members", slug: "members" },
  { test: /vote|poll/i, name: "Votes", slug: "votes" },
  { test: /review/i, name: "Reviews", slug: "reviews" },
  { test: /impression/i, name: "Impressions", slug: "impressions" },
  { test: /reach/i, name: "Reach", slug: "reach" },
  { test: /traffic|visit/i, name: "Traffic", slug: "traffic" },
];

export function looksLikeProviderCategory(name: string) {
  return PROVIDER_NOISE.test(name);
}

export function cleanCategoryLabel(name: string) {
  const cleaned = String(name || "")
    .replace(/resellers?mm/gi, "")
    .replace(/\bprovider\b/gi, "")
    .replace(/\[[^\]]*(task|farm)[^\]]*\]/gi, "")
    .replace(/imported from .+/gi, "")
    .replace(/[|·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

export function publicCategoryName(name: string) {
  if (looksLikeProviderCategory(name)) {
    const inferred = SERVICE_TYPES.find((type) => type.test.test(name));
    return inferred?.name || "Other";
  }
  return cleanCategoryLabel(name) || "Other";
}

export function publicProductDescription(description?: string | null) {
  if (!description) return null;
  const text = description.replace(/\s*·?\s*imported from .+$/i, "").trim();
  if (!text || looksLikeProviderCategory(text)) return null;
  return text;
}

/** Strip provider decorative wrappers (dashed lines, arrows, tildes) from service titles. */
export function publicProductName(name?: string | null) {
  const original = String(name ?? "").trim();
  if (!original) return "";
  let cleaned = original
    .replace(/[↓↑➤►◀▶★☆✦✧✔✅✨🔹◄▼▲➔➜➡⬅⬆⬇⇨⇦⇧⇩]+/g, " ")
    .replace(/[-_=~•·~—–−]{3,}/g, " ")
    .replace(/[~]{2,}/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || original;
}

export function detectServiceCategory(panelCategory: string, serviceName: string) {
  const fromName = SERVICE_TYPES.find((type) => type.test.test(serviceName));
  if (fromName) return fromName;
  const fromPanel = SERVICE_TYPES.find((type) => type.test.test(panelCategory));
  if (fromPanel) return fromPanel;
  if (!looksLikeProviderCategory(panelCategory)) {
    const cleaned = cleanCategoryLabel(panelCategory).slice(0, 40);
    if (cleaned.length >= 2) {
      return { name: cleaned, slug: makeSlug(cleaned).slice(0, 70) || "other" };
    }
  }
  return { name: "Other", slug: "other" };
}
