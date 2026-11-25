import { ReactNode, Suspense, createContext, useContext, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar, { MobileHeader } from './Sidebar';
import BlueBackground from './BlueBackground';
import { preloadAllAdminRoutes } from '@/routes/adminRoutes';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
}

const AdminShellContext = createContext(false);

export const AdminShell = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      preloadAllAdminRoutes();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminShellContext.Provider value={true}>
      <div className="min-h-screen">
        <BlueBackground />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

        <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
          <Suspense fallback={<div className="p-4 sm:p-6 lg:p-8 min-h-[50vh]" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </AdminShellContext.Provider>
  );
};

const DashboardLayout = ({ children, title, subtitle, headerAction }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const insideAdminShell = useContext(AdminShellContext);

  const content = (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm sm:text-base text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {headerAction && (
          <div className="flex-shrink-0">{headerAction}</div>
        )}
      </header>

      <div>
        {children}
      </div>
    </div>
  );

  if (insideAdminShell) {
    return content;
  }

  return (
    <div className="min-h-screen">
      <BlueBackground />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

      <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        {content}
      </main>
    </div>
  );
};

export default DashboardLayout;
