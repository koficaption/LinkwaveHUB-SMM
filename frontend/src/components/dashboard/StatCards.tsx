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
        <div className="stat-icon-frame flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden">
          <div className="stat-icon-art flex h-full w-full items-center justify-center">{icon}</div>
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

export function WelcomeCard({
  name,
  gender,
  verified,
  loading,
}: {
  name: string;
  gender?: string | null;
  verified?: boolean;
  loading?: boolean;
}) {
  const avatarSrc = gender === "female" ? "/dashboard/avatar-3d-female.webp" : "/dashboard/avatar-3d.webp";
  return (
    <StatCard
      loading={loading}
      icon={<Icon3d src={avatarSrc} cover />}
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
      icon={<Icon3d src="/dashboard/coins-3d.webp" />}
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
      icon={<Icon3d src="/dashboard/cart-3d.webp" />}
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
      icon={<Icon3d src="/dashboard/wallet-3d.webp" />}
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

function Icon3d({ src, cover = false }: { src: string; cover?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cover ? "h-full w-full object-cover object-[center_12%]" : "h-[88%] w-[88%] object-contain"}
    />
  );
}
