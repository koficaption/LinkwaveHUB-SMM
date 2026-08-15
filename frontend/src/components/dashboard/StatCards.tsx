import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { money } from "@/api/client";
import { BRAND_SHORT } from "@/brand";
import { Skeleton } from "@/components/ui";
import { cn } from "@/utils/cn";

export function StatCard({
  icon,
  title,
  subtitle,
  loading,
  className,
  delay = "0s",
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
  loading?: boolean;
  className?: string;
  delay?: string;
}) {
  const card = useRef<HTMLDivElement>(null);

  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    const el = card.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    el.style.setProperty("--rx", `${((0.5 - y) * 14).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 18).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
  }

  function flatten() {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  if (loading) return <Skeleton className="h-[108px] w-full rounded-2xl" />;
  return (
    <div className="stat-3d-scene" style={{ ["--stat-delay" as string]: delay }}>
      <div
        ref={card}
        onPointerMove={tilt}
        onPointerLeave={flatten}
        className={cn("stat-card card flex min-h-[108px] items-center gap-4 p-4 sm:p-5", className)}
      >
        <div className="stat-icon-frame flex h-[72px] w-[72px] shrink-0 items-center justify-center">
          <div className="stat-icon-art">{icon}</div>
        </div>
        <div className="stat-card-copy min-w-0 flex-1">
          <div className="truncate text-xl font-extrabold leading-tight text-brand-700 dark:text-brand-300 sm:text-2xl">
            {title}
          </div>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
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
      subtitle={`Welcome To ${BRAND_SHORT}`}
      delay="0s"
    />
  );
}

export function SpentCard({ amount, loading }: { amount: number | string | null | undefined; loading?: boolean }) {
  return (
    <StatCard
      loading={loading}
      icon={<CoinsIllustration />}
      title={<CountUp value={Number(amount ?? 0)} format={money} />}
      subtitle="You've Spent"
      delay="0.4s"
    />
  );
}

export function OrdersCard({ count, loading }: { count: number; loading?: boolean }) {
  return (
    <StatCard
      loading={loading}
      icon={<CartIllustration />}
      title={<CountUp value={count} format={(n) => Math.round(n).toLocaleString()} />}
      subtitle="Orders (Today)"
      delay="0.8s"
    />
  );
}

export function BalanceCard({ amount, loading }: { amount: number | string | null | undefined; loading?: boolean }) {
  return (
    <StatCard
      loading={loading}
      icon={<WalletIllustration />}
      title={<CountUp value={Number(amount ?? 0)} format={money} />}
      subtitle="Your Balance"
      delay="1.2s"
    />
  );
}

function CountUp({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format: (n: number) => React.ReactNode;
  duration?: number;
}) {
  const fromRef = useRef(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(shown)}</>;
}

function AvatarIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F3C7A0" />
          <stop offset="100%" stopColor="#E0A070" />
        </linearGradient>
        <linearGradient id="hoodie" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1FA37F" />
          <stop offset="100%" stopColor="#087F68" />
        </linearGradient>
      </defs>
      <path d="M16 68c2-16 10-24 20-24s18 8 20 24" fill="url(#hoodie)" />
      <path d="M28 48c4 6 12 6 16 0-2 8-14 8-16 0z" fill="#0A5F50" />
      <circle cx="36" cy="30" r="13" fill="url(#skin)" />
      <path d="M24 28c2-12 22-14 25-2-6-6-18-4-25 2z" fill="#2A2118" />
      <path d="M22 32c1-8 8-12 14-12 2 0 4 .4 6 1-8-1-16 3-20 11z" fill="#1A140F" />
      <circle cx="31" cy="31" r="1.6" fill="#2A2118" />
      <circle cx="41" cy="31" r="1.6" fill="#2A2118" />
      <path d="M33 37c2 2 4 2 6 0" stroke="#C4845C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CoinsIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="hand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F3C7A0" />
          <stop offset="100%" stopColor="#D4956A" />
        </linearGradient>
      </defs>
      <ellipse cx="28" cy="24" rx="10" ry="10" fill="url(#gold)" />
      <ellipse cx="44" cy="18" rx="9" ry="9" fill="#F59E0B" />
      <ellipse cx="50" cy="30" rx="8" ry="8" fill="#FBBF24" />
      <text x="24" y="28" fontSize="9" fontWeight="700" fill="#92400E">₵</text>
      <path d="M14 44c8 2 12-6 20-4 6 2 8 8 18 8 0 8-10 16-28 16-12 0-18-8-16-16 2-4 4-5 6-4z" fill="url(#hand)" />
      <path d="M18 46c4 1 7-2 11-1" stroke="#E8B894" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CartIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <path d="M12 18h10l8 32h28" stroke="#B91C1C" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="26" y="28" width="14" height="16" rx="2" fill="#D97706" />
      <rect x="28" y="24" width="10" height="6" rx="1" fill="#FBBF24" />
      <rect x="42" y="26" width="16" height="18" rx="2" fill="#F59E0B" />
      <rect x="45" y="22" width="10" height="6" rx="1" fill="#FDE68A" />
      <path d="M30 28h8v16h-8z" fill="#B45309" opacity=".25" />
      <path d="M46 26h10v18h-10z" fill="#B45309" opacity=".2" />
      <circle cx="36" cy="56" r="5" fill="#111827" />
      <circle cx="52" cy="56" r="5" fill="#111827" />
      <circle cx="36" cy="56" r="2" fill="#6B7280" />
      <circle cx="52" cy="56" r="2" fill="#6B7280" />
    </svg>
  );
}

function WalletIllustration() {
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
      <rect x="22" y="14" width="28" height="16" rx="2" fill="#22C55E" transform="rotate(-12 36 22)" />
      <rect x="26" y="18" width="28" height="14" rx="2" fill="#16A34A" transform="rotate(-6 40 25)" />
      <rect x="14" y="28" width="46" height="30" rx="7" fill="#F59E0B" />
      <rect x="14" y="28" width="46" height="12" rx="6" fill="#D97706" />
      <rect x="42" y="38" width="18" height="14" rx="4" fill="#FECACA" />
      <rect x="44" y="40" width="14" height="10" rx="2" fill="#EF4444" />
      <circle cx="51" cy="45" r="2.2" fill="#FEE2E2" />
    </svg>
  );
}
