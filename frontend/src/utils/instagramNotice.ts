export function isInstagramFollowers(product?: {
  name?: string | null;
  platform_name?: string | null;
  category_name?: string | null;
} | null) {
  if (!product) return false;
  const text = `${product.platform_name || ""} ${product.category_name || ""} ${product.name || ""}`;
  return /instagram/i.test(text) && /follower/i.test(text);
}
