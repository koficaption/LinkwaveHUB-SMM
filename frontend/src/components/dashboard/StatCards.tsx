import { CheckCircle2 } from "lucide-react";
import { money } from "@/api/client";
import { Skeleton } from "@/components/ui";
import { cn } from "@/utils/cn";

export function StatCard({
  icon,
  title,
  subtitle,
  loading,
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
  loading?: boolean;
  className?: string;
}) {
  if (loading) return <Skeleton className="h-[108px] w-full rounded-2xl" />;
  return (
    <div className={cn("card flex min-h-[108px] items-center gap-4 p-4 sm:p-5", className)}>
      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/60">
        {icon}
      </div>
      <div className="h-14 w-px shrink-0 bg-brand-600/80" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xl font-extrabold leading-tight text-brand-700 dark:text-brand-300 sm:text-2xl">
          {title}
        </div>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function WelcomeCard({ name, verified, loading }: { name: string; verified?: boolean; loading?: boolean }) {
  return (
    <StatCard
      loading={loading}
      icon={<AvatarIllustration />}
      title={
        <span className="inline-flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {verified && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Verified" />}
        </span>
      }
      subtitle="Welcome To Linkwave SMM"
    />
  );
}

export function SpentCard({ amount, loading }: { amount: number | string | null | undefined; loading?: boolean }) {
  return <StatCard loading={loading} icon={<CoinsIllustration />} title={money(amount)} subtitle="You've Spent" />;
}

export function OrdersCard({ count, loading }: { count: number; loading?: boolean }) {
  return (
    <StatCard
      loading={loading}
      icon={<CartIllustration />}
      title={count.toLocaleString()}
      subtitle="Orders (Today)"
    />
  );
}

export function BalanceCard({ amount, loading }: { amount: number | string | null | undefined; loading?: boolean }) {
  return <StatCard loading={loading} icon={<WalletIllustration />} title={money(amount)} subtitle="Your Balance" />;
}

function AvatarIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <circle cx="36" cy="36" r="36" fill="#D4EBE6" />
      <circle cx="36" cy="28" r="12" fill="#F8D7B0" />
      <path d="M18 62c2-14 10-22 18-22s16 8 18 22" fill="#087F68" />
      <path d="M24 24c4-8 20-8 24 0 0 0-6-4-12-4s-12 4-12 4z" fill="#1F2937" />
    </svg>
  );
}

function CoinsIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <circle cx="36" cy="36" r="36" fill="#FEF3C7" />
      <ellipse cx="30" cy="42" rx="14" ry="10" fill="#F59E0B" />
      <ellipse cx="30" cy="38" rx="14" ry="10" fill="#FBBF24" />
      <ellipse cx="44" cy="34" rx="12" ry="9" fill="#D97706" />
      <ellipse cx="44" cy="30" rx="12" ry="9" fill="#F59E0B" />
      <path d="M18 48c8 8 28 10 40 2" stroke="#F8D7B0" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CartIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <circle cx="36" cy="36" r="36" fill="#FEE2E2" />
      <path d="M16 22h8l6 28h26" stroke="#B91C1C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="28" y="26" width="28" height="18" rx="3" fill="#EF4444" />
      <rect x="32" y="20" width="8" height="10" rx="1" fill="#F59E0B" />
      <rect x="42" y="18" width="10" height="12" rx="1" fill="#FBBF24" />
      <circle cx="34" cy="54" r="4" fill="#111827" />
      <circle cx="50" cy="54" r="4" fill="#111827" />
    </svg>
  );
}

function WalletIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <circle cx="36" cy="36" r="36" fill="#FFEDD5" />
      <rect x="16" y="24" width="40" height="28" rx="6" fill="#F97316" />
      <rect x="16" y="24" width="40" height="10" rx="5" fill="#EA580C" />
      <rect x="40" y="34" width="16" height="12" rx="3" fill="#FECACA" />
      <circle cx="48" cy="40" r="2.5" fill="#B91C1C" />
    </svg>
  );
}
