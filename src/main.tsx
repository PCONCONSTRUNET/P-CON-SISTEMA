import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

import { initVersionControl, setupErrorProtection } from "./utils/versionControl";

// Função de inicialização segura
const initApp = async () => {
    try {
        // 1. Configura proteção contra erros de bundle (ChunkLoadError)
        setupErrorProtection();
        
        // 2. Aguarda verificação de versão (Pode forçar um reload se houver atualização)
        await initVersionControl();
        
        // 3. Renderiza o aplicativo
        createRoot(document.getElementById("root")!).render(
            <GlobalErrorBoundary>
                <App />
            </GlobalErrorBoundary>
        );
    } catch (error) {
        console.error("Erro fatal na inicialização:", error);
    }
};

initApp();
