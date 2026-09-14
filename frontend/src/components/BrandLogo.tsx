import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";
import { BRAND_NAME, BRAND_TAGLINE } from "@/brand";
import { usePublicSettings } from "@/components/ContactLinks";

/** LB monogram with growth arrow — matches the LinkBoost Growth SMM lockup. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="lb-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="55%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id="lb-arrow" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#A3E635" />
        </linearGradient>
        <filter id="lb-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#0F766E" floodOpacity="0.28" />
        </filter>
      </defs>
      <path
        filter="url(#lb-soft)"
        fill="url(#lb-l)"
        d="M10 8c0-1.7 1.3-3 3-3h8c1.7 0 3 1.3 3 3v32H42c1.7 0 3 1.3 3 3v7c0 1.7-1.3 3-3 3H13c-1.7 0-3-1.3-3-3V8Z"
      />
      <path
        filter="url(#lb-soft)"
        fill="#F8FAFC"
        stroke="#0F766E"
        strokeWidth="1.6"
        d="M30 10h12.2c7.4 0 12.3 3.6 12.3 9.4 0 3.6-2 6.3-5.4 7.7 4.4 1.2 7.1 4.3 7.1 8.6 0 6.3-5.4 10.3-13.6 10.3H30V10Zm11.6 16.2c3.4 0 5.4-1.6 5.4-4.1s-2-4-5.5-4H37v8.1h4.6Zm.6 16.4c4 0 6.3-1.8 6.3-4.6s-2.3-4.5-6.4-4.5H37v9.1h5.2Z"
      />
      <path
        fill="url(#lb-arrow)"
        d="M8 54c10 2 22 1 34-8 6-4.5 11-7 16-8.2l-3.2-3.6 12.4 1.2-4.8 11.4-3.1-3.5C52 45 44 50 34 54c-8 3-16 4-26 2Z"
      />
    </svg>
  );
}

function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="min-w-0 leading-none">
      <span className="flex items-center gap-1">
        <span className={cn("font-extrabold tracking-tight text-[#0F766E] dark:text-teal-300", compact ? "text-[15px] sm:text-[17px]" : "text-2xl sm:text-3xl")}>
          Link
        </span>
        <svg viewBox="0 0 20 20" className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-5 w-5")} aria-hidden>
          <g fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round">
            <rect x="1.5" y="7" width="8" height="6" rx="3" transform="rotate(-35 5.5 10)" />
            <rect x="10.5" y="7" width="8" height="6" rx="3" transform="rotate(-35 14.5 10)" />
          </g>
        </svg>
        <span className={cn("font-extrabold tracking-tight text-[#84CC16]", compact ? "text-[15px] sm:text-[17px]" : "text-2xl sm:text-3xl")}>
          Boost
        </span>
      </span>
      <span
        className={cn(
          "mt-0.5 inline-flex items-center rounded-full bg-[#115E59] font-extrabold uppercase tracking-wider text-white",
          compact ? "gap-1 px-2 py-[2px] text-[8px] sm:text-[9px]" : "gap-1.5 px-3 py-1 text-[11px]"
        )}
      >
        Growth
        <span className="h-2.5 w-px bg-white/70" />
        <span className="rounded-full bg-[#84CC16] px-1.5 py-[1px] text-[#14532D]">SMM</span>
      </span>
    </span>
  );
}

export function BrandLogo({
  className,
  to = "/",
  withLink = true,
  variant = "lockup",
}: {
  className?: string;
  to?: string;
  withLink?: boolean;
  variant?: "mark" | "lockup" | "full";
}) {
  const settings = usePublicSettings();
  const customLogo = String(settings.data?.logoUrl || "").trim();

  const lockup = customLogo ? (
    <span className={cn("inline-flex min-w-0 items-center", className)}>
      <img src={customLogo} alt={BRAND_NAME} className={variant === "full" ? "h-16 w-auto sm:h-20" : "h-10 w-auto sm:h-11"} />
      <span className="sr-only">{BRAND_NAME}</span>
    </span>
  ) : (
    <span className={cn("inline-flex min-w-0 items-center", variant === "full" ? "flex-col items-start gap-2" : "gap-2", className)}>
      <span className="inline-flex items-center gap-2">
        <BrandMark className={variant === "full" ? "h-14 w-14 sm:h-16 sm:w-16" : "h-8 w-8 max-[380px]:hidden sm:h-10 sm:w-10"} />
        {variant !== "mark" && <Wordmark compact={variant !== "full"} />}
      </span>
      {variant === "full" && (
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-700 dark:text-teal-300">
          <span className="h-px w-6 bg-brand-500/70" />
          {BRAND_TAGLINE}
          <span className="h-px w-6 bg-brand-500/70" />
        </span>
      )}
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
