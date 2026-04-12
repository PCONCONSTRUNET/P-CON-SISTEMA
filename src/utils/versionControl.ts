import { APP_VERSION } from "../version";

/**
 * Sistema de Controle de Versão do Aplicativo.
 * Objetivo: Evitar bugs causados por cache antigo, localStorage incompatível e service workers.
 */

const VERSION_KEY = "app_version";

export const initVersionControl = async () => {
  try {
    const savedVersion = localStorage.getItem(VERSION_KEY);

    if (savedVersion !== APP_VERSION) {
      console.warn(`[VersionControl] Nova versão detectada: ${savedVersion || 'Nenhuma'} -> ${APP_VERSION}`);

      // UX: Exibir mensagem de atualização
      const root = document.getElementById("root");
      if (root) {
        root.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background-color: #0c1425; color: #ffffff; font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 20px;">
            <div style="width: 50px; height: 50px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 24px;"></div>
            <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 8px;">Atualizando sistema...</h2>
            <p style="font-size: 1rem; color: #94a3b8; max-width: 300px;">Estamos preparando o ambiente para melhor desempenho e estabilidade.</p>
            <style>
              @keyframes spin { to { transform: rotate(360deg); } }
            </style>
          </div>
        `;
      }

      // Salvar TODOS os dados críticos antes da limpeza
      const keysToPreserve: Record<string, string | null> = {
        'pcon_auth': localStorage.getItem('pcon_auth'),
        'pcon_client_auth': localStorage.getItem('pcon_client_auth'),
      };

      // Limpeza completa de cache e service workers
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        } catch (e) { console.error("Erro caches:", e); }
      }

      if ("serviceWorker" in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(r => r.unregister()));
        } catch (e) { console.error("Erro SW:", e); }
      }

      // Limpar localStorage (sem sessionStorage para preservar flags de reload)
      localStorage.clear();

      // Restaurar dados críticos + salvar nova versão
      localStorage.setItem(VERSION_KEY, APP_VERSION);
      for (const [key, value] of Object.entries(keysToPreserve)) {
        if (value !== null) {
          localStorage.setItem(key, value);
        }
      }

      console.log("[VersionControl] Limpeza concluída. Forçando recarregamento seguro.");

      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("v", Date.now().toString());
        url.searchParams.set("updated", "true");
        window.location.href = url.toString();
      }, 1000);
    }
  } catch (error) {
    console.error("[VersionControl] Erro crítico:", error);
    try { localStorage.setItem(VERSION_KEY, APP_VERSION); } catch (e) {}
  }
};


/**
 * Proteção extra contra erros de carregamento de recursos (ChunkLoadError).
 * Geralmente ocorre quando o app é atualizado e o navegador tenta carregar um JS antigo que não existe mais.
 */
export const setupErrorProtection = () => {
  const handleChunkError = (e: ErrorEvent | PromiseRejectionEvent) => {
    const message = (e as any).message || (e as any).reason?.message || "";
    if (
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("ChunkLoadError") ||
      message.includes("unexpected token '<'") // Geralmente erro de 404 retornando HTML
    ) {
      console.warn("[ErrorProtection] Detectado erro de recurso. Forçando atualização segura...");
      
      // Evita loops de reload caso o erro persista
      const lastReload = sessionStorage.getItem("last_emergency_reload");
      const now = Date.now();
      
      if (!lastReload || now - parseInt(lastReload) > 30000) {
        sessionStorage.setItem("last_emergency_reload", now.toString());
        
        // Limpeza mínima necessária para tentar recuperar
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      }
    }
  };

  window.addEventListener("error", handleChunkError);
  window.addEventListener("unhandledrejection", handleChunkError);
};

