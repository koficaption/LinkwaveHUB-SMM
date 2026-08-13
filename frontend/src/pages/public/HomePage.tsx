import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api, money } from "@/api/client";
import type { Platform, Product } from "@/types";
import { Button, Card, Skeleton } from "@/components/ui";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

export function HomePage() {
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
  const products = useQuery({
    queryKey: ["featured-products"],
    queryFn: () => api<{ items: Product[] }>("/products?limit=8&sort=name"),
  });

  return (
    <div>
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(0,229,255,0.22),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(79,70,229,0.28),_transparent_38%)]" />
        <div className="container-page relative py-16 sm:py-24">
          <img src="/logo.png" alt="Linkwave SMM" className="mb-6 h-14 w-auto object-contain sm:h-16" />
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Buy followers, likes and views in a few taps
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            Choose a service, add money to your wallet, and place the order. Prices are in GHS.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/services"><Button className="px-6 py-3">Buy a service</Button></Link>
            <Link to="/register"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">Create account</Button></Link>
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <h2 className="text-2xl font-extrabold">Choose a platform</h2>
        <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {platforms.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          {platforms.data?.map((p) => (
            <Link key={p.id} to={`/services?platform=${p.slug}`}>
              <Card className="h-full hover:border-brand-300">
                <PlatformIcon name={p.icon} color={p.color} className="h-7 w-7" />
                <h3 className="mt-2 font-bold">{p.name}</h3>
                <p className="text-sm text-slate-500">{p.product_count} services</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-14 dark:bg-slate-900">
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
                <p className="mt-1 text-sm text-slate-500">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-extrabold">Popular services</h2>
          <Link to="/services" className="text-sm font-semibold text-brand-700">See all</Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {products.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          {products.data?.items.map((p) => (
            <Link key={p.id} to={`/services/${p.slug}`}>
              <Card className="h-full hover:border-brand-300">
                <p className="text-xs font-semibold uppercase text-slate-500">{p.platform_name}</p>
                <h3 className="mt-2 font-bold">{p.name}</h3>
                <p className="mt-3 text-lg font-extrabold text-brand-700">{money(p.display_price_per_1000 ?? p.price_per_1000)} <span className="text-xs font-medium text-slate-500">/ 1000</span></p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section id="faq" className="container-page pb-16">
        <h2 className="text-2xl font-extrabold">Questions</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Do I share my password?", "No. We only need the public profile, post, or video link."],
            ["How fast is it?", "Each service shows a delivery time. Many start within minutes."],
            ["How do I pay?", "Add money to your wallet with Mobile Money or card, then order."],
            ["Can I earn from friends?", "Yes. After you sign in, open Earn and share your link."],
          ].map(([q, a]) => (
            <Card key={q}><h3 className="font-bold">{q}</h3><p className="mt-2 text-sm text-slate-500">{a}</p></Card>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/services"><Button className="px-8">Buy a service <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>
    </div>
  );
}
