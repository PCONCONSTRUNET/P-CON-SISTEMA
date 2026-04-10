import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

import { initVersionControl, setupErrorProtection } from "./utils/versionControl";

// Inicializa o controle de versão e proteção contra erros de chunk (Tela Azul)
setupErrorProtection();
initVersionControl();


createRoot(document.getElementById("root")!).render(
    <GlobalErrorBoundary>
        <App />
    </GlobalErrorBoundary>
);
