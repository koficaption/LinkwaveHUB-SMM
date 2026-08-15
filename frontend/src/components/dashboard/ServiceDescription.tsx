import { AlertTriangle } from "lucide-react";
import type { Product } from "@/types";
import { orderGuide } from "@/utils/orderGuide";

export function ServiceDescription({ product }: { product?: Product }) {
  if (!product) {
    return (
      <div className="rounded-2xl bg-brand-50 px-4 py-5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Select a service to read the link type, refill, and notes before you order.
      </div>
    );
  }

  const guide = orderGuide(product);
  return (
    <div className="rounded-2xl bg-brand-50 px-4 py-5 text-sm leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      <p className="flex items-start gap-2 text-[15px] font-bold text-brand-800 dark:text-brand-200">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
        Please Read Before Ordering
      </p>
      <ul className="mt-3 space-y-1">
        {guide.facts.map((row) => (
          <li key={row.label}>
            - <span className="font-semibold">{row.label}:</span> {row.value}
          </li>
        ))}
      </ul>
      {guide.notes.length > 0 && (
        <div className="mt-4">
          <p className="font-bold">Notes:</p>
          <ul className="mt-1.5 space-y-1">
            {guide.notes.map((note) => (
              <li key={note}>- {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
