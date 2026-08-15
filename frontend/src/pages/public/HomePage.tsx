import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api } from "@/api/client";
import type { Platform } from "@/types";
import { Button, Card, Skeleton } from "@/components/ui";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { WaveDivider } from "@/components/dashboard/WaveDivider";
import { BrandLogo } from "@/components/BrandLogo";

export function HomePage() {
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });

  return (
    <div>
      <section className="relative overflow-hidden bg-white">
        <div className="container-page relative py-16 sm:py-24">
          <BrandLogo variant="full" withLink={false} className="mb-8" />
          <p className="text-sm font-bold uppercase tracking-wider text-brand-700">Social media services</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-5xl">
            Buy followers, likes and views in a few taps
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Choose a service, add money to your wallet, and place the order. Prices are in Ghana cedis.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/services"><Button className="px-6 py-3">Buy a service</Button></Link>
            <Link to="/register"><Button variant="outline">Create account</Button></Link>
          </div>
        </div>
        <WaveDivider />
      </section>

      <section className="container-page py-14">
        <h2 className="text-2xl font-extrabold">Choose a platform</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {platforms.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          {platforms.data?.map((p) => (
            <Link key={p.id} to={`/services?platform=${p.slug}`}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:border-brand-300">
                <PlatformIcon name={p.icon} color={p.color} className="h-7 w-7" />
                <h3 className="mt-2 font-bold">{p.name}</h3>
                <p className="text-sm text-muted">{p.product_count} services</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-brand-50 py-14 dark:bg-slate-900">
        <div className="container-page">
          <h2 className="text-2xl font-extrabold">How it works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ["1. Pick a service", "Instagram, TikTok, YouTube and more."],
              ["2. Add money", "Pay with Mobile Money or card."],
              ["3. Place the order", "Paste the link. We start the order."],
            ].map(([t, d]) => (
              <Card key={t}>
                <h3 className="font-bold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="container-page pb-16">
        <h2 className="text-2xl font-extrabold">Questions</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Do I share my password?", "No. We only need the public profile, post, or video link."],
            ["How fast is it?", "Each service shows a delivery time. Many start within minutes."],
            ["How do I pay?", "Add money to your wallet with Mobile Money or card, then order."],
            ["Can I earn from friends?", "Yes. After you sign in, open Affiliate Program and share your link."],
          ].map(([q, a]) => (
            <Card key={q}><h3 className="font-bold">{q}</h3><p className="mt-2 text-sm text-muted">{a}</p></Card>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/services"><Button className="px-8">Buy a service <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>
    </div>
  );
}
