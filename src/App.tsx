import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientAuthProvider } from "@/contexts/ClientAuthContext";
import { GlobalDataProvider } from "@/contexts/GlobalDataContext";
import { AdminNotificationsProvider } from "@/contexts/AdminNotificationsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AdminShell } from "@/components/DashboardLayout";
import { AdminPages } from "@/routes/adminRoutes";

const Login = lazy(() => import("./pages/Login"));
const ReferralForm = lazy(() => import("./pages/ReferralForm"));
const ContractPublic = lazy(() => import("./pages/ContractPublic"));

const ClientLogin = lazy(() => import("./pages/ClientLogin"));
const ClientRegister = lazy(() => import("./pages/ClientRegister"));
const ClientForgotPassword = lazy(() => import("./pages/ClientForgotPassword"));
const ClientResetPassword = lazy(() => import("./pages/ClientResetPassword"));
const Checkout = lazy(() => import("./pages/Checkout"));
const SubscriptionCheckoutPublic = lazy(() => import("./pages/SubscriptionCheckoutPublic"));

const NotFound = lazy(() => import("./pages/NotFound"));
const Receipt = lazy(() => import("./pages/Receipt"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#06142e]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-full spinner-blue" />
      <p className="text-xs text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ClientAuthProvider>
          <GlobalDataProvider>
            <AdminNotificationsProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Suspense fallback={<RouteLoader />}>
                  <Routes>
                    {/* Admin Routes */}
                    <Route path="/" element={<Login />} />
                    <Route path="/admin" element={<Login />} />
                    <Route element={<ProtectedRoute><AdminShell /></ProtectedRoute>}>
                      <Route path="/dashboard" element={<AdminPages.Dashboard />} />
                      <Route path="/clients" element={<AdminPages.Clients />} />
                      <Route path="/clients/:id" element={<AdminPages.ClientProfile />} />
                      <Route path="/subscriptions" element={<AdminPages.Subscriptions />} />
                      <Route path="/payments" element={<AdminPages.Payments />} />
                      <Route path="/invoices" element={<AdminPages.Invoices />} />
                      <Route path="/notifications" element={<AdminPages.Notifications />} />
                      <Route path="/whatsapp" element={<AdminPages.WhatsAppMessages />} />
                      <Route path="/whatsapp/lembretes" element={<AdminPages.WhatsAppReminders />} />
                      <Route path="/whatsapp/disparo" element={<AdminPages.WhatsAppBroadcast />} />
                      <Route path="/contracts" element={<AdminPages.Contracts />} />
                      <Route path="/referrals" element={<AdminPages.Referrals />} />
                      <Route path="/coupons" element={<AdminPages.ClientCoupons />} />
                      <Route path="/financial" element={<AdminPages.Financial />} />
                      <Route path="/expenses" element={<AdminPages.Expenses />} />
                      <Route path="/email" element={<AdminPages.EmailSettings />} />
                      <Route path="/efi-settings" element={<AdminPages.EfiSettings />} />
                      <Route path="/mercado-pago-settings" element={<AdminPages.MercadoPagoSettings />} />
                    </Route>
                    {/* Referral Form (Public) */}
                    <Route path="/indicar" element={<ReferralForm />} />
                    <Route path="/r/:slug" element={<ReferralForm />} />
                    <Route path="/pagar/:id" element={<SubscriptionCheckoutPublic />} />
                    <Route path="/p/:id" element={<SubscriptionCheckoutPublic />} />
                    <Route path="/pagar-assinatura/:id" element={<SubscriptionCheckoutPublic />} />
                    <Route path="/contrato/:id" element={<ContractPublic />} />

                    {/* Client Routes */}
                    <Route path="/cliente" element={<ClientLogin />} />
                    <Route path="/portal" element={<ClientLogin />} />
                    <Route path="/cliente/cadastro" element={<ClientRegister />} />
                    <Route path="/cliente/recuperar-senha" element={<ClientForgotPassword />} />
                    <Route path="/cliente/nova-senha" element={<ClientResetPassword />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/area-cliente" element={<Checkout />} />

                    {/* Receipt Route (Public) */}
                    <Route path="/c/:id" element={<Receipt />} />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </AdminNotificationsProvider>
          </GlobalDataProvider>
        </ClientAuthProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
