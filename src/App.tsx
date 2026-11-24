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

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Payments = lazy(() => import("./pages/Payments"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Contracts = lazy(() => import("./pages/Contracts"));
const Referrals = lazy(() => import("./pages/Referrals"));
const ClientCoupons = lazy(() => import("./pages/ClientCoupons"));
const ReferralForm = lazy(() => import("./pages/ReferralForm"));
const WhatsAppMessages = lazy(() => import("./pages/WhatsAppMessages"));
const WhatsAppReminders = lazy(() => import("./pages/WhatsAppReminders"));
const WhatsAppBroadcast = lazy(() => import("./pages/WhatsAppBroadcast"));
const Financial = lazy(() => import("./pages/Financial"));
const Expenses = lazy(() => import("./pages/Expenses"));
const EmailSettings = lazy(() => import("./pages/EmailSettings"));
const ContractPublic = lazy(() => import("./pages/ContractPublic"));
const EfiSettings = lazy(() => import("./pages/EfiSettings"));
const MercadoPagoSettings = lazy(() => import("./pages/MercadoPagoSettings"));

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
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
                    <Route path="/clients/:id" element={<ProtectedRoute><ClientProfile /></ProtectedRoute>} />
                    <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
                    <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
                    <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
                    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                    <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppMessages /></ProtectedRoute>} />
                    <Route path="/whatsapp/lembretes" element={<ProtectedRoute><WhatsAppReminders /></ProtectedRoute>} />
                    <Route path="/whatsapp/disparo" element={<ProtectedRoute><WhatsAppBroadcast /></ProtectedRoute>} />
                    <Route path="/contracts" element={<ProtectedRoute><Contracts /></ProtectedRoute>} />
                    <Route path="/referrals" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />
                    <Route path="/coupons" element={<ProtectedRoute><ClientCoupons /></ProtectedRoute>} />
                    <Route path="/financial" element={<ProtectedRoute><Financial /></ProtectedRoute>} />
                    <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
                    <Route path="/email" element={<ProtectedRoute><EmailSettings /></ProtectedRoute>} />
                    <Route path="/efi-settings" element={<ProtectedRoute><EfiSettings /></ProtectedRoute>} />
                    <Route path="/mercado-pago-settings" element={<ProtectedRoute><MercadoPagoSettings /></ProtectedRoute>} />
                    {/* Referral Form (Public) */}
                    <Route path="/indicar" element={<ReferralForm />} />
                    <Route path="/r/:slug" element={<ReferralForm />} />
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
