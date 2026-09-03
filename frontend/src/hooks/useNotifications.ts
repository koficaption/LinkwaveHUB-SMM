import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";

export type InboxNote = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  is_read?: boolean | string | null;
  created_at?: string;
  metadata?: {
    popup?: boolean;
    linkUrl?: string;
    linkLabel?: string;
    publicId?: string;
  } | null;
};

export function isUnreadNote(note: { is_read?: boolean | string | null }) {
  return note.is_read !== true && note.is_read !== "t" && note.is_read !== "true";
}

export function unreadNotificationCount(notes?: InboxNote[] | null) {
  return (notes ?? []).filter(isUnreadNote).length;
}

export function useNotifications(enabled = true) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<InboxNote[]>("/notifications"),
    enabled: Boolean(me) && enabled,
    refetchInterval: 20_000,
  });
}
