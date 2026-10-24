import { cn } from "@/utils/cn";

export function RefillBadge({
  supported,
  days,
  display,
  className,
}: {
  supported?: boolean;
  days?: number;
  display?: string;
  className?: string;
}) {
  if (display === "not_supported" || supported === false) {
    return (
      <span className={cn("inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800", className)}>
        No refill
      </span>
    );
  }
  const labels: Record<string, string> = {
    available: days ? `${days} day refill` : "Refill available",
    requested: "Refill requested",
    processing: "Refill processing",
    completed: "Refill completed",
    failed: "Refill failed",
    expired: "Refill expired",
    used: "Refill used",
  };
  const tones: Record<string, string> = {
    available: "bg-emerald-100 text-emerald-800",
    requested: "bg-amber-100 text-amber-800",
    processing: "bg-orange-100 text-orange-800",
    completed: "bg-emerald-100 text-emerald-800",
    failed: "bg-rose-100 text-rose-800",
    expired: "bg-slate-200 text-slate-600",
    used: "bg-sky-100 text-sky-800",
  };
  const key = display || "available";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", tones[key] || tones.available, className)}>
      ↻ {labels[key] || "Refill"}
    </span>
  );
}
