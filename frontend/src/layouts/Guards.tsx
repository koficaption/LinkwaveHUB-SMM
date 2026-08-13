import { Navigate, Outlet } from "react-router-dom";
import {
  Boxes, CreditCard, Gift, Globe, LayoutDashboard,
  Plug, Settings, ShoppingCart, Store, Ticket, Users, Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell, PublicLayout } from "@/layouts/Shells";
import { Skeleton } from "@/components/ui";

export function Guard({ roles, children }: { roles?: string[]; children?: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-10"><Skeleton className="h-40" /></div>;
  if (!me) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(me.user.role)) return <Navigate to={me.user.role === "admin" ? "/admin" : "/app"} replace />;
  return children ? <>{children}</> : <Outlet />;
}

export function CustomerLayout() {
  const { me } = useAuth();
  const items = [
    { to: "/app", label: "Home", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/services", label: "Buy services", icon: <Boxes className="h-4 w-4" /> },
    { to: "/app/orders", label: "Orders", icon: <ShoppingCart className="h-4 w-4" /> },
    { to: "/app/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
    { to: "/app/affiliates", label: "Earn", icon: <Gift className="h-4 w-4" /> },
    { to: "/app/support", label: "Help", icon: <Ticket className="h-4 w-4" /> },
    { to: "/app/profile", label: "Profile", icon: <Users className="h-4 w-4" /> },
  ];
  if (me?.user.role === "reseller") {
    items.splice(5, 0,
      { to: "/app/reseller", label: "My store", icon: <Store className="h-4 w-4" /> },
    );
  }
  return <AppShell title="LinkWaveHub" items={items} home="/app" />;
}

export function AdminLayout() {
  const items = [
    { to: "/admin", label: "Home", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/admin/orders", label: "Orders", icon: <ShoppingCart className="h-4 w-4" /> },
    { to: "/admin/products", label: "Products", icon: <Boxes className="h-4 w-4" /> },
    { to: "/admin/providers", label: "Provider prices", icon: <Plug className="h-4 w-4" /> },
    { to: "/admin/platforms", label: "Platforms", icon: <Globe className="h-4 w-4" /> },
    { to: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
    { to: "/admin/payments", label: "Payments", icon: <CreditCard className="h-4 w-4" /> },
    { to: "/admin/support", label: "Help", icon: <Ticket className="h-4 w-4" /> },
    { to: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];
  return <AppShell title="Admin" items={items} home="/admin" />;
}

export { PublicLayout };
