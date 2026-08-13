import { useQuery } from "@tanstack/react-query";
import { Headphones, MessageCircle, Phone, Send, Users } from "lucide-react";
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

export function ContactLinks({ className = "" }: { className?: string }) {
  const settings = usePublicSettings();
  const s = settings.data;
  if (!s) return null;
  const items: { href: string; label: string; icon: React.ReactNode }[] = [];
  if (s.contactPhone) {
    items.push({ href: `tel:${s.contactPhone}`, label: s.contactPhone, icon: <Phone className="h-4 w-4" /> });
  }
  const whatsapp = waLink(s.whatsappNumber);
  if (whatsapp) {
    items.push({ href: whatsapp, label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> });
  }
  for (const ch of s.channels ?? []) {
    items.push({ href: ch.url, label: ch.name, icon: <Send className="h-4 w-4" /> });
  }
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-3 text-sm ${className}`}>
      {items.map((item) => (
        <a
          key={`${item.label}-${item.href}`}
          href={item.href}
          target={item.href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
        >
          {item.icon}
          {item.label}
        </a>
      ))}
    </div>
  );
}

export function HelpBar() {
  const settings = usePublicSettings();
  const s = settings.data;
  if (!s) return null;
  const channels = s.channels ?? [];
  const group = channels.find(isGroup);
  const channel = channels.find((item) => isChannel(item) && item.url !== group?.url) ?? channels.find(isChannel);
  const whatsapp = waLink(s.whatsappNumber);
  const items: { href: string; label: string; detail?: string; icon: React.ReactNode }[] = [];
  if (s.contactPhone) {
    items.push({
      href: `tel:${s.contactPhone}`,
      label: "Customer service",
      detail: s.contactPhone,
      icon: <Phone className="h-4 w-4" />,
    });
  }
  if (group) {
    items.push({ href: group.url, label: "Group", detail: group.name, icon: <Users className="h-4 w-4" /> });
  }
  if (channel) {
    items.push({ href: channel.url, label: "Channel", detail: channel.name, icon: <Send className="h-4 w-4" /> });
  }
  if (whatsapp && !items.some((item) => item.href === whatsapp)) {
    items.push({ href: whatsapp, label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> });
  }
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3">
      <div className="pointer-events-auto mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/95 px-3 py-2 text-white shadow-2xl shadow-black/40 backdrop-blur">
        <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Headphones className="h-3.5 w-3.5" />
          Help
        </span>
        {items.map((item) => (
          <a
            key={`${item.label}-${item.href}`}
            href={item.href}
            target={item.href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
          >
            {item.icon}
            <span>{item.label}</span>
            {item.detail && item.detail !== item.label && (
              <span className="hidden text-xs font-medium text-slate-300 sm:inline">{item.detail}</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
