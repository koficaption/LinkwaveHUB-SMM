import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronDown, LogOut, MessageCircle, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicSettings, whatsappChannelHref } from "@/components/ContactLinks";
import { useDisplayCurrency } from "@/contexts/CurrencyContext";
import { cn } from "@/utils/cn";

export function AccountMenu() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;
  const panel = Boolean(me.panel);
  const items = [
    { to: "/app/profile", label: "Profile" },
    { to: "/app/wallet", label: "Wallet" },
    { to: "/app/wallet", label: "Transactions" },
    ...(!panel ? [{ to: "/app/api", label: "API Developer" }] : []),
    ...(me.user.role === "reseller" || me.user.role === "admin"
      ? [{ to: "/app/reseller", label: "Reseller Dashboard" }]
      : []),
    ...(!panel ? [{ to: "/app/child-panels", label: "Child Panels" }] : []),
    { to: "/app/profile", label: "Settings" },
  ];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        Account
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-card dark:border-slate-700 dark:bg-slate-900">
          {items.map((item) => (
            <Link
              key={`${item.to}-${item.label}`}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate(me.panel ? `/store/${me.panel.store_slug}` : "/");
            }}
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export function CurrencyButton() {
  const { me } = useAuth();
  const { code, currencies, setCode, formatGhs } = useDisplayCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const balance = me?.wallet?.available_balance ?? me?.wallet?.balance ?? 0;
  const selected = currencies.find((item) => item.code === code) ?? currencies[0];
  const filtered = currencies.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${item.code} ${item.name} ${item.symbol}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div ref={root} className="relative">
      <div className="inline-flex h-10 overflow-hidden rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm">
        <Link
          to="/app/wallet"
          className="inline-flex items-center px-3 hover:bg-brand-700"
          title="Wallet balance"
        >
          {formatGhs(balance)}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Choose display currency"
          title={selected.name}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center border-l border-white/20 px-2 hover:bg-brand-700"
        >
          <ChevronDown className={cn("h-4 w-4 opacity-90 transition", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Display currency</p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search currencies"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.map((item) => {
              const active = item.code === code;
              return (
                <li key={item.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setCode(item.code);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800",
                      active && "bg-brand-50 dark:bg-slate-800"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800 dark:text-slate-100">
                        {item.symbol} {item.code}
                      </span>
                      <span className="block truncate text-xs text-muted">{item.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={cn("font-bold", active ? "text-brand-700" : "text-slate-600 dark:text-slate-300")}>
                        {formatGhs(balance, item.code)}
                      </span>
                      {active && <Check className="h-4 w-4 text-brand-700" />}
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted">No matching currency</li>
            )}
          </ul>
          <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-snug text-muted dark:border-slate-800">
            Wallet, deposits, and orders stay in Ghana cedis. This list only changes how amounts are shown.
          </p>
        </div>
      )}
    </div>
  );
}

export function MobileActionButtons() {
  const settings = usePublicSettings();
  const channelUrl = whatsappChannelHref(settings.data);

  return (
    <div className={cn("grid gap-3 lg:hidden", channelUrl ? "grid-cols-2" : "grid-cols-1")}>
      {channelUrl && (
        <a
          href={channelUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 text-sm font-bold text-white shadow-sm"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp Channel
        </a>
      )}
      <Link
        to="/app/wallet"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-3 text-sm font-bold text-white shadow-sm"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-xs">+</span>
        Make Deposit
      </Link>
    </div>
  );
}
