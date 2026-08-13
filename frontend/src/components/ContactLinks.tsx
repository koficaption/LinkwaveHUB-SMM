import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Headphones, Mail, MessageCircle, Phone, Send, Users } from "lucide-react";
import { api } from "@/api/client";
import type { ChannelLink, PublicSettings } from "@/types";

export function usePublicSettings() {
  return useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api<PublicSettings>("/settings/public"),
    staleTime: 60_000,
  });
}

function digits(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function waLink(value?: string) {
  const n = digits(value);
  return n ? `https://wa.me/${n}` : undefined;
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

function helpItems(s?: PublicSettings) {
  const channels = s?.channels ?? [];
  const group = channels.find(isGroup);
  const channel = channels.find((item) => isChannel(item) && item.url !== group?.url) ?? channels.find(isChannel);
  const whatsapp = waLink(s?.whatsappNumber);
  const items: { href: string; label: string; detail?: string; icon: React.ReactNode }[] = [];
  if (s?.supportEmail) {
    items.push({
      href: `mailto:${s.supportEmail}`,
      label: "Email",
      detail: s.supportEmail,
      icon: <Mail className="h-4 w-4" />,
    });
  }
  if (s?.contactPhone) {
    items.push({
      href: `tel:${s.contactPhone}`,
      label: "Customer service",
      detail: s.contactPhone,
      icon: <Phone className="h-4 w-4" />,
    });
  }
  if (whatsapp) {
    items.push({ href: whatsapp, label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> });
  }
  if (channel) {
    items.push({ href: channel.url, label: "Channel", detail: channel.name, icon: <Send className="h-4 w-4" /> });
  }
  if (group) {
    items.push({ href: group.url, label: "Group", detail: group.name, icon: <Users className="h-4 w-4" /> });
  }
  return items;
}

export function ContactLinks({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const settings = usePublicSettings();
  const s = settings.data;
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
              {item.label === "Customer service" ? item.detail ?? item.label : item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpBar() {
  const settings = usePublicSettings();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const s = settings.data;
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

  if (!s || !items.length) return null;

  return (
    <div ref={root} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/20 dark:border-slate-700 dark:bg-slate-900">
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
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-green-50 dark:text-slate-200 dark:hover:bg-green-500/10"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00A341] text-white">
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
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full bg-[#00A341] px-5 py-3 text-base font-medium text-white shadow-lg shadow-green-900/25 hover:bg-[#00963c]"
      >
        <Headphones className="h-5 w-5" strokeWidth={2.25} />
        Help
      </button>
    </div>
  );
}
