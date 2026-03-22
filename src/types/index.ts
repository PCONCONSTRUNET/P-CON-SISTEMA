export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string; // CPF or CNPJ
  status: 'active' | 'inactive';
  createdAt: Date;
  lastAccess?: Date;
}

export interface Subscription {
  id: string;
  clientId: string;
  clientName: string;
  planName: string;
  value: number;
  status: 'active' | 'pending' | 'overdue' | 'cancelled';
  startDate: Date;
  lastPayment?: Date;
  nextPayment: Date;
}

export interface Payment {
  id: string;
  subscriptionId: string;
  clientName: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  paymentMethod: string;
  paidAt?: Date;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  paymentId: string;
  clientName: string;
  number: string;
  amount: number;
  issuedAt: Date;
  status: 'issued' | 'cancelled';
}

export interface Notification {
  id: string;
  clientId: string;
  type: 'payment_due' | 'payment_received' | 'payment_failed' | 'subscription_renewed';
  message: string;
  sentAt: Date;
  status: 'sent' | 'failed' | 'pending';
}

export interface DashboardMetrics {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  monthlyRevenue: number;
  renewedSubscriptions: number;
  expiredSubscriptions: number;
  upcomingRenewals: number;
  failedPayments: number;
}
