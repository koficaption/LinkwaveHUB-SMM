import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/utils/cn";

export type OrderOption = {
  value: string;
  label: string;
  badge?: string;
  hint?: string;
};

const triggerClass =
  "input flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3.5 text-left text-[15px] text-slate-900 disabled:cursor-not-allowed dark:text-slate-100";

export function SearchField({
  value,
  defaultValue,
  onChange,
  onCommit,
  placeholder = "Search",
  autoFocus,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        className="input h-12 rounded-xl pl-11 pr-4 text-[15px]"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={onChange ? value : undefined}
        defaultValue={onChange ? undefined : defaultValue}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onBlur={onCommit ? (e) => onCommit(e.target.value) : undefined}
        onKeyDown={onCommit ? (e) => {
          if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value);
        } : undefined}
        aria-label={placeholder}
      />
    </div>
  );
}

function useMobileSheet() {
  const [sheet, setSheet] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setSheet(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return sheet;
}

export function OrderSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  leadingCheck = false,
  clearable = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OrderOption[];
  placeholder: string;
  disabled?: boolean;
  leadingCheck?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const sheet = useMobileSheet();
  const selected = options.find((option) => option.value === value);
  const searchable = options.length >= 8;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) =>
      `${option.badge ?? ""} ${option.label} ${option.hint ?? ""}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || sheet) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, sheet]);

  useEffect(() => {
    if (!open || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  const list = (
    <>
      {searchable ? (
        <div className={cn(sheet ? "px-4 pb-3" : "px-2 pb-2 pt-2")}>
          <SearchField value={query} onChange={setQuery} placeholder={`Search ${label.toLowerCase()}`} autoFocus={sheet} />
        </div>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        className={cn(sheet ? "min-h-0 flex-1 overflow-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]" : "max-h-80 overflow-auto py-1")}
      >
        {clearable ? (
          <SelectOption selected={!value} onPick={() => pick("")} stacked={sheet}>
            {placeholder}
          </SelectOption>
        ) : null}
        {filtered.map((option) => (
          <SelectOption
            key={option.value}
            selected={option.value === value}
            stacked={sheet}
            onPick={() => pick(option.value)}
          >
            {option.badge ? <IdBadge>{option.badge}</IdBadge> : null}
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal leading-snug">{option.label}</span>
              {option.hint ? <span className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{option.hint}</span> : null}
            </span>
          </SelectOption>
        ))}
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-slate-500">No matching {label.toLowerCase()}</li>
        ) : null}
      </ul>
    </>
  );

  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          className={cn(triggerClass, open && "border-brand-600 bg-white", !selected && "text-slate-500")}
          onClick={() => setOpen((current) => !current)}
        >
          {selected && leadingCheck ? (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-600 text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          ) : null}
          {selected?.badge ? <IdBadge>{selected.badge}</IdBadge> : null}
          <span className="min-w-0 flex-1 truncate">{selected?.label || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
        {open && !sheet && (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
            {list}
          </div>
        )}
      </div>
      {open && sheet && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-slate-800">
                <p className="text-lg font-extrabold">{label}</p>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 dark:text-slate-100"
                  onClick={() => setOpen(false)}
                  aria-label={`Close ${label}`}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              {list}
            </div>,
            document.body
          )
        : null}
    </label>
  );
}

function IdBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-bold leading-none text-white">
      {children}
    </span>
  );
}

function SelectOption({
  selected,
  onPick,
  children,
  stacked,
}: {
  selected: boolean;
  onPick: () => void;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={cn(
          "flex w-full items-start gap-2 px-3 text-left text-sm text-slate-800 hover:bg-brand-50 dark:text-slate-100 dark:hover:bg-slate-800",
          stacked ? "min-h-14 py-3" : "py-2.5",
          selected && "bg-brand-50 font-semibold dark:bg-slate-800"
        )}
        onClick={onPick}
      >
        {children}
      </button>
    </li>
  );
}
