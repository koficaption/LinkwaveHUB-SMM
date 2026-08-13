import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, formatDate, ApiError } from "@/api/client";
import type { Paginated, Platform, RefillOverview, RefillRecord } from "@/types";
import { Badge, Button, Card, Input, Modal, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";

export function AdminRefills() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [noteFor, setNoteFor] = useState<RefillRecord | null>(null);
  const [note, setNote] = useState("");

  const overview = useQuery({ queryKey: ["admin-refill-overview"], queryFn: () => api<RefillOverview>("/admin/refills/overview") });
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms?all=1") });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api<{ id: string; name: string }[]>("/admin/providers") });
  const list = useQuery({
    queryKey: ["admin-refills", page, status, search, platformId, providerId, from, to],
    queryFn: () => api<Paginated<RefillRecord>>(
      `/admin/refills?page=${page}&status=${status}&search=${encodeURIComponent(search)}&platformId=${platformId}&providerId=${providerId}&from=${from}&to=${to}`
    ),
  });

  const stats = overview.data;
  const cards = [
    { label: "Total", value: stats?.total ?? 0 },
    { label: "Requested", value: stats?.requested ?? 0 },
    { label: "Processing", value: stats?.processing ?? 0 },
    { label: "Completed", value: stats?.completed ?? 0 },
    { label: "Failed", value: stats?.failed ?? 0 },
    { label: "Expired", value: stats?.expired ?? 0 },
    { label: "Today", value: stats?.today ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Refills</h1>
      <p className="mt-1 text-sm text-slate-500">Real refill records. Failed provider requests stay failed until you retry.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-2 text-2xl font-extrabold text-brand-700">{c.value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="Search refill, order, customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {["requested","processing","completed","failed","expired"].map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
        <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
          <option value="">All platforms</option>
          {platforms.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">All providers</option>
          {providers.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Card className="mt-4 overflow-x-auto">
        {list.isLoading && <Skeleton className="h-40" />}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              {["Refill ID","Order","Customer","Service","Provider","Status","Requested","Completed","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-mono text-xs">{r.public_id}</td>
                <td className="p-2 font-semibold">{r.order_public_id}</td>
                <td className="p-2">{r.customer_name}<div className="text-xs text-slate-500">{r.customer_email}</div></td>
                <td className="p-2">{r.product_name}</td>
                <td className="p-2">{r.provider_name || "—"}</td>
                <td className="p-2"><Badge className={statusTone[r.status]}>{prettyStatus(r.status)}</Badge></td>
                <td className="p-2 text-slate-500">{formatDate(r.requested_at || r.created_at)}</td>
                <td className="p-2 text-slate-500">{r.completed_at ? formatDate(r.completed_at) : "—"}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <Link className="font-semibold text-brand-700" to={`/admin/orders?q=${r.order_public_id}`}>View order</Link>
                    {r.status === "failed" && (
                      <button className="font-semibold text-brand-700" onClick={async () => {
                        try {
                          await api(`/admin/refills/${r.id}/retry`, { method: "POST" });
                          toast.success("Refill retried");
                          qc.invalidateQueries({ queryKey: ["admin-refills"] });
                          qc.invalidateQueries({ queryKey: ["admin-refill-overview"] });
                        } catch (e) { toast.error(e instanceof ApiError ? e.message : "Retry failed"); }
                      }}>Retry</button>
                    )}
                    <button className="font-semibold" onClick={() => { setNoteFor(r); setNote(r.admin_note ?? ""); }}>Add note</button>
                  </div>
                  {r.status === "failed" && r.error_message && (
                    <p className="mt-1 text-xs text-rose-600">{r.error_message}</p>
                  )}
                  {r.admin_note && r.status !== "failed" && (
                    <p className="mt-1 text-xs text-amber-700">{r.admin_note}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination page={page} total={list.data.total} limit={list.data.limit} onPage={setPage} />}
      </Card>
      {noteFor && (
        <Modal open title={`Note · ${noteFor.public_id}`} onClose={() => setNoteFor(null)}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal admin note" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteFor(null)}>Cancel</Button>
            <Button onClick={async () => {
              try {
                await api(`/admin/refills/${noteFor.id}/note`, { method: "POST", body: JSON.stringify({ note }) });
                toast.success("Note saved");
                setNoteFor(null);
                qc.invalidateQueries({ queryKey: ["admin-refills"] });
              } catch (e) { toast.error(e instanceof ApiError ? e.message : "Could not save note"); }
            }}>Save</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
