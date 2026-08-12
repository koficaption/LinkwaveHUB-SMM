import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, ThemeProvider } from "@/contexts/AuthContext";
import { AdminLayout, CustomerLayout, Guard, PublicLayout } from "@/layouts/Guards";
import { HomePage } from "@/pages/public/HomePage";
import { LoginPage, RegisterPage, AuthCallbackPage } from "@/pages/auth/AuthPages";
import { ServiceDetailPage, ServicesPage, StorefrontPage } from "@/pages/public/ServicesPages";
import {
  CustomerHome, NotificationsPage, OrderDetailPage, OrdersPage, ProfilePage, SupportPage, WalletPage,
} from "@/pages/customer/CustomerPages";
import { ResellerDashboard, ResellerPricingPage, ResellerStorefrontPage } from "@/pages/reseller/ResellerPages";
import { AdminAnalytics, AdminOverview } from "@/pages/admin/AdminOverview";
import { AdminCategories, AdminPlatforms, AdminProducts, AdminProviders } from "@/pages/admin/AdminCatalog";
import {
  AdminAudit, AdminOrders, AdminPayments, AdminResellers, AdminSettings, AdminSupport, AdminUserDetail, AdminUsers, AdminWallets,
} from "@/pages/admin/AdminOps";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/services/:slug" element={<ServiceDetailPage />} />
                <Route path="/store/:slug" element={<StorefrontPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
              </Route>
              <Route element={<Guard />}>
                <Route element={<CustomerLayout />}>
                  <Route path="/app" element={<CustomerHome />} />
                  <Route path="/app/orders" element={<OrdersPage />} />
                  <Route path="/app/orders/:id" element={<OrderDetailPage />} />
                  <Route path="/app/wallet" element={<WalletPage />} />
                  <Route path="/app/profile" element={<ProfilePage />} />
                  <Route path="/app/support" element={<SupportPage />} />
                  <Route path="/app/notifications" element={<NotificationsPage />} />
                  <Route path="/app/reseller" element={<Guard roles={["reseller", "admin"]}><ResellerDashboard /></Guard>} />
                  <Route path="/app/reseller/storefront" element={<Guard roles={["reseller", "admin"]}><ResellerStorefrontPage /></Guard>} />
                  <Route path="/app/reseller/pricing" element={<Guard roles={["reseller", "admin"]}><ResellerPricingPage /></Guard>} />
                </Route>
              </Route>
              <Route element={<Guard roles={["admin"]} />}>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<AdminOverview />} />
                  <Route path="/admin/orders" element={<AdminOrders />} />
                  <Route path="/admin/products" element={<AdminProducts />} />
                  <Route path="/admin/platforms" element={<AdminPlatforms />} />
                  <Route path="/admin/categories" element={<AdminCategories />} />
                  <Route path="/admin/providers" element={<AdminProviders />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/admin/users/:id" element={<AdminUserDetail />} />
                  <Route path="/admin/resellers" element={<AdminResellers />} />
                  <Route path="/admin/payments" element={<AdminPayments />} />
                  <Route path="/admin/wallets" element={<AdminWallets />} />
                  <Route path="/admin/support" element={<AdminSupport />} />
                  <Route path="/admin/notifications" element={<NotificationsPage />} />
                  <Route path="/admin/analytics" element={<AdminAnalytics />} />
                  <Route path="/admin/settings" element={<AdminSettings />} />
                  <Route path="/admin/audit" element={<AdminAudit />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
