import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Headphones, LifeBuoy, Mail, MessageCircle, Phone, Send, Users, X } from "lucide-react";
import { api } from "@/api/client";
import type { ChannelLink, PublicSettings } from "@/types";

export type HelpDetails = {
  supportEmail?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  whatsappChannelUrl?: string | null;
  channels?: ChannelLink[];
};

export function usePublicSettings() {
  return useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api<PublicSettings>("/settings/public"),
    staleTime: 60_000,
  });
}

function digits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function waLink(value?: string | null) {
  const n = digits(value);
  return n ? `https://wa.me/${n}` : undefined;
}

function isWhatsAppChannelUrl(url?: string | null) {
  const value = String(url ?? "").trim();
  if (!value) return false;
  return /whatsapp\.com\/channel\//i.test(value) || /whatsapp:\/\/channel/i.test(value);
}

function isWhatsAppChannel(channel: ChannelLink) {
  const blob = `${channel.kind || ""} ${channel.name} ${channel.url}`.toLowerCase();
  if (isWhatsAppChannelUrl(channel.url)) return true;
  return /whatsapp/.test(blob) && /channel/.test(blob) && !/telegram|t\.me/.test(blob);
}

export function whatsappChannelHref(s?: HelpDetails | PublicSettings | null) {
  const direct = String(s?.whatsappChannelUrl ?? "").trim();
  if (direct) return direct;
  const listed = (s?.channels ?? []).find(isWhatsAppChannel);
  if (listed?.url?.trim()) return listed.url.trim();
  return undefined;
}

function isGroup(channel: ChannelLink) {
  const kind = (channel.kind || "").toLowerCase();
  const name = channel.name.toLowerCase();
  return kind === "group" || kind === "community" || /group|community/.test(name);
}

function isChannel(channel: ChannelLink) {
  const kind = (channel.kind || "").toLowerCase();
  const name = channel.name.toLowerCase();
  return kind === "channel" || kind === "telegram" || /channel/.test(name);
}

function isTelegram(channel: ChannelLink) {
  return /telegram|t\.me/i.test(`${channel.kind || ""} ${channel.name} ${channel.url}`);
}

function helpItems(s?: HelpDetails | PublicSettings | null) {
  const channels = s?.channels ?? [];
  const whatsapp = waLink(s?.whatsappNumber);
  const used = new Set<string>();
  const items: { href: string; label: string; detail?: string; icon: React.ReactNode }[] = [];

  const push = (item: { href: string; label: string; detail?: string; icon: React.ReactNode }) => {
    if (!item.href || used.has(item.href)) return;
    used.add(item.href);
    items.push(item);
  };

  if (s?.supportEmail) {
    push({
      href: `mailto:${s.supportEmail}`,
      label: "Email",
      detail: s.supportEmail,
      icon: <Mail className="h-4 w-4" />,
    });
  }
  if (s?.contactPhone) {
    push({
      href: `tel:${s.contactPhone}`,
      label: "Call",
      detail: s.contactPhone,
      icon: <Phone className="h-4 w-4" />,
    });
  }
  if (whatsapp) {
    push({
      href: whatsapp,
      label: "WhatsApp",
      detail: s?.whatsappNumber || undefined,
      icon: <MessageCircle className="h-4 w-4" />,
    });
  }

  const whatsappChannel = whatsappChannelHref(s);
  if (whatsappChannel) {
    push({
      href: whatsappChannel,
      label: "WhatsApp Channel",
      icon: <MessageCircle className="h-4 w-4" />,
    });
  }

  const telegram = channels.find(isTelegram);
  if (telegram) {
    push({
      href: telegram.url,
      label: "Telegram",
      detail: telegram.name,
      icon: <Send className="h-4 w-4" />,
    });
  }

  for (const channel of channels) {
    const group = isGroup(channel);
    push({
      href: channel.url,
      label: group ? "Group" : isChannel(channel) ? "Channel" : channel.name,
      detail: channel.name,
      icon: group ? <Users className="h-4 w-4" /> : <Send className="h-4 w-4" />,
    });
  }
  return items;
}

export function panelHelp(store?: {
  support_email?: string | null;
  contact_phone?: string | null;
  whatsapp_number?: string | null;
} | null): HelpDetails | undefined {
  if (!store) return undefined;
  return {
    supportEmail: store.support_email,
    contactPhone: store.contact_phone,
    whatsappNumber: store.whatsapp_number,
  };
}

export function ContactLinks({
  className = "",
  tone = "dark",
  details,
}: {
  className?: string;
  tone?: "dark" | "light";
  details?: HelpDetails | null;
}) {
  const settings = usePublicSettings();
  const s = details ?? settings.data;
  if (!s) return null;
  const items = helpItems(s).filter((item) => item.label !== "Email");
  const emailClass = tone === "dark" ? "text-white" : "text-slate-800 dark:text-slate-100";
  const linkClass = tone === "dark" ? "text-[#2dd4bf] hover:text-[#5eead4]" : "text-brand-700 hover:underline";
  if (!s.supportEmail && !items.length) return null;
  return (
    <div className={`text-sm ${className}`}>
      {s.supportEmail && (
        <a href={`mailto:${s.supportEmail}`} className={`block font-medium ${emailClass}`}>
          {s.supportEmail}
        </a>
      )}
      {items.length > 0 && (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${s.supportEmail ? "mt-2" : ""}`}>
          {items.map((item) => (
            <a
              key={`${item.label}-${item.href}`}
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 font-medium ${linkClass}`}
            >
              {item.icon}
              {item.label === "Call" || item.label === "Customer service" ? item.detail ?? item.label : item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpBar({
  details,
  hideTickets,
}: {
  details?: HelpDetails | null;
  hideTickets?: boolean;
}) {
  const settings = usePublicSettings();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const s = details !== undefined ? details : settings.data;
  const items = helpItems(s);

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

  if (!items.length && hideTickets) return null;

  return (
    <div ref={root} className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-50 flex flex-col items-end gap-3 sm:right-5">
      {open && (
        <div className="pointer-events-auto w-[min(18.5rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/20 dark:border-slate-700 dark:bg-slate-900">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">
            How can we help?
          </p>
          <div className="p-2">
            {items.map((item) => (
              <a
                key={`${item.label}-${item.href}`}
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{item.label}</span>
                  {item.detail && item.detail !== item.label && (
                    <span className="block truncate text-xs text-slate-500">{item.detail}</span>
                  )}
                </span>
              </a>
            ))}
            {!hideTickets && (
              <Link
                to="/app/support"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                  <LifeBuoy className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">Support tickets</span>
                  <span className="block text-xs text-slate-500">Open a request in your account</span>
                </span>
              </Link>
            )}
            {!items.length && hideTickets && (
              <p className="px-3 py-2 text-sm text-slate-500">This store has not added contact details yet.</p>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-fab hover:bg-brand-700 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3 sm:text-base sm:font-semibold"
      >
        {open ? <X className="h-5 w-5" strokeWidth={2.25} /> : <Headphones className="h-5 w-5" strokeWidth={2.25} />}
        <span className="hidden sm:inline">Help</span>
      </button>
    </div>
  );
}
