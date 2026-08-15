import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api } from "@/api/client";
import { Button, Card, Input } from "@/components/ui";

const PHRASE = "RESET DASHBOARD";

export function ResetDashboardCard() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const reset = useMutation({
    mutationFn: () => api<{ removedUsers: number; keptAdmins: string[] }>("/admin/reset-dashboard", {
      method: "POST",
      body: JSON.stringify({ confirm }),
    }),
    onSuccess: async (data) => {
      toast.success(`Dashboard reset. Removed ${data.removedUsers} user${data.removedUsers === 1 ? "" : "s"}.`);
      setConfirm("");
      await qc.invalidateQueries();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not reset the dashboard");
    },
  });

  return (
    <Card className="border-rose-200 dark:border-rose-900">
      <h2 className="font-bold text-rose-700 dark:text-rose-300">Reset dashboard</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        This makes the dashboard look new: zero customers, resellers, orders, deposits, revenue, and profit.
        Your admin login, product catalog, ResellerSMM provider, payment methods, and settings stay. Admin accounts are never deleted.
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-700 dark:text-rose-300">This cannot be undone.</p>
      <label className="mt-3 block">
        <span className="label">Type {PHRASE} to confirm</span>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder={PHRASE} />
      </label>
      <Button
        variant="danger"
        className="mt-4"
        disabled={reset.isPending || confirm.trim().toUpperCase() !== PHRASE}
        onClick={() => reset.mutate()}
      >
        {reset.isPending ? "Resetting..." : "Reset dashboard to zero"}
      </Button>
    </Card>
  );
}
