import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Shield, Timer, Wallet, Zap } from "lucide-react";
import { api, money } from "@/api/client";
import type { Platform, Product } from "@/types";
import { Button, Card, Skeleton } from "@/components/ui";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { AffiliatesLanding } from "@/pages/customer/AffiliatePages";

export function HomePage() {
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
  const products = useQuery({
    queryKey: ["featured-products"],
    queryFn: () => api<{ items: Product[] }>("/products?limit=8"),
  });

  return (
    <div>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.25),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.2),_transparent_35%)]" />
        <div className="container-page relative grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300">
              LinkWaveHub SMM · by OB CodeLab
            </p>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
              Grow Your Social Presence With Powerful Social Media Services
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Buy followers, likes, views, comments and more from a live catalog managed by administrators — not hard-coded products. Fast delivery, wallet payments, and reseller storefronts included.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register"><Button className="px-6 py-3">Get Started</Button></Link>
              <Link to="/services"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">View Services</Button></Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
              <Trust label="Secure wallet" />
              <Trust label="Live order tracking" />
              <Trust label="GHS pricing" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(platforms.data ?? []).slice(0, 6).map((p) => (
              <Link key={p.id} to={`/services?platform=${p.slug}`} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur hover:bg-white/10">
                <PlatformIcon name={p.icon} color={p.color} className="h-7 w-7" />
                <p className="mt-3 font-bold">{p.name}</p>
                <p className="text-sm text-slate-400">{p.product_count} services</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="text-2xl font-extrabold">Supported platforms</h2>
        <p className="mt-2 text-slate-500">Every platform is stored in the database. Admins can add Spotify, Threads, or anything else without a code change.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platforms.isLoading && Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          {platforms.data?.map((p) => (
            <Link key={p.id} to={`/services?platform=${p.slug}`}>
              <Card className="h-full hover:border-brand-300">
                <PlatformIcon name={p.icon} color={p.color} className="h-8 w-8" />
                <h3 className="mt-3 font-bold">{p.name}</h3>
                <p className="text-sm text-slate-500">{p.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-16 dark:bg-slate-900">
        <div className="container-page">
          <h2 className="text-2xl font-extrabold">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { icon: <Zap />, t: "Choose a service", d: "Browse platforms and categories from the live catalog." },
              { icon: <Wallet />, t: "Fund your wallet", d: "Deposit with Mobile Money, card, or demo top-up." },
              { icon: <Timer />, t: "Place the order", d: "Enter quantity and target URL. Price calculates automatically." },
              { icon: <Shield />, t: "Track delivery", d: "Watch status move from pending to completed in your dashboard." },
            ].map((s) => (
              <Card key={s.t}>
                <div className="text-brand-600">{s.icon}</div>
                <h3 className="mt-3 font-bold">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-500">{s.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-extrabold">Popular services</h2>
          <Link to="/services" className="text-sm font-semibold text-brand-700">See all</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {products.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
          {products.data?.items.map((p) => (
            <Link key={p.id} to={`/services/${p.slug}`}>
              <Card className="h-full hover:border-brand-300">
                <p className="text-xs font-semibold uppercase text-slate-500">{p.platform_name} · {p.category_name}</p>
                <h3 className="mt-2 font-bold">{p.name}</h3>
                <p className="mt-3 text-lg font-extrabold text-brand-700">{money(p.display_price_per_1000 ?? p.price_per_1000)} <span className="text-xs font-medium text-slate-500">/ 1000</span></p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 py-16 text-white">
        <div className="container-page grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold">Transparent GHS pricing</h2>
            <p className="mt-3 text-slate-300">Prices are set per 1,000 units by administrators. Resellers can apply their own markup on a personal storefront.</p>
          </div>
          <ul className="space-y-3 text-sm">
            {["No hard-coded prices in the frontend", "Automatic profit calculation for admins", "Wallet deductions on every order", "Refunds credit the wallet instantly"].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand-400" /> {t}</li>
            ))}
          </ul>
        </div>
      </section>

      <AffiliatesLanding />

      <section id="faq" className="container-page py-16">
        <h2 className="text-2xl font-extrabold">FAQ</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Do I need to share my password?", "Never. We only need a public profile, post, or video URL."],
            ["How fast is delivery?", "Each product shows its average delivery time. Instant services start within minutes."],
            ["Can I become a reseller?", "Yes. Register as a reseller, get approved, then share your storefront link."],
            ["How do affiliates work?", "Share your personal link. You earn 7% for life on funds your referrals add to their wallet. Commission goes to your wallet and can be used to order services."],
            ["How do I add a new platform?", "Admins add platforms, categories and products from the dashboard. They appear on the site immediately."],
          ].map(([q, a]) => (
            <Card key={q}><h3 className="font-bold">{q}</h3><p className="mt-2 text-sm text-slate-500">{a}</p></Card>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/register"><Button className="px-8">Get Started <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>
    </div>
  );
}

function Trust({ label }: { label: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center text-slate-200">{label}</div>;
}
