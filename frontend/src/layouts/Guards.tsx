import { Navigate, Outlet } from "react-router-dom";
import {
  BarChart3, Bell, Boxes, CreditCard, FolderTree, Gift, Globe, LayoutDashboard,
  Plug, Settings, ShoppingCart, Store, Ticket, Users, Wallet, Shield,
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
    { to: "/app", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/services", label: "Services", icon: <Boxes className="h-4 w-4" /> },
    { to: "/app/orders", label: "Orders", icon: <ShoppingCart className="h-4 w-4" /> },
    { to: "/app/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
    { to: "/app/affiliates", label: "Affiliates", icon: <Gift className="h-4 w-4" /> },
    { to: "/app/support", label: "Support", icon: <Ticket className="h-4 w-4" /> },
    { to: "/app/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
    { to: "/app/profile", label: "Profile", icon: <Users className="h-4 w-4" /> },
  ];
  if (me?.user.role === "reseller") {
    items.splice(1, 0,
      { to: "/app/reseller", label: "Reseller", icon: <Store className="h-4 w-4" /> },
      { to: "/app/reseller/storefront", label: "Storefront", icon: <Globe className="h-4 w-4" /> },
      { to: "/app/reseller/pricing", label: "Pricing", icon: <CreditCard className="h-4 w-4" /> },
    );
  } else if (me?.user.role === "customer") {
    items.splice(1, 0, { to: "/app/become-reseller", label: "Become reseller", icon: <Store className="h-4 w-4" /> });
  }
  return <AppShell title="LinkWaveHub" items={items} home="/app" />;
}

export function AdminLayout() {
  const items = [
    { to: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/admin/orders", label: "Orders", icon: <ShoppingCart className="h-4 w-4" /> },
    { to: "/admin/products", label: "Products", icon: <Boxes className="h-4 w-4" /> },
    { to: "/admin/platforms", label: "Platforms", icon: <Globe className="h-4 w-4" /> },
    { to: "/admin/categories", label: "Categories", icon: <FolderTree className="h-4 w-4" /> },
    { to: "/admin/providers", label: "Providers", icon: <Plug className="h-4 w-4" /> },
    { to: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
    { to: "/admin/resellers", label: "Resellers", icon: <Store className="h-4 w-4" /> },
    { to: "/admin/affiliates", label: "Affiliates", icon: <Gift className="h-4 w-4" /> },
    { to: "/admin/payments", label: "Payments", icon: <CreditCard className="h-4 w-4" /> },
    { to: "/admin/wallets", label: "Wallets", icon: <Wallet className="h-4 w-4" /> },
    { to: "/admin/support", label: "Support", icon: <Ticket className="h-4 w-4" /> },
    { to: "/admin/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
    { to: "/admin/analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
    { to: "/admin/audit", label: "Audit log", icon: <Shield className="h-4 w-4" /> },
    { to: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];
  return <AppShell title="Admin" items={items} home="/admin" />;
}

export { PublicLayout };
