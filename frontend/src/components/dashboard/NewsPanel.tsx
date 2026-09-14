import { useState } from "react";
import { Newspaper } from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, formatDate } from "@/api/client";
import { ConfirmDialog, EmptyState, Skeleton } from "@/components/ui";
import { LinkedText } from "@/components/dashboard/LoginAnnouncement";
import { safeHttpUrl } from "@/utils/httpUrl";
import { isUnreadNote, useNotifications } from "@/hooks/useNotifications";

export function NewsPanel() {
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const notes = useNotifications();
  const removing = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Notification deleted");
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not delete notification"),
  });

  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-center gap-2 bg-brand-600 px-4 py-3 text-white">
        <Newspaper className="h-5 w-5" />
        <h2 className="font-bold">Latest News</h2>
      </div>
      <div className="max-h-[28rem] overflow-y-auto p-4">
        {notes.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {!notes.isLoading && !notes.data?.length && (
          <EmptyState title="You're all caught up" body="No announcements yet. New updates from the team will show up here." />
        )}
        <ul className="space-y-4">
          {notes.data?.map((n) => (
            <li key={n.id} className={`rounded-xl p-3 ${isUnreadNote(n) ? "bg-brand-50 dark:bg-brand-500/10" : "bg-slate-50 dark:bg-slate-800"}`}>
              <div className="flex items-start justify-between gap-3">
                {n.created_at ? (
                  <p className="mb-2 inline-flex rounded-full bg-brand-600/90 px-3 py-1 text-xs font-semibold text-white">
                    {formatDate(n.created_at)}
                    {isUnreadNote(n) ? " · New" : ""}
                  </p>
                ) : <span />}
                <button type="button" className="shrink-0 text-sm font-semibold text-rose-600" onClick={() => setConfirmId(n.id)}>
                  Delete
                </button>
              </div>
              <p className="font-semibold text-slate-900 dark:text-white">{n.title}</p>
              <LinkedText text={n.body ?? ""} className="mt-1 text-sm text-muted" />
              {safeHttpUrl(n.metadata?.linkUrl) ? (
                <a href={safeHttpUrl(n.metadata?.linkUrl)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand-700">
                  {n.metadata?.linkLabel || "Join channel"}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        {!!notes.data?.length && (
          <Link to="/app/notifications" className="mt-4 inline-block text-sm font-semibold text-brand-700">
            View all notifications
          </Link>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Delete notification"
        body="Remove this notification from your inbox."
        danger
        confirmLabel={removing.isPending ? "Deleting…" : "Delete"}
        onClose={() => { if (!removing.isPending) setConfirmId(null); }}
        onConfirm={() => { if (confirmId && !removing.isPending) removing.mutate(confirmId); }}
      />
    </section>
  );
}
