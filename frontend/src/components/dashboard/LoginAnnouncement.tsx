import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, Send, Youtube } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui";
import type { PublicSettings } from "@/types";
import { channelKindFromUrl, safeHttpUrl } from "@/utils/httpUrl";

type Note = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  is_read?: boolean;
  metadata?: {
    popup?: boolean;
    linkUrl?: string;
    linkLabel?: string;
  } | null;
};

export type Announcement = {
  id?: string;
  title: string;
  body: string;
  url?: string;
  button: string;
};

const STANDING_SEEN_PREFIX = "lbg.login-popup-seen:";

function standingSeen(userId: string) {
  try {
    return sessionStorage.getItem(`${STANDING_SEEN_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

function markStandingSeen(userId: string) {
  try {
    sessionStorage.setItem(`${STANDING_SEEN_PREFIX}${userId}`, "1");
  } catch {
    /* ignore */
  }
}

function wantsPopup(note: Note) {
  if (note.is_read) return false;
  if (note.type !== "admin" && note.type !== "broadcast") return false;
  return note.metadata?.popup !== false;
}

export function LinkedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, index) => {
        const href = safeHttpUrl(part.replace(/[),.;]+$/, ""));
        if (href) {
          return (
            <a key={`${href}-${index}`} href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline dark:text-brand-300">
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

function ChannelIcon({ url }: { url?: string }) {
  const kind = url ? channelKindFromUrl(url) : "channel";
  const Icon = kind === "youtube" ? Youtube : kind === "telegram" ? Send : MessageCircle;
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
      <Icon className="h-7 w-7" />
    </span>
  );
}

export function AnnouncementModal({
  item,
  onClose,
  onPrimary,
}: {
  item: Announcement;
  onClose: () => void;
  onPrimary?: () => void;
}) {
  const primary = onPrimary ?? onClose;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-label="Close announcement" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-8 pt-6 text-white">
          <ChannelIcon url={item.url} />
          <h3 className="mt-4 text-xl font-extrabold leading-snug">{item.title}</h3>
        </div>
        <div className="space-y-5 px-6 py-5">
          <LinkedText text={item.body} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>Maybe later</Button>
            {item.url ? (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={primary}>{item.button}</Button>
            ) : (
              <Button onClick={primary}>{item.button}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginAnnouncement() {
  const { me } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const onAdmin = location.pathname.startsWith("/admin");
  const settings = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api<PublicSettings>("/settings/public"),
    enabled: Boolean(me && !me.panel),
    refetchInterval: 20_000,
  });
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Note[]>("/notifications"),
    enabled: Boolean(me && !me.panel),
    refetchInterval: 20_000,
  });
  const [item, setItem] = useState<Announcement | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const standing = useMemo(() => {
    const popup = settings.data?.loginPopup;
    const url = safeHttpUrl(popup?.url);
    if (!popup?.enabled || !url) return null;
    return {
      title: popup.title || "Join our channel",
      body: popup.body || "Get updates, promos, and faster support. Tap below to join.",
      url,
      button: popup.button || "Join channel",
    } satisfies Announcement;
  }, [settings.data?.loginPopup]);

  const unreadPopup = useMemo(() => {
    const row = (notes.data ?? []).find((note) => wantsPopup(note) && !dismissedIds.includes(note.id));
    if (!row) return null;
    const url = safeHttpUrl(row.metadata?.linkUrl);
    return {
      id: row.id,
      title: String(row.title || "Announcement"),
      body: String(row.body || ""),
      url: url || undefined,
      button: String(row.metadata?.linkLabel || (url ? "Join channel" : "Got it")),
    } satisfies Announcement;
  }, [notes.data, dismissedIds]);

  useEffect(() => {
    if (!me || me.panel || onAdmin) return;
    if (settings.isLoading || notes.isLoading) return;
    if (item) return;
    if (unreadPopup) {
      setItem(unreadPopup);
      return;
    }
    if (standing && !standingSeen(me.user.id)) setItem(standing);
  }, [me, onAdmin, settings.isLoading, notes.isLoading, unreadPopup, standing, item]);

  useEffect(() => {
    if (!item?.id || notes.isLoading) return;
    if ((notes.data ?? []).some((note) => note.id === item.id)) return;
    setItem(null);
  }, [item, notes.data, notes.isLoading]);

  if (!item || onAdmin) return null;

  const close = async () => {
    const id = item.id;
    if (id) setDismissedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    else if (me) markStandingSeen(me.user.id);
    setItem(null);
    if (id) {
      await api(`/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  const join = async () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
    await close();
  };

  return <AnnouncementModal item={item} onClose={close} onPrimary={join} />;
}
