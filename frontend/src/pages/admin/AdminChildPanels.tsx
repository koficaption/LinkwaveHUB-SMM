import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, formatDate, money, ApiError } from "@/api/client";
import { Badge, Button, Card, Input, Modal, Select } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";

type ChildPanelOrder = {
  id: string;
  public_id: string;
  domain: string;
  panel_currency: string;
  admin_username: string;
  monthly_price: number;
  currency: string;
  status: string;
  vip_complimentary?: boolean;
  full_name?: string;
  email?: string;
  created_at: string;
  expires_at?: string | null;
};

type ChildPanelDetail = ChildPanelOrder & {
  admin_password?: string;
  admin_note?: string | null;
};

export function AdminChildPanels() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["admin-child-panels", status],
    queryFn: () => api<ChildPanelOrder[]>(`/admin/child-panels${status ? `?status=${status}` : ""}`),
  });
  const detail = useQuery({
    queryKey: ["admin-child-panel", active],
    queryFn: () => api<ChildPanelDetail>(`/admin/child-panels/${active}`),
    enabled: Boolean(active),
  });

  async function review(id: string, next: "processing" | "active" | "rejected" | "cancelled") {
    try {
      await api(`/admin/child-panels/${id}/review`, { method: "POST", body: JSON.stringify({ status: next }) });
      toast.success(`Marked ${next}`);
      setActive(null);
      qc.invalidateQueries({ queryKey: ["admin-child-panels"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update order");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Child panels</h1>
          <p className="mt-1 text-sm text-slate-500">Hosted panels on customer domains. Point DNS to the nameservers, then mark the order active.</p>
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="">All statuses</option>
          {["pending", "processing", "active", "rejected", "cancelled", "expired"].map((s) => (
            <option key={s} value={s}>{prettyStatus(s)}</option>
          ))}
        </Select>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              {["Customer", "Domain", "Admin", "Price", "Status", "Ordered", ""].map((h) => (
                <th key={h} className="p-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((o) => (
              <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">
                  {String(o.full_name || "—")}
                  <div className="text-xs text-slate-500">{o.email}</div>
                  <div className="font-mono text-xs text-slate-400">{o.public_id}</div>
                </td>
                <td className="p-2">
                  {o.domain}
                  <div className="text-xs text-slate-500">{o.panel_currency}</div>
                </td>
                <td className="p-2 font-mono text-xs">{o.admin_username}</td>
                <td className="p-2">{o.vip_complimentary ? "VIP free" : money(o.monthly_price, o.currency)}</td>
                <td className="p-2"><Badge className={statusTone[o.status] ?? statusTone.pending}>{prettyStatus(o.status)}</Badge></td>
                <td className="p-2 text-xs">{formatDate(o.created_at)}</td>
                <td className="p-2">
                  <button className="font-semibold text-brand-700" onClick={() => setActive(o.id)}>Open</button>
                </td>
              </tr>
            ))}
            {!list.data?.length && (
              <tr><td className="p-3 text-slate-500" colSpan={7}>No child panel orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {active && (
        <Modal open title={detail.data?.public_id || "Child panel"} onClose={() => setActive(null)}>
          {!detail.data ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p><span className="text-slate-500">Customer</span><br /><strong>{detail.data.full_name}</strong> · {detail.data.email}</p>
              <p><span className="text-slate-500">Domain</span><br /><strong>{detail.data.domain}</strong></p>
              <p><span className="text-slate-500">Panel currency</span><br />{detail.data.panel_currency}</p>
              <p><span className="text-slate-500">Admin username</span><br /><span className="font-mono">{detail.data.admin_username}</span></p>
              <div>
                <span className="text-slate-500">Admin password</span>
                <div className="mt-1 flex gap-2">
                  <Input readOnly value={detail.data.admin_password || ""} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (!detail.data?.admin_password) return;
                      await navigator.clipboard.writeText(detail.data.admin_password);
                      toast.success("Password copied");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <p>Price: {detail.data.vip_complimentary ? "VIP complimentary" : money(detail.data.monthly_price, detail.data.currency)}</p>
              {(detail.data.status === "pending" || detail.data.status === "processing") && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {detail.data.status === "pending" && (
                    <Button variant="outline" onClick={() => review(detail.data!.id, "processing")}>Mark processing</Button>
                  )}
                  <Button onClick={() => review(detail.data!.id, "active")}>Mark active</Button>
                  <Button variant="danger" onClick={() => review(detail.data!.id, "rejected")}>Reject & refund</Button>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
