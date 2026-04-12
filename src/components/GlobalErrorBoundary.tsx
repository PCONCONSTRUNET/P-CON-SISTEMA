import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
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
      
      // Preserve auth
      const adminAuth = localStorage.getItem('pcon_auth');
      const clientAuth = localStorage.getItem('pcon_client_auth');

      // THE CURE: The old database tokens/states are crashing the app.
      // We must completely wipe all client-side storage to act like a virgin browser.
      localStorage.clear();
      sessionStorage.clear(); // We cleared the crash count too, so we set it back.
      sessionStorage.setItem('react_crash_reload', (reloadCount + 1).toString());
      
      // Restore auth
      if (adminAuth) localStorage.setItem('pcon_auth', adminAuth);
      if (clientAuth) localStorage.setItem('pcon_client_auth', clientAuth);

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
        <div style={{ 
          padding: "40px", 
          color: "white", 
          textAlign: "center", 
          fontFamily: "sans-serif",
          backgroundColor: "#0a1628",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <h2>Ocorreu um erro no sistema.</h2>
          <div style={{ 
            marginTop: "20px", 
            marginBottom: "20px",
            padding: "15px", 
            background: "#1e293b", 
            borderRadius: "8px",
            textAlign: "left",
            fontSize: "12px",
            color: "#ef4444",
            maxWidth: "800px",
            width: "100%",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all"
          }}>
            <strong>{this.state.error?.name}: {this.state.error?.message}</strong>
            <br/><br/>
            {this.state.error?.stack}
          </div>
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
