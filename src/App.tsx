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
import Financial from "./pages/Financial";
import Expenses from "./pages/Expenses";
import EmailSettings from "./pages/EmailSettings";
import Budgets from "./pages/Budgets";
import BudgetForm from "./pages/BudgetForm";
import BudgetSettings from "./pages/BudgetSettings";
import BudgetPublic from "./pages/BudgetPublic";

import ClientLogin from "./pages/ClientLogin";
import ClientRegister from "./pages/ClientRegister";
import ClientImplementations from "./pages/ClientImplementations";
import Checkout from "./pages/Checkout";

import NotFound from "./pages/NotFound";
import Receipt from "./pages/Receipt";

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
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
                <Route path="/clients/:id" element={<ProtectedRoute><ClientProfile /></ProtectedRoute>} />
                <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
                <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
                <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
                 <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                 <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppMessages /></ProtectedRoute>} />
                 <Route path="/whatsapp/lembretes" element={<ProtectedRoute><WhatsAppReminders /></ProtectedRoute>} />
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
                {/* Referral Form (Public) */}
                <Route path="/indicar" element={<ReferralForm />} />
                <Route path="/r/:slug" element={<ReferralForm />} />
                 <Route path="/proposta/:slug" element={<BudgetPublic />} />
                
                {/* Client Routes */}
                <Route path="/cliente" element={<ClientLogin />} />
                <Route path="/cliente/cadastro" element={<ClientRegister />} />
                <Route path="/cliente/implantacoes" element={<ClientImplementations />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/area-cliente" element={<Checkout />} />
                
                {/* Receipt Route (Public) */}
                <Route path="/:id" element={<Receipt />} />
                
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
