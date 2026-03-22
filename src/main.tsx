import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
const isClientPortalRoute = ["/cliente", "/area-cliente", "/checkout"].some((route) =>
  window.location.pathname.startsWith(route)
);

if (manifestLink && isClientPortalRoute) {
  manifestLink.href = "/client-manifest.webmanifest";
}

createRoot(document.getElementById("root")!).render(<App />);
