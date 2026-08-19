import { Navigate, Outlet } from "react-router-dom";
import {
  Banknote, BarChart3, Bell, BookOpen, Boxes, Code2, CreditCard, Gift, Globe, Handshake,
  LayoutDashboard, Link2, Plug, RefreshCcw, Settings, ShoppingCart, Store, Ticket, Users, Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell, PublicLayout, StoreLayout, type AppNavItem } from "@/layouts/Shells";
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
  const panel = me?.panel;
  const items: AppNavItem[] = [
    { to: "/app", label: "New Order", icon: <ShoppingCart className="h-5 w-5" />, end: true },
    { to: "/app/orders", label: "Orders", icon: <ShoppingCart className="h-5 w-5" /> },
    { to: "/app/services", label: "Services", icon: <Boxes className="h-5 w-5" /> },
    { to: "/app/wallet", label: "Add Funds", icon: <CreditCard className="h-5 w-5" /> },
    { to: "/app/support", label: "Support Tickets", icon: <Ticket className="h-5 w-5" /> },
  ];
  if (me?.user.role === "reseller") {
    items.push(
      { to: "/app/reseller", label: "Reseller", icon: <Store className="h-5 w-5" /> },
      { to: "/app/reseller/storefront", label: "Storefront", icon: <Store className="h-5 w-5" /> },
      { to: "/app/reseller/pricing", label: "Pricing", icon: <Wallet className="h-5 w-5" /> },
      { to: "/app/reseller/customers", label: "Customers", icon: <Users className="h-5 w-5" /> },
      { to: "/app/reseller/withdraw", label: "Withdraw", icon: <Banknote className="h-5 w-5" /> },
    );
  }
  if (!panel) {
    items.push({
      to: "/app/child-panels",
      label: "Child Panels",
      icon: <Globe className="h-5 w-5" />,
    });
    items.push(
      { to: "/app/affiliates", label: "Affiliate Program", icon: <Handshake className="h-5 w-5" /> },
      { to: "/app/api", label: "API", icon: <Link2 className="h-5 w-5" /> },
      { to: "/app/loyalty", label: "Loyalty Program", icon: <Gift className="h-5 w-5" /> },
    );
  }
  items.push(
    { to: "/app/refund-policy", label: "Refund Policy", icon: <Banknote className="h-5 w-5" /> },
    { to: "/app/terms", label: "Terms of Service", icon: <BookOpen className="h-5 w-5" /> },
  );
  return (
    <AppShell
      title={panel?.store_name || "LinkBoost Growth SMM"}
      items={items}
      home="/app"
      brand={panel ? { name: panel.store_name, color: panel.brand_color, logoutTo: `/store/${panel.store_slug}` } : null}
    />
  );
}

export function AdminLayout() {
  return (
    <AppShell
      title="Admin"
      home="/admin"
      dense
      groups={[
        {
          items: [
            { to: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, end: true },
          ],
        },
        {
          label: "Commerce",
          items: [
            { to: "/admin/new-order", label: "New Order", icon: <ShoppingCart className="h-5 w-5" /> },
            { to: "/admin/orders", label: "Orders", icon: <ShoppingCart className="h-5 w-5" /> },
            { to: "/admin/refills", label: "Refills", icon: <RefreshCcw className="h-5 w-5" /> },
            { to: "/admin/products", label: "Services", icon: <Boxes className="h-5 w-5" /> },
            { to: "/admin/platforms", label: "Platforms", icon: <Globe className="h-5 w-5" /> },
            { to: "/admin/categories", label: "Categories", icon: <Boxes className="h-5 w-5" /> },
            { to: "/admin/providers", label: "Providers", icon: <Plug className="h-5 w-5" /> },
          ],
        },
        {
          label: "People",
          items: [
            { to: "/admin/users", label: "Users", icon: <Users className="h-5 w-5" /> },
            { to: "/admin/resellers", label: "Resellers", icon: <Store className="h-5 w-5" /> },
            { to: "/admin/child-panels", label: "Child panels", icon: <Globe className="h-5 w-5" /> },
            { to: "/admin/affiliates", label: "Affiliates", icon: <Handshake className="h-5 w-5" /> },
            { to: "/admin/api", label: "API Management", icon: <Code2 className="h-5 w-5" /> },
          ],
        },
        {
          label: "Finance",
          items: [
            { to: "/admin/payments", label: "Payments", icon: <CreditCard className="h-5 w-5" /> },
            { to: "/admin/payouts", label: "Reseller payouts", icon: <Banknote className="h-5 w-5" /> },
            { to: "/admin/wallets", label: "Wallets", icon: <Wallet className="h-5 w-5" /> },
          ],
        },
        {
          label: "Operations",
          items: [
            { to: "/admin/support", label: "Support", icon: <Ticket className="h-5 w-5" /> },
            { to: "/admin/notifications", label: "Notifications", icon: <Bell className="h-5 w-5" /> },
            { to: "/admin/analytics", label: "Analytics", icon: <BarChart3 className="h-5 w-5" /> },
            { to: "/admin/audit", label: "Audit", icon: <Code2 className="h-5 w-5" /> },
            { to: "/admin/settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
          ],
        },
      ]}
    />
  );
}

export { PublicLayout, StoreLayout };
