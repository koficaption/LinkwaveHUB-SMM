import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/utils/cn";

export type OrderOption = {
  value: string;
  label: string;
  badge?: string;
};

const triggerClass =
  "input flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3.5 text-left text-[15px] text-slate-900 disabled:cursor-not-allowed dark:text-slate-100";

export function SearchField({
  value,
  defaultValue,
  onChange,
  onCommit,
  placeholder = "Search",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        className="input h-12 rounded-xl pl-11 pr-4 text-[15px]"
        placeholder={placeholder}
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
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-card dark:border-slate-700 dark:bg-slate-900"
          >
            {clearable ? (
              <SelectOption
                selected={!value}
                onPick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {placeholder}
              </SelectOption>
            ) : null}
            {options.map((option) => (
              <SelectOption
                key={option.value}
                selected={option.value === value}
                onPick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.badge ? <IdBadge>{option.badge}</IdBadge> : null}
                <span className="min-w-0 truncate">{option.label}</span>
              </SelectOption>
            ))}
          </ul>
        )}
      </div>
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
}: {
  selected: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-brand-50 dark:text-slate-100 dark:hover:bg-slate-800",
          selected && "bg-brand-50 font-semibold dark:bg-slate-800"
        )}
        onClick={onPick}
      >
        {children}
      </button>
    </li>
  );
}
