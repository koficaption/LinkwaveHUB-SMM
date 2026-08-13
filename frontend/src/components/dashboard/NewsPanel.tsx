import { Newspaper } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, formatDate } from "@/api/client";
import { EmptyState, Skeleton } from "@/components/ui";

type Note = {
  id: string;
  title: string;
  body: string;
  created_at?: string;
  is_read?: boolean;
};

export function NewsPanel() {
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Note[]>("/notifications"),
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
            <li key={n.id} className="rounded-xl bg-brand-50/70 p-3 dark:bg-slate-800">
              {n.created_at && (
                <p className="mb-2 inline-flex rounded-full bg-brand-600/90 px-3 py-1 text-xs font-semibold text-white">
                  {formatDate(n.created_at)}
                </p>
              )}
              <p className="font-semibold text-slate-900 dark:text-white">{n.title}</p>
              <p className="mt-1 text-sm text-muted">{n.body}</p>
            </li>
          ))}
        </ul>
        {!!notes.data?.length && (
          <Link to="/app/notifications" className="mt-4 inline-block text-sm font-semibold text-brand-700">
            View all notifications
          </Link>
        )}
      </div>
    </section>
  );
}
