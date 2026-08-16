import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Category, Platform } from "@/types";
import { publicCategoryName, isProviderCategory } from "@/utils/catalog";

const fieldClass =
  "input h-12 w-full appearance-none rounded-3xl px-4 pr-11 text-base";

function resolvePlatform(platforms: Platform[], value: string) {
  return platforms.find((p) => p.id === value || p.slug === value);
}

export function categoryMatchesPlatform(category: Category, platformValue: string, platforms: Platform[]) {
  if (!platformValue) return true;
  const platform = resolvePlatform(platforms, platformValue);
  const linkedIds = Array.isArray(category.platform_ids) ? category.platform_ids : [];
  if (platform) {
    if (linkedIds.includes(platform.id) || linkedIds.includes(platform.slug)) return true;
    const count = Number(category.platform_counts?.[platform.id] ?? category.platform_counts?.[platform.slug] ?? 0);
    if (category.platform_counts && Object.keys(category.platform_counts).length > 0) return count > 0;
    return linkedIds.length === 0;
  }
  return linkedIds.includes(platformValue) || Number(category.platform_counts?.[platformValue] ?? 0) > 0;
}

export function ServiceCatalogFilters({
  search,
  platform,
  category,
  platforms,
  categories,
  useIds = false,
  showCounts = false,
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

  return (
    <div className="flex flex-col gap-3">
      {onSearchChange ? (
        <input
          className={`${fieldClass} pr-4`}
          placeholder="Search services"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onBlur={onSearchCommit ? (e) => onSearchCommit(e.target.value) : undefined}
          onKeyDown={onSearchCommit ? (e) => {
            if (e.key === "Enter") onSearchCommit((e.target as HTMLInputElement).value);
          } : undefined}
          aria-label="Search services"
        />
      ) : (
        <input
          key={search}
          className={`${fieldClass} pr-4`}
          placeholder="Search services"
          defaultValue={search}
          onBlur={onSearchCommit ? (e) => onSearchCommit(e.target.value) : undefined}
          onKeyDown={onSearchCommit ? (e) => {
            if (e.key === "Enter") onSearchCommit((e.target as HTMLInputElement).value);
          } : undefined}
          aria-label="Search services"
        />
      )}
      <FilterSelect value={platform} onChange={onPlatform} label="All platforms">
        <option value="">All platforms</option>
        {visiblePlatforms.map((p) => (
          <option key={p.id} value={optionValue(p)}>{p.name}</option>
        ))}
      </FilterSelect>
      <FilterSelect value={category} onChange={onCategory} label="All categories">
        <option value="">All categories</option>
        {visibleCategories.map((c) => {
          const plat = resolvePlatform(platforms, platform);
          const count = plat
            ? Number(c.platform_counts?.[plat.id] ?? c.platform_counts?.[plat.slug] ?? c.product_count ?? 0)
            : Number(c.product_count ?? 0);
          return (
            <option key={c.id} value={optionValue(c)}>
              {publicCategoryName(c.name)}{showCounts && count ? ` (${count.toLocaleString()})` : ""}
            </option>
          );
        })}
      </FilterSelect>
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  label,
  children,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        className={`${fieldClass} ${value ? "border-brand-600 bg-white" : ""}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}
