import { makeSlug } from "../utils.js";

const PROVIDER_NOISE = /resellers?mm|\bprovider\b|task\s*\/\s*farm|smm\s*panel|wholesale\s*panel/i;
const UNAVAILABLE = /not\s*available|unavailable|out\s*of\s*stock|do\s*not\s*order|don'?t\s*order/i;
const GENERIC_ONLY = /^(like|likes|subscribers?|members?|followers?|views?|comments?)$/i;

export const CANONICAL_CATEGORIES: { name: string; slug: string; sort: number; test: RegExp }[] = [
  { name: "Followers", slug: "followers", sort: 10, test: /follower|\bfollow\b/i },
  { name: "Likes", slug: "likes", sort: 20, test: /\blikes?\b|\blikers\b/i },
  { name: "Views", slug: "views", sort: 30, test: /view|watch|play/i },
  { name: "Comments", slug: "comments", sort: 40, test: /comment/i },
  { name: "Shares", slug: "shares", sort: 50, test: /share|repost|retweet/i },
  { name: "Subscribers", slug: "subscribers", sort: 60, test: /subscriber/i },
  { name: "Stories", slug: "stories", sort: 70, test: /stor(?:y|ies)/i },
  { name: "Live Stream", slug: "live", sort: 80, test: /\blive\b/i },
  { name: "Saves", slug: "saves", sort: 90, test: /save|bookmark/i },
  { name: "Members", slug: "members", sort: 100, test: /member/i },
  { name: "Votes", slug: "votes", sort: 110, test: /vote|poll/i },
  { name: "Reviews", slug: "reviews", sort: 120, test: /review/i },
  { name: "Impressions", slug: "impressions", sort: 130, test: /impression/i },
  { name: "Reach", slug: "reach", sort: 140, test: /reach/i },
  { name: "Traffic", slug: "traffic", sort: 150, test: /traffic|visit/i },
  { name: "Other", slug: "other", sort: 900, test: /.^/ },
];

const SERVICE_TYPES = CANONICAL_CATEGORIES.filter((type) => type.slug !== "other");

export const PLATFORM_RULES: { test: RegExp; name: string; slug: string; icon: string; color: string }[] = [
  { test: /tiktok/i, name: "TikTok", slug: "tiktok", icon: "Music2", color: "#111111" },
  { test: /instagram|\big\b/i, name: "Instagram", slug: "instagram", icon: "Instagram", color: "#E1306C" },
  { test: /youtube|\byt\b/i, name: "YouTube", slug: "youtube", icon: "Youtube", color: "#FF0000" },
  { test: /facebook|\bfb\b/i, name: "Facebook", slug: "facebook", icon: "Facebook", color: "#1877F2" },
  { test: /twitter|\bx\b/i, name: "X", slug: "x", icon: "Twitter", color: "#0F1419" },
  { test: /telegram/i, name: "Telegram", slug: "telegram", icon: "Send", color: "#229ED9" },
  { test: /spotify/i, name: "Spotify", slug: "spotify", icon: "Music", color: "#1DB954" },
  { test: /threads/i, name: "Threads", slug: "threads", icon: "AtSign", color: "#000000" },
  { test: /snapchat/i, name: "Snapchat", slug: "snapchat", icon: "Smile", color: "#FFFC00" },
  { test: /linkedin/i, name: "LinkedIn", slug: "linkedin", icon: "Globe", color: "#0A66C2" },
  { test: /whatsapp/i, name: "WhatsApp", slug: "whatsapp", icon: "MessageCircle", color: "#25D366" },
  { test: /discord/i, name: "Discord", slug: "discord", icon: "MessageCircle", color: "#5865F2" },
  { test: /twitch/i, name: "Twitch", slug: "twitch", icon: "Eye", color: "#9146FF" },
  { test: /pinterest/i, name: "Pinterest", slug: "pinterest", icon: "Heart", color: "#E60023" },
  { test: /reddit/i, name: "Reddit", slug: "reddit", icon: "Globe", color: "#FF4500" },
  { test: /soundcloud/i, name: "SoundCloud", slug: "soundcloud", icon: "Music", color: "#FF5500" },
  { test: /audiomack/i, name: "Audiomack", slug: "audiomack", icon: "Music", color: "#FFA200" },
  { test: /apple music/i, name: "Apple Music", slug: "apple-music", icon: "Music", color: "#FA243C" },
  { test: /deezer/i, name: "Deezer", slug: "deezer", icon: "Music", color: "#A238FF" },
  { test: /kick\b/i, name: "Kick", slug: "kick", icon: "Eye", color: "#53FC18" },
  { test: /rumble/i, name: "Rumble", slug: "rumble", icon: "Youtube", color: "#85C742" },
  { test: /likee/i, name: "Likee", slug: "likee", icon: "Music2", color: "#FF1C6C" },
  { test: /kwai/i, name: "Kwai", slug: "kwai", icon: "Music2", color: "#FF4906" },
  { test: /netflix/i, name: "Subscriptions", slug: "subscriptions", icon: "Globe", color: "#E50914" },
  { test: /website|traffic|seo|visit/i, name: "Website Traffic", slug: "website-traffic", icon: "Globe", color: "#0D9488" },
];

export const OTHER_PLATFORM = { name: "Other", slug: "other", icon: "Globe", color: "#0D9488" };

export function isCanonicalCategorySlug(slug?: string | null) {
  return CANONICAL_CATEGORIES.some((type) => type.slug === slug);
}

export function looksLikeProviderCategory(name: string) {
  return PROVIDER_NOISE.test(name) || /\[(egypt|usa|canada|nigeria|brazil|uk|japan|germany)\]/i.test(name);
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
  const cleaned = cleanCategoryLabel(name);
  const slug = makeSlug(cleaned).slice(0, 70);
  const canonical = CANONICAL_CATEGORIES.find(
    (type) => type.slug === slug || type.name.toLowerCase() === cleaned.toLowerCase()
  );
  if (canonical) return canonical.name;
  return earliestServiceType(`${name} ${cleaned}`)?.name || "Other";
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

export function isUnavailableServiceName(name?: string | null) {
  const cleaned = publicProductName(name);
  return UNAVAILABLE.test(cleaned) || GENERIC_ONLY.test(cleaned);
}

export function isSellableProductName(name?: string | null) {
  const cleaned = publicProductName(name);
  return /[A-Za-z]{3,}/.test(cleaned) && !isUnavailableServiceName(cleaned);
}

function earliestServiceType(text: string) {
  let best: { name: string; slug: string; sort: number; index: number } | null = null;
  for (const type of SERVICE_TYPES) {
    const match = type.test.exec(text);
    if (!match || match.index == null) continue;
    if (!best || match.index < best.index) {
      best = { name: type.name, slug: type.slug, sort: type.sort, index: match.index };
    }
  }
  return best;
}

export function detectServiceCategory(panelCategory: string, serviceName: string) {
  const fromName = earliestServiceType(serviceName);
  if (fromName) return { name: fromName.name, slug: fromName.slug, sort: fromName.sort };
  const fromPanel = earliestServiceType(panelCategory);
  if (fromPanel) return { name: fromPanel.name, slug: fromPanel.slug, sort: fromPanel.sort };
  return { name: "Other", slug: "other", sort: 900 };
}

/** Prefer the platform named in the service title so "Twitter Followers" is never filed under TikTok. */
export function detectPlatform(category: string, name: string) {
  const fromName = PLATFORM_RULES.find((rule) => rule.test.test(name));
  if (fromName) return fromName;
  const fromCategory = PLATFORM_RULES.find((rule) => rule.test.test(category));
  if (fromCategory) return fromCategory;
  return OTHER_PLATFORM;
}

export function looksLikePerUnitProduct(name: string, minQty: number, maxQty: number) {
  return minQty <= 10 && maxQty <= 100 && /netflix/i.test(name);
}
