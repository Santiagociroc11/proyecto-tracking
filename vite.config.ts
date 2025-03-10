import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          utils: ['xlsx', '@supabase/supabase-js']
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    // Configuración para evitar recargas innecesarias
    hmr: {
      overlay: false, // Desactiva el overlay de errores
      clientPort: 5173, // Puerto por defecto de Vite
      timeout: 5000, // Aumenta el timeout para evitar recargas por pérdida momentánea de conexión
    },
    watch: {
      usePolling: false, // Desactiva el polling
      interval: 1000, // Intervalo de chequeo más largo
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});