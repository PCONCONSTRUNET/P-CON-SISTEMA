import { lazy, ComponentType } from 'react';

type PageModule = { default: ComponentType<any> };
type RouteLoaderFn = () => Promise<PageModule>;

export const adminRouteLoaders = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/financial': () => import('@/pages/Financial'),
  '/expenses': () => import('@/pages/Expenses'),
  '/clients': () => import('@/pages/Clients'),
  '/clients/:id': () => import('@/pages/ClientProfile'),
  '/subscriptions': () => import('@/pages/Subscriptions'),
  '/payments': () => import('@/pages/Payments'),
  '/contracts': () => import('@/pages/Contracts'),
  '/invoices': () => import('@/pages/Invoices'),
  '/notifications': () => import('@/pages/Notifications'),
  '/whatsapp': () => import('@/pages/WhatsAppMessages'),
  '/whatsapp/lembretes': () => import('@/pages/WhatsAppReminders'),
  '/whatsapp/disparo': () => import('@/pages/WhatsAppBroadcast'),
  '/email': () => import('@/pages/EmailSettings'),
  '/coupons': () => import('@/pages/ClientCoupons'),
  '/referrals': () => import('@/pages/Referrals'),
  '/efi-settings': () => import('@/pages/EfiSettings'),
  '/mercado-pago-settings': () => import('@/pages/MercadoPagoSettings'),
} satisfies Record<string, RouteLoaderFn>;

const loadedCache = new Map<string, Promise<PageModule>>();

export function preloadAdminRoute(path: string) {
  const loader = (adminRouteLoaders as Record<string, RouteLoaderFn | undefined>)[path];
  if (!loader || loadedCache.has(path)) return;
  const p = loader().catch(() => {
    loadedCache.delete(path);
    return undefined as unknown as PageModule;
  });
  loadedCache.set(path, p);
}

let allPrefetched = false;

export function preloadAllAdminRoutes() {
  if (allPrefetched) return;
  allPrefetched = true;

  // Prioriza as abas mais acessadas e aquece o restante logo em seguida
  const priorityPaths = [
    '/dashboard',
    '/clients',
    '/subscriptions',
    '/payments',
    '/invoices',
    '/notifications',
    '/financial',
  ];
  const secondaryPaths = Object.keys(adminRouteLoaders).filter((p) => !priorityPaths.includes(p));

  priorityPaths.forEach((path) => preloadAdminRoute(path));
  setTimeout(() => {
    secondaryPaths.forEach((path) => preloadAdminRoute(path));
  }, 500);
}

export const AdminPages = {
  Dashboard: lazy(adminRouteLoaders['/dashboard']),
  Financial: lazy(adminRouteLoaders['/financial']),
  Expenses: lazy(adminRouteLoaders['/expenses']),
  Clients: lazy(adminRouteLoaders['/clients']),
  ClientProfile: lazy(adminRouteLoaders['/clients/:id']),
  Subscriptions: lazy(adminRouteLoaders['/subscriptions']),
  Payments: lazy(adminRouteLoaders['/payments']),
  Contracts: lazy(adminRouteLoaders['/contracts']),
  Invoices: lazy(adminRouteLoaders['/invoices']),
  Notifications: lazy(adminRouteLoaders['/notifications']),
  WhatsAppMessages: lazy(adminRouteLoaders['/whatsapp']),
  WhatsAppReminders: lazy(adminRouteLoaders['/whatsapp/lembretes']),
  WhatsAppBroadcast: lazy(adminRouteLoaders['/whatsapp/disparo']),
  EmailSettings: lazy(adminRouteLoaders['/email']),
  ClientCoupons: lazy(adminRouteLoaders['/coupons']),
  Referrals: lazy(adminRouteLoaders['/referrals']),
  EfiSettings: lazy(adminRouteLoaders['/efi-settings']),
  MercadoPagoSettings: lazy(adminRouteLoaders['/mercado-pago-settings']),
};
