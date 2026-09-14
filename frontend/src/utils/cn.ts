import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const statusTone: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  processing: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  in_progress: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  partial: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300",
  cancelled: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  refunded: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  inactive: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  suspended: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  open: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  closed: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  urgent: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  available: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  used: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  expired: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  not_supported: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function prettyStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCount(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}
