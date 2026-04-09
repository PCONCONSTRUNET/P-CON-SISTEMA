import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React error:", error, errorInfo);
    
    const isChunkError = error.name === 'ChunkLoadError' || 
                         error.message.includes('Failed to fetch dynamically imported module') ||
                         error.message.includes('Importing a module script failed');

    // Prevent infinite reload loops
    const reloadCount = parseInt(sessionStorage.getItem('react_crash_reload') || '0');
    
    if (reloadCount < 2) {
      sessionStorage.setItem('react_crash_reload', (reloadCount + 1).toString());
      
      // THE CURE: The old database tokens/states are crashing the app.
      // We must completely wipe all client-side storage to act like a virgin browser.
      localStorage.clear();
      sessionStorage.clear(); // We cleared the crash count too, so we set it back.
      sessionStorage.setItem('react_crash_reload', (reloadCount + 1).toString());
      
      if (isChunkError) {
         console.warn("ChunkLoadError Detectado. Matando SW e forcando recarregamento pela rede...");
         if ('serviceWorker' in navigator) {
             navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
         }
         window.location.href = window.location.pathname + '?v=' + new Date().getTime();
         return;
      }

      console.warn("Cleared corrupted local data. Reloading application to recover...");
      window.location.href = window.location.pathname + '?clear=true';
    }
  }

  public render() {
    if (this.state.hasError) {
      // If it failed 2 times, show a hard fallback message instead of an endless blank blue screen.
      return (
        <div style={{ padding: "40px", color: "white", textAlign: "center", fontFamily: "sans-serif" }}>
          <h2>Ocorreu um erro no sistema.</h2>
          <p>Tente limpar o histórico/cache do seu navegador ou clique no botão abaixo.</p>
          <button 
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.href = '/';
            }}
            style={{ padding: "10px 20px", background: "#2563eb", border: "none", color: "white", borderRadius: "5px", cursor: "pointer", marginTop: "20px" }}
          >
            Restaurar Sistema
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
