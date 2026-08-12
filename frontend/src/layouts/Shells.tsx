import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, Moon, Sun, Waves, X } from "lucide-react";
import { useState } from "react";
import { useAuth, useTheme } from "@/contexts/AuthContext";
import { Button } from "@/components/ui";
import { money } from "@/api/client";
import { ContactLinks, usePublicSettings } from "@/components/ContactLinks";

const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/#how-it-works", label: "How It Works" },
  { to: "/#pricing", label: "Pricing" },
  { to: "/#affiliates", label: "Affiliates" },
  { to: "/#faq", label: "FAQ" },
];

export function PublicLayout() {
  const { me } = useAuth();
  const { dark, setDark } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const settings = usePublicSettings();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Waves className="h-5 w-5" />
            </span>
            LinkWaveHub
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            {publicLinks.map((l) => (
              <a key={l.label} href={l.to} className="text-slate-600 hover:text-brand-700 dark:text-slate-300">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => setDark(!dark)} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
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
            <button className="md:hidden" onClick={() => setOpen((v) => !v)}>
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-slate-200 p-4 md:hidden dark:border-slate-800">
            {publicLinks.map((l) => (
              <a key={l.label} href={l.to} className="block py-2" onClick={() => setOpen(false)}>{l.label}</a>
            ))}
          </div>
        )}
      </header>
      <Outlet key={location.pathname} />
      <footer className="border-t border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
        <div className="container-page flex flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p>© {new Date().getFullYear()} {String(settings.data?.siteName || "LinkWaveHub SMM")}. Developed by {String(settings.data?.developer || "OB CodeLab")}.</p>
            {settings.data?.supportEmail && <p className="mt-1">{settings.data.supportEmail}</p>}
          </div>
          <ContactLinks />
        </div>
      </footer>
    </div>
  );
}

export function AppShell({
  title,
  items,
  home,
}: {
  title: string;
  items: { to: string; label: string; icon: React.ReactNode }[];
  home: string;
}) {
  const { me, logout } = useAuth();
  const { dark, setDark } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-slate-200 bg-slate-950 text-white transition lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-2 px-5 font-extrabold">
          <Waves className="h-5 w-5 text-brand-400" /> {title}
        </div>
        <nav className="space-y-1 px-3 py-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === home}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-white/10"}`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu /></button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {me?.wallet && <span className="hidden rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-800 sm:inline dark:bg-brand-500/15 dark:text-brand-200">{money(me.wallet.balance)}</span>}
            <button onClick={() => setDark(!dark)} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <span className="hidden font-medium sm:inline">{me?.user.full_name}</span>
            <Button variant="outline" onClick={async () => { await logout(); navigate("/"); }}>Logout</Button>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
