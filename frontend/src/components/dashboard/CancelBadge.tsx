import { cn } from "@/utils/cn";

export function CancelBadge({
  supported,
  className,
}: {
  supported?: boolean;
  className?: string;
}) {
  if (!supported) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
        className
      )}
    >
      Cancel anytime
    </span>
  );
}

export function CancelBar({ supported }: { supported?: boolean }) {
  if (!supported) return null;
  return (
    <div className="rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-900 dark:bg-sky-500/15 dark:text-sky-200">
      Cancel anytime — you can stop this service after the order starts.
    </div>
  );
}
