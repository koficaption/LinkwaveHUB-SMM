import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Phone, Send } from "lucide-react";
import { api } from "@/api/client";
import type { PublicSettings } from "@/types";

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
