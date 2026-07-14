import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientAuthProvider } from "@/contexts/ClientAuthContext";
import { GlobalDataProvider } from "@/contexts/GlobalDataContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientProfile from "./pages/ClientProfile";
import Subscriptions from "./pages/Subscriptions";
import Payments from "./pages/Payments";
import Invoices from "./pages/Invoices";
import Notifications from "./pages/Notifications";
import Contracts from "./pages/Contracts";
import Referrals from "./pages/Referrals";
import Implementations from "./pages/Implementations";
import ClientCoupons from "./pages/ClientCoupons";
import ReferralForm from "./pages/ReferralForm";
import WhatsAppMessages from "./pages/WhatsAppMessages";
import WhatsAppReminders from "./pages/WhatsAppReminders";
import WhatsAppBroadcast from "./pages/WhatsAppBroadcast";
import Financial from "./pages/Financial";
import Expenses from "./pages/Expenses";
import EmailSettings from "./pages/EmailSettings";
import Budgets from "./pages/Budgets";
import BudgetForm from "./pages/BudgetForm";
import BudgetSettings from "./pages/BudgetSettings";
import BudgetPublic from "./pages/BudgetPublic";
import ContractPublic from "./pages/ContractPublic";
import EfiSettings from "./pages/EfiSettings";

import ClientLogin from "./pages/ClientLogin";
import ClientRegister from "./pages/ClientRegister";
import ClientImplementations from "./pages/ClientImplementations";
import ClientForgotPassword from "./pages/ClientForgotPassword";
import ClientResetPassword from "./pages/ClientResetPassword";
import Checkout from "./pages/Checkout";
import PaymentLinks from "./pages/PaymentLinks";
import PaymentLinkPublic from "./pages/PaymentLinkPublic";
import SubscriptionCheckoutPublic from "./pages/SubscriptionCheckoutPublic";

import NotFound from "./pages/NotFound";
import Receipt from "./pages/Receipt";
import PortfolioPublic from "./pages/PortfolioPublic";
import PortfolioAdmin from "./pages/PortfolioAdmin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ClientAuthProvider>
          <GlobalDataProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
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
                 <Route path="/implementations" element={<ProtectedRoute><Implementations /></ProtectedRoute>} />
                 <Route path="/coupons" element={<ProtectedRoute><ClientCoupons /></ProtectedRoute>} />
                 <Route path="/financial" element={<ProtectedRoute><Financial /></ProtectedRoute>} />
                 <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
                 <Route path="/email" element={<ProtectedRoute><EmailSettings /></ProtectedRoute>} />
                 <Route path="/budgets" element={<ProtectedRoute><Budgets /></ProtectedRoute>} />
                 <Route path="/budgets/new" element={<ProtectedRoute><BudgetForm /></ProtectedRoute>} />
                 <Route path="/budgets/:id" element={<ProtectedRoute><BudgetForm /></ProtectedRoute>} />
                 <Route path="/budgets/settings" element={<ProtectedRoute><BudgetSettings /></ProtectedRoute>} />
                 <Route path="/payment-links" element={<ProtectedRoute><PaymentLinks /></ProtectedRoute>} />
                 <Route path="/efi-settings" element={<ProtectedRoute><EfiSettings /></ProtectedRoute>} />
                 <Route path="/admin/portfolio" element={<ProtectedRoute><PortfolioAdmin /></ProtectedRoute>} />
                {/* Referral Form (Public) */}
                <Route path="/indicar" element={<ReferralForm />} />
                <Route path="/r/:slug" element={<ReferralForm />} />
                 <Route path="/proposta/:slug" element={<BudgetPublic />} />
                 <Route path="/pay/:slug" element={<PaymentLinkPublic />} />
                 <Route path="/pagar-assinatura/:id" element={<SubscriptionCheckoutPublic />} />
                 <Route path="/contrato/:id" element={<ContractPublic />} />
                
                {/* Client Routes */}
                <Route path="/cliente" element={<ClientLogin />} />
                <Route path="/portal" element={<ClientLogin />} />
                <Route path="/cliente/cadastro" element={<ClientRegister />} />
                <Route path="/cliente/recuperar-senha" element={<ClientForgotPassword />} />
                <Route path="/cliente/nova-senha" element={<ClientResetPassword />} />
                <Route path="/cliente/implantacoes" element={<ClientImplementations />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/area-cliente" element={<Checkout />} />
                
                {/* Receipt Route (Public) */}
                <Route path="/c/:id" element={<Receipt />} />
                
                {/* Portfolio Route (Public) */}
                <Route path="/portfolio" element={<PortfolioPublic />} />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </GlobalDataProvider>
        </ClientAuthProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
