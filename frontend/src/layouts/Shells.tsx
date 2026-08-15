import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useTheme } from "@/contexts/AuthContext";
import { Button, Skeleton } from "@/components/ui";
import { HelpBar, panelHelp, usePublicSettings } from "@/components/ContactLinks";
import { BrandLogo } from "@/components/BrandLogo";
import { AccountMenu, CurrencyButton } from "@/components/dashboard/AccountMenu";
import { cn } from "@/utils/cn";
import { api } from "@/api/client";
import { panelAuthPath, persistPanelSlug } from "@/utils/panel";
import type { PanelStore } from "@/types";

const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
];

export type AppNavItem = { to: string; label: string; icon: React.ReactNode; end?: boolean };
export type AppNavGroup = { label?: string; items: AppNavItem[] };

export function PublicLayout() {
  const { me } = useAuth();
  const { dark, setDark } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [params] = useSearchParams();
  const settings = usePublicSettings();
  const storeSlug = params.get("store") || location.pathname.match(/^\/store\/([a-z0-9-]{2,80})/i)?.[1] || "";
  const store = useQuery({
    queryKey: ["store-preview", storeSlug],
    queryFn: async () => (await api<{ store: PanelStore }>(`/store/${storeSlug}?limit=1`)).store,
    enabled: Boolean(storeSlug) && ["/login", "/register"].includes(location.pathname),
  });
  const panel = store.data;
  const homeTo = panel ? `/store/${panel.store_slug}` : "/";
  const links = panel
    ? [{ to: `/store/${panel.store_slug}`, label: "Services" }]
    : publicLinks;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F6FAF9] dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white shadow-nav dark:border-slate-800 dark:bg-slate-900">
        <div className="container-page flex h-[4.25rem] items-center justify-between">
          {panel ? (
            <Link to={homeTo} className="truncate text-lg font-extrabold" style={{ color: panel.brand_color }}>
              {panel.store_name}
            </Link>
          ) : (
            <BrandLogo />
          )}
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            {links.map((l) => (
              <Link key={l.label} to={l.to} className="text-slate-600 hover:text-brand-700 dark:text-slate-300">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {me?.wallet && <CurrencyButton />}
            <button onClick={() => setDark(!dark)} className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {me ? (
              <Link to={me.user.role === "admin" ? "/admin" : "/app"}>
                <Button>Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to={panelAuthPath("/login", storeSlug)} className="hidden sm:block"><Button variant="ghost">Login</Button></Link>
                <Link to={panelAuthPath("/register", storeSlug)}><Button>Get Started</Button></Link>
              </>
            )}
            <button className="rounded-xl p-2 text-slate-700 md:hidden dark:text-slate-200" onClick={() => setOpen((v) => !v)} aria-label="Open menu">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-slate-100 bg-white p-4 md:hidden dark:border-slate-800 dark:bg-slate-900">
            {links.map((l) => (
              <Link key={l.label} to={l.to} className="block py-2.5 text-sm font-semibold" onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
          </div>
        )}
      </header>
      <Outlet key={location.pathname} />
      <footer className="border-t border-slate-100 bg-white py-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="container-page flex flex-col gap-4 text-sm text-muted sm:flex-row sm:items-start sm:justify-between">
          <div>
            {panel ? (
              <p className="mb-3 text-lg font-extrabold text-slate-800 dark:text-white">{panel.store_name}</p>
            ) : (
              <BrandLogo className="mb-3" />
            )}
            <p>© {new Date().getFullYear()} {panel?.store_name || String(settings.data?.siteName || "LinkBoost Growth SMM")}{panel ? "" : `. Developed by ${String(settings.data?.developer || "OB CodeLab")}.`}</p>
            {panel?.support_email ? <p className="mt-1">{panel.support_email}</p> : !panel && settings.data?.supportEmail && <p className="mt-1">{settings.data.supportEmail}</p>}
            <p className="mt-3 flex flex-wrap gap-3">
              <Link to="/refund-policy" className="font-semibold text-brand-700 hover:underline">Refund Policy</Link>
              <Link to="/terms" className="font-semibold text-brand-700 hover:underline">Terms of Service</Link>
            </p>
          </div>
        </div>
      </footer>
      <HelpBar details={panel ? panelHelp(panel) : undefined} hideTickets={Boolean(panel)} />
    </div>
  );
}

export function StoreLayout() {
  const { slug } = useParams();
  const { me } = useAuth();
  const { dark, setDark } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  if (slug) persistPanelSlug(slug);
  const store = useQuery({
    queryKey: ["store-preview", slug],
    queryFn: async () => (await api<{ store: PanelStore }>(`/store/${slug}?limit=1`)).store,
    enabled: Boolean(slug),
  });
  const panel = store.data;

  if (store.isLoading) {
    return <div className="container-page py-16"><Skeleton className="h-40" /></div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F6FAF9] dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white shadow-nav dark:border-slate-800 dark:bg-slate-900">
        <div className="container-page flex h-[4.25rem] items-center justify-between">
          <Link to={`/store/${slug}`} className="truncate text-lg font-extrabold" style={{ color: panel?.brand_color || "#0D9488" }}>
            {panel?.store_name || "Store"}
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <Link to={`/store/${slug}`} className="text-slate-600 hover:text-brand-700 dark:text-slate-300">Services</Link>
          </nav>
          <div className="flex items-center gap-2">
            {me?.wallet && <CurrencyButton />}
            <button onClick={() => setDark(!dark)} className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {me ? (
              <Link to={me.user.role === "admin" ? "/admin" : "/app"}>
                <Button>Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to={panelAuthPath("/login", slug)} className="hidden sm:block"><Button variant="ghost">Login</Button></Link>
                <Link to={panelAuthPath("/register", slug)}><Button>Create account</Button></Link>
              </>
            )}
            <button className="rounded-xl p-2 text-slate-700 md:hidden dark:text-slate-200" onClick={() => setOpen((v) => !v)} aria-label="Open menu">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-slate-100 bg-white p-4 md:hidden dark:border-slate-800 dark:bg-slate-900">
            <Link to={`/store/${slug}`} className="block py-2.5 text-sm font-semibold" onClick={() => setOpen(false)}>Services</Link>
            {!me && (
              <>
                <Link to={panelAuthPath("/login", slug)} className="block py-2.5 text-sm font-semibold" onClick={() => setOpen(false)}>Login</Link>
                <Link to={panelAuthPath("/register", slug)} className="block py-2.5 text-sm font-semibold" onClick={() => setOpen(false)}>Create account</Link>
              </>
            )}
          </div>
        )}
      </header>
      <Outlet key={location.pathname} />
      <footer className="border-t border-slate-100 bg-white py-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="container-page text-sm text-muted">
          <p className="text-lg font-extrabold text-slate-800 dark:text-white">{panel?.store_name}</p>
          <p className="mt-2">© {new Date().getFullYear()} {panel?.store_name || "Storefront"}</p>
          {panel?.support_email && <p className="mt-1">{panel.support_email}</p>}
          {panel?.contact_phone && <p className="mt-1">{panel.contact_phone}</p>}
          <p className="mt-3 flex flex-wrap gap-3">
            <Link to="/refund-policy" className="font-semibold text-brand-700 hover:underline">Refund Policy</Link>
            <Link to="/terms" className="font-semibold text-brand-700 hover:underline">Terms of Service</Link>
          </p>
        </div>
      </footer>
      <HelpBar details={panelHelp(panel) ?? {}} hideTickets />
    </div>
  );
}

export function AppShell({
  title,
  items,
  groups,
  home,
  dense,
  brand,
}: {
  title: string;
  items?: AppNavItem[];
  groups?: AppNavGroup[];
  home: string;
  dense?: boolean;
  brand?: { name: string; color?: string; logoutTo?: string } | null;
}) {
  const { me, logout } = useAuth();
  const { dark, setDark } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const navGroups = groups ?? [{ items: items ?? [] }];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#F6FAF9] dark:bg-slate-950">
      <header className="z-50 flex h-[4.25rem] shrink-0 items-center justify-between gap-3 bg-white px-4 shadow-nav dark:bg-slate-900 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {brand ? (
            <Link to={home} className="truncate text-lg font-extrabold" style={{ color: brand.color || "#0D9488" }}>
              {brand.name}
            </Link>
          ) : (
            <BrandLogo to={home} />
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {me?.wallet && <CurrencyButton />}
          <button onClick={() => setDark(!dark)} className="hidden rounded-xl p-2 text-slate-600 hover:bg-brand-50 sm:inline-flex dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="hidden sm:block"><AccountMenu /></div>
          <Button
            variant="outline"
            className="hidden h-10 rounded-full sm:inline-flex"
            onClick={async () => { await logout(); navigate(brand?.logoutTo || "/"); }}
          >
            Logout
          </Button>
          <button
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-800 lg:hidden dark:text-slate-100"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label={title}
          className={cn(
            "z-50 flex w-[min(20rem,88vw)] flex-col bg-brand-600 text-white shadow-xl transition-transform duration-300",
            "fixed inset-y-0 left-0 lg:static lg:z-30 lg:h-full lg:w-64 lg:translate-x-0 lg:shadow-none",
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-4 lg:hidden">
            <p className="font-bold">Menu</p>
            <button onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4", dense && "text-[13px]")}>
            {navGroups.map((group, i) => (
              <SidebarGroup key={group.label || i} group={group} home={home} onNavigate={() => setOpen(false)} />
            ))}
          </nav>
          <div className="shrink-0 space-y-1 border-t border-white/15 p-3 lg:hidden">
            <button
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium hover:bg-white/10"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
            <Link to="/app/profile" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium hover:bg-white/10">Account</Link>
            {me?.user.role === "admin" && (
              <Link to="/admin" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium hover:bg-white/10">Admin</Link>
            )}
            <button
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium hover:bg-white/10"
              onClick={async () => { setOpen(false); await logout(); navigate(brand?.logoutTo || "/"); }}
            >
              Logout
            </button>
          </div>
        </aside>
        {open && <button className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu overlay" />}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <div className="container-dashboard">
            <Outlet />
          </div>
        </main>
      </div>
      <HelpBar details={me?.panel ? panelHelp(me.panel) : undefined} hideTickets={Boolean(me?.panel)} />
    </div>
  );
}

function SidebarGroup({
  group,
  home,
  onNavigate,
}: {
  group: AppNavGroup;
  home: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);
  if (!group.label) {
    return (
      <div className="space-y-1">
        {group.items.map((item) => (
          <SidebarLink key={`${item.to}-${item.label}`} item={item} home={home} onNavigate={onNavigate} />
        ))}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center justify-between px-3 text-[11px] font-bold uppercase tracking-wider text-white/70"
      >
        {group.label}
        <ChevronDown className={cn("h-4 w-4 transition", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-1">
          {group.items.map((item) => (
            <SidebarLink key={`${item.to}-${item.label}`} item={item} home={home} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarLink({ item, home, onNavigate }: { item: AppNavItem; home: string; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? item.to === home}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
          isActive ? "bg-white text-brand-700 shadow-sm" : "text-white/95 hover:bg-white/10"
        )
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}
