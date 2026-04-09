import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Define um timestamp fixo de build (sem perder propriedades imutáveis de nome)
const buildHash = Date.now().toString(36);

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Assegura que nenhum cache de ISP/Cloudflare engane o navegador
        entryFileNames: `assets/[name]-[hash]-${buildHash}.js`,
        chunkFileNames: `assets/[name]-[hash]-${buildHash}.js`,
        assetFileNames: `assets/[name]-[hash]-${buildHash}.[ext]`,
      },
    },
  },
}));
