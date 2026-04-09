import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

// Mecanismo infalível de Força Bruta para Limpeza de Dados:
// Ao subir uma nova versão crítica (como migração de bd ou domínio), mude este número.
// O app local de TODOS os clientes será completamente pulverizado em cache, assegurando integridade.
const APP_VERSION = "2.0.0"; 

const currentVersion = localStorage.getItem("APP_VERSION");
if (currentVersion !== APP_VERSION) {
    console.warn(`Atualização de sistema detectada: ${currentVersion} -> ${APP_VERSION}. Limpando todos os caches locais.`);
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("APP_VERSION", APP_VERSION);
    // Tenta desregistrar ServiceWorkers presos
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    }
    // Faz um reload limpo para buscar chunks novos
    window.location.reload();
}

createRoot(document.getElementById("root")!).render(
    <GlobalErrorBoundary>
        <App />
    </GlobalErrorBoundary>
);
