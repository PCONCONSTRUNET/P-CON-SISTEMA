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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('@mercadopago')) return 'vendor-mp';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
          }
        },
      },
    },
  },
}));
