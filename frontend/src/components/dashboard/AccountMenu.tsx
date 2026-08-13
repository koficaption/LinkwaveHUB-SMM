import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, MessageCircle, Send, Headphones } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { money } from "@/api/client";
import { usePublicSettings } from "@/components/ContactLinks";
import { cn } from "@/utils/cn";

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

export function SupportFabs() {
  const settings = usePublicSettings();
  const [chatOpen, setChatOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const s = settings.data;

  const whatsapp = waLink(s?.whatsappNumber);
  const telegram = s?.channels?.find((c) => /telegram|channel/i.test(`${c.kind || ""} ${c.name}`))?.url
    || s?.channels?.find((c) => /t\.me|telegram/i.test(c.url))?.url;

  useEffect(() => {
    if (!chatOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setChatOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [chatOpen]);

  if (!s) return null;

  const chatItems = [
    s.supportEmail ? { href: `mailto:${s.supportEmail}`, label: "Email", detail: s.supportEmail } : null,
    s.contactPhone ? { href: `tel:${s.contactPhone}`, label: "Call", detail: s.contactPhone } : null,
    whatsapp ? { href: whatsapp, label: "WhatsApp", detail: s.whatsappNumber } : null,
    ...(s.channels ?? []).map((c) => ({ href: c.url, label: c.name, detail: c.kind })),
  ].filter(Boolean) as { href: string; label: string; detail?: string }[];

  if (!whatsapp && !telegram && !chatItems.length) return null;

  return (
    <div ref={root} className="pointer-events-none fixed inset-x-4 bottom-5 z-40 flex items-end justify-between lg:inset-x-auto lg:right-5 lg:justify-end">
      <div className="pointer-events-auto relative lg:hidden">
        <ChatButton open={chatOpen} onToggle={() => setChatOpen((v) => !v)} items={chatItems} align="left" />
      </div>
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            title="WhatsApp"
            className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-fab"
          >
            <MessageCircle className="h-6 w-6" />
            <span className="pointer-events-none absolute right-14 hidden rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 lg:block">WhatsApp</span>
          </a>
        )}
        {telegram && (
          <a
            href={telegram}
            target="_blank"
            rel="noreferrer"
            title="Telegram"
            className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-fab"
          >
            <Send className="h-5 w-5" />
            <span className="pointer-events-none absolute right-14 hidden rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 lg:block">Telegram</span>
          </a>
        )}
        <div className="hidden lg:block">
          <ChatButton open={chatOpen} onToggle={() => setChatOpen((v) => !v)} items={chatItems} align="right" />
        </div>
      </div>
    </div>
  );
}

function ChatButton({
  open,
  onToggle,
  items,
  align,
}: {
  open: boolean;
  onToggle: () => void;
  items: { href: string; label: string; detail?: string }[];
  align: "left" | "right";
}) {
  return (
    <div className="relative">
      {open && (
        <div className={cn("absolute bottom-16 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900", align === "right" ? "right-0" : "left-0")}>
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">How can we help?</p>
          <div className="p-2">
            {items.map((item) => (
              <a
                key={`${item.label}-${item.href}`}
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
              >
                <span className="font-semibold">{item.label}</span>
                {item.detail && <span className="truncate text-xs text-muted">{item.detail}</span>}
              </a>
            ))}
            <Link to="/app/support" className="mt-1 block rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              Open support tickets
            </Link>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label={open ? "Close live chat" : "Open live chat"}
        title="Live chat"
        onClick={onToggle}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-fab hover:bg-brand-700"
      >
        <Headphones className="h-6 w-6" />
      </button>
    </div>
  );
}
