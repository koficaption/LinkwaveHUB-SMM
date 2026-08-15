const STORAGE_KEY = "lwh_panel";

export function normalizePanelSlug(slug?: string | null) {
  if (!slug) return "";
  const cleaned = slug.trim().toLowerCase().replace(/^\/store\//, "").split(/[/?#]/)[0];
  if (!/^[a-z0-9-]{2,80}$/.test(cleaned)) return "";
  return cleaned;
}

export function persistPanelSlug(slug: string) {
  const value = normalizePanelSlug(slug);
  if (!value) return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function storedPanelSlug() {
  try {
    return normalizePanelSlug(localStorage.getItem(STORAGE_KEY) || "") || undefined;
  } catch {
    return undefined;
  }
}

export function activeStoreSlug(search = window.location.search, pathname = window.location.pathname) {
  const params = new URLSearchParams(search);
  return (
    normalizePanelSlug(params.get("store")) ||
    normalizePanelSlug(params.get("storeSlug")) ||
    normalizePanelSlug(pathname.match(/^\/store\/([a-z0-9-]{2,80})/i)?.[1] || "") ||
    undefined
  );
}

export function registerStoreSlug() {
  return activeStoreSlug() || storedPanelSlug();
}

export function panelAuthPath(path: "/login" | "/register", slug?: string) {
  const value = normalizePanelSlug(slug) || activeStoreSlug() || storedPanelSlug();
  return value ? `${path}?store=${encodeURIComponent(value)}` : path;
}
