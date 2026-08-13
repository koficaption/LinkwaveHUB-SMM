import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { money } from "@/api/client";
import { usePublicSettings } from "@/components/ContactLinks";

function digits(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function waLink(value?: string) {
  const n = digits(value);
  return n ? `https://wa.me/${n}` : undefined;
}

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
  const items = [
    { to: "/app/profile", label: "Profile" },
    { to: "/app/wallet", label: "Wallet" },
    { to: "/app/wallet", label: "Transactions" },
    { to: "/app/api", label: "API Developer" },
    ...(me.user.role === "reseller" || me.user.role === "admin"
      ? [{ to: "/app/reseller", label: "Reseller Dashboard" }]
      : [{ to: "/app/become-reseller", label: "Child Panels" }]),
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
              navigate("/");
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
  const balance = me?.wallet?.available_balance ?? me?.wallet?.balance;
  return (
    <Link
      to="/app/wallet"
      className="inline-flex h-10 items-center gap-1 rounded-full bg-brand-600 px-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
      title="Wallet balance"
    >
      {money(balance)}
      <ChevronDown className="h-4 w-4 opacity-80" />
    </Link>
  );
}

export function MobileActionButtons() {
  const settings = usePublicSettings();
  const channel = settings.data?.channels?.find((c) => /whatsapp|channel|telegram/i.test(`${c.kind} ${c.name}`))
    ?? settings.data?.channels?.[0];
  const whatsapp = waLink(settings.data?.whatsappNumber) || channel?.url;

  return (
    <div className="grid grid-cols-2 gap-3 lg:hidden">
      <a
        href={whatsapp || "/app/support"}
        target={whatsapp ? "_blank" : undefined}
        rel="noreferrer"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 text-sm font-bold text-white shadow-sm"
      >
        <MessageCircle className="h-5 w-5" />
        WhatsApp Channel
      </a>
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
