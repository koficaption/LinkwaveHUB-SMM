import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Category, Platform } from "@/types";
import { publicCategoryName, isProviderCategory } from "@/utils/catalog";
import { OrderSelect, SearchField } from "@/components/dashboard/OrderSelect";

function resolvePlatform(platforms: Platform[], value: string) {
  return platforms.find((p) => p.id === value || p.slug === value);
}

export function categoryMatchesPlatform(category: Category, platformValue: string, platforms: Platform[]) {
  if (!platformValue) return true;
  const platform = resolvePlatform(platforms, platformValue);
  const counts = category.platform_counts || {};
  if (platform) {
    const onPlatform = Number(counts[platform.id] ?? counts[platform.slug] ?? 0);
    if (onPlatform > 0) return true;
    const linkedIds = Array.isArray(category.platform_ids) ? category.platform_ids.map(String) : [];
    // Empty brand categories (Netflix with no products yet) stay on the platforms they were linked to.
    return onPlatform === 0 && Object.keys(counts).length === 0
      && (linkedIds.includes(platform.id) || linkedIds.includes(platform.slug));
  }
  return Number(counts[platformValue] ?? 0) > 0;
}

export function ServiceCatalogFilters({
  search,
  platform,
  category,
  platforms,
  categories,
  useIds = false,
  showCounts = false,
  hideCategoryIfSingle = false,
  onSearchChange,
  onSearchCommit,
  onPlatform,
  onCategory,
}: {
  search: string;
  platform: string;
  category: string;
  platforms: Platform[];
  categories: Category[];
  useIds?: boolean;
  showCounts?: boolean;
  hideCategoryIfSingle?: boolean;
  onSearchChange?: (value: string) => void;
  onSearchCommit?: (value: string) => void;
  onPlatform: (value: string) => void;
  onCategory: (value: string) => void;
}) {
  const optionValue = (item: { id: string; slug: string }) => (useIds ? item.id : item.slug || item.id);
  const visiblePlatforms = [...platforms]
    .filter((p) => Number(p.product_count ?? 1) > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const visibleCategories = [...categories]
    .filter((c) => !isProviderCategory(c.name) && categoryMatchesPlatform(c, platform, platforms))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const showType = platform
    ? (!hideCategoryIfSingle || visibleCategories.length > 1)
    : !hideCategoryIfSingle;

  return (
    <div className="flex flex-col gap-4">
      {onSearchChange ? (
        <SearchField value={search} onChange={onSearchChange} onCommit={onSearchCommit} />
      ) : (
        <SearchField key={search} defaultValue={search} onCommit={onSearchCommit} />
      )}
      <OrderSelect
        label="Category"
        value={platform}
        onChange={onPlatform}
        placeholder="Select a category"
        leadingCheck
        options={visiblePlatforms.map((p) => ({ value: optionValue(p), label: p.name }))}
      />
      {showType ? (
        <OrderSelect
          label="Type"
          value={category}
          onChange={onCategory}
          placeholder="All types"
          options={visibleCategories.map((c) => {
            const plat = resolvePlatform(platforms, platform);
            const count = plat
              ? Number(c.platform_counts?.[plat.id] ?? c.platform_counts?.[plat.slug] ?? 0)
              : Number(c.product_count ?? 0);
            return {
              value: optionValue(c),
              label: `${publicCategoryName(c.name)}${showCounts && count ? ` (${count.toLocaleString()})` : ""}`,
            };
          })}
        />
      ) : null}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  label,
  children,
  disabled,
  showLabel = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <label className="block">
      {showLabel ? <span className="label">{label}</span> : <span className="sr-only">{label}</span>}
      <div className="relative">
        <select
          aria-label={label}
          className={`input h-12 appearance-none rounded-xl px-3.5 pr-11 text-[15px] ${value ? "border-brand-600 bg-white" : ""}`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    </label>
  );
}
