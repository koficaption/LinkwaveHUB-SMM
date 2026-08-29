import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Youtube } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { JUST_LOGGED_IN_KEY, clearJustLoggedIn } from "@/api/token";
import { usePublicSettings } from "@/components/ContactLinks";
import { Button } from "@/components/ui";
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

type Announcement = {
  id?: string;
  title: string;
  body: string;
  url?: string;
  button: string;
};

function consumeJustLoggedIn(userId: string) {
  try {
    return sessionStorage.getItem(JUST_LOGGED_IN_KEY) === userId;
  } catch {
    return false;
  }
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

export function LoginAnnouncement() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const settings = usePublicSettings();
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Note[]>("/notifications"),
    enabled: Boolean(me && me.user.role !== "admin" && !me.panel),
  });
  const [item, setItem] = useState<Announcement | null>(null);

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
    const row = (notes.data ?? []).find((note) => {
      if (note.is_read) return false;
      if (note.metadata?.popup !== true) return false;
      return note.type === "admin" || note.type === "broadcast";
    });
    if (!row) return null;
    const url = safeHttpUrl(row.metadata?.linkUrl);
    return {
      id: row.id,
      title: String(row.title || "Announcement"),
      body: String(row.body || ""),
      url: url || undefined,
      button: String(row.metadata?.linkLabel || (url ? "Join channel" : "Got it")),
    } satisfies Announcement;
  }, [notes.data]);

  useEffect(() => {
    if (!me || me.user.role === "admin" || me.panel) return;
    if (settings.isLoading || notes.isLoading) return;
    if (item) return;
    if (!consumeJustLoggedIn(me.user.id)) return;
    const next = unreadPopup || standing;
    if (next) setItem(next);
    else clearJustLoggedIn();
  }, [me, settings.isLoading, notes.isLoading, unreadPopup, standing, item]);

  if (!item) return null;

  const close = async () => {
    const id = item.id;
    setItem(null);
    clearJustLoggedIn();
    if (id) {
      await api(`/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  const join = async () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
    await close();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={close} aria-label="Close announcement" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-8 pt-6 text-white">
          <ChannelIcon url={item.url} />
          <h3 className="mt-4 text-xl font-extrabold leading-snug">{item.title}</h3>
        </div>
        <div className="space-y-5 px-6 py-5">
          <LinkedText text={item.body} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close}>Maybe later</Button>
            {item.url ? (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={join}>{item.button}</Button>
            ) : (
              <Button onClick={close}>{item.button}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
