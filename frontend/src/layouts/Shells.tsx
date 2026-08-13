import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { useAuth, useTheme } from "@/contexts/AuthContext";
import { Button } from "@/components/ui";
import { usePublicSettings } from "@/components/ContactLinks";
import { BrandLogo } from "@/components/BrandLogo";
import { AccountMenu, CurrencyButton, SupportFabs } from "@/components/dashboard/AccountMenu";
import { cn } from "@/utils/cn";

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
  const settings = usePublicSettings();

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F6FAF9] dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white shadow-nav dark:border-slate-800 dark:bg-slate-900">
        <div className="container-page flex h-16 items-center justify-between">
          <BrandLogo className="h-9 sm:h-10" />
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            {publicLinks.map((l) => (
              <Link key={l.label} to={l.to} className="text-slate-600 hover:text-brand-700 dark:text-slate-300">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => setDark(!dark)} className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {me ? (
              <Link to={me.user.role === "admin" ? "/admin" : "/app"}>
                <Button>Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block"><Button variant="ghost">Login</Button></Link>
                <Link to="/register"><Button>Get Started</Button></Link>
              </>
            )}
            <button className="rounded-xl p-2 text-slate-700 md:hidden dark:text-slate-200" onClick={() => setOpen((v) => !v)} aria-label="Open menu">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-slate-100 bg-white p-4 md:hidden dark:border-slate-800 dark:bg-slate-900">
            {publicLinks.map((l) => (
              <Link key={l.label} to={l.to} className="block py-2.5 text-sm font-semibold" onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
          </div>
        )}
      </header>
      <Outlet key={location.pathname} />
      <footer className="border-t border-slate-100 bg-white py-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="container-page flex flex-col gap-4 text-sm text-muted sm:flex-row sm:items-start sm:justify-between">
          <div>
            <BrandLogo className="mb-3 h-9" />
            <p>© {new Date().getFullYear()} {String(settings.data?.siteName || "LinkBoost Growth SMM")}. Developed by {String(settings.data?.developer || "OB CodeLab")}.</p>
            {settings.data?.supportEmail && <p className="mt-1">{settings.data.supportEmail}</p>}
          </div>
        </div>
      </footer>
      <SupportFabs />
    </div>
  );
}

export function AppShell({
  title,
  items,
  groups,
  home,
  dense,
}: {
  title: string;
  items?: AppNavItem[];
  groups?: AppNavGroup[];
  home: string;
  dense?: boolean;
}) {
  const { me, logout } = useAuth();
  const { dark, setDark } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const navGroups = groups ?? [{ items: items ?? [] }];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F6FAF9] dark:bg-slate-950">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between gap-3 bg-white px-4 shadow-nav dark:bg-slate-900 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo to={home} className="h-9" />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {me?.wallet && <span className="hidden sm:inline"><CurrencyButton /></span>}
          <button onClick={() => setDark(!dark)} className="hidden rounded-xl p-2 text-slate-600 hover:bg-brand-50 sm:inline-flex dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="hidden sm:block"><AccountMenu /></div>
          <Button
            variant="outline"
            className="hidden h-10 rounded-full sm:inline-flex"
            onClick={async () => { await logout(); navigate("/"); }}
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

      <div className="lg:flex">
        <aside
          aria-label={title}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col bg-brand-600 text-white shadow-xl transition-transform duration-300 lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100vh-4rem)] lg:w-64 lg:translate-x-0 lg:shadow-none",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-16 items-center justify-between px-4 lg:hidden">
            <p className="font-bold">Menu</p>
            <button onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className={cn("flex-1 space-y-4 overflow-y-auto px-3 py-4", dense && "text-[13px]")}>
            {navGroups.map((group, i) => (
              <SidebarGroup key={group.label || i} group={group} home={home} onNavigate={() => setOpen(false)} />
            ))}
          </nav>
          <div className="space-y-1 border-t border-white/15 p-3 lg:hidden">
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
              onClick={async () => { setOpen(false); await logout(); navigate("/"); }}
            >
              Logout
            </button>
          </div>
        </aside>
        {open && <button className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu overlay" />}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <div className="container-dashboard">
            <Outlet />
          </div>
        </main>
      </div>
      <SupportFabs />
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
