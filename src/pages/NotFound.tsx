import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import BlueBackground from "@/components/BlueBackground";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen">
      <BlueBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="text-center px-6">
          <h1 className="mb-4 text-6xl font-bold text-foreground">404</h1>
          <p className="mb-6 text-xl text-muted-foreground">Página não encontrada</p>
          <a 
            href="/" 
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Voltar ao Início
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
