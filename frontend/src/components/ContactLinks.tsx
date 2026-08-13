import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Phone, Send } from "lucide-react";
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

export function ContactLinks({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const settings = usePublicSettings();
  const s = settings.data;
  if (!s) return null;
  const channels = s.channels ?? [];
  const group = channels.find(isGroup);
  const channel = channels.find((item) => isChannel(item) && item.url !== group?.url) ?? channels.find(isChannel);
  const whatsapp = waLink(s.whatsappNumber);
  const emailClass = tone === "dark" ? "text-white" : "text-slate-800 dark:text-slate-100";
  const linkClass = tone === "dark" ? "text-[#2dd4bf] hover:text-[#5eead4]" : "text-brand-700 hover:underline";
  const items: { href: string; label: string; icon: React.ReactNode }[] = [];
  if (s.contactPhone) {
    items.push({ href: `tel:${s.contactPhone}`, label: s.contactPhone, icon: <Phone className="h-4 w-4" /> });
  }
  if (whatsapp) {
    items.push({ href: whatsapp, label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> });
  }
  if (channel) {
    items.push({ href: channel.url, label: "Channel", icon: <Send className="h-4 w-4" /> });
  }
  if (group) {
    items.push({ href: group.url, label: "Group", icon: <Send className="h-4 w-4" /> });
  }
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
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
