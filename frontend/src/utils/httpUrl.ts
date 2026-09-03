export function safeHttpUrl(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 500) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeHttpUrl(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return safeHttpUrl(raw);
  if (raw.startsWith("//")) return safeHttpUrl(`https:${raw}`);
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#]|$)/i.test(raw)) return safeHttpUrl(`https://${raw}`);
  return "";
}

export function channelKindFromUrl(url: string) {
  const value = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(value)) return "youtube";
  if (/whatsapp\.com|wa\.me/.test(value)) return "whatsapp";
  if (/t\.me|telegram/.test(value)) return "telegram";
  return "channel";
}
