import { Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";
import { BRAND_NAME, BRAND_SHORT } from "@/brand";

export function BrandLogo({
  className,
  to = "/",
  withLink = true,
}: {
  className?: string;
  to?: string;
  withLink?: boolean;
  variant?: "light" | "dark";
}) {
  const lockup = (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
        <Rocket className="h-4 w-4" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-extrabold uppercase tracking-wide text-brand-700 dark:text-brand-300 sm:text-[15px]">
          {BRAND_SHORT}
        </span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">SMM</span>
      </span>
      <span className="sr-only">{BRAND_NAME}</span>
    </span>
  );
  if (!withLink) return lockup;
  return (
    <Link to={to} className="inline-flex min-h-11 items-center rounded-xl py-1">
      {lockup}
    </Link>
  );
}
