import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    basicSsl({ name: 'tops-scanner' }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // Ensures document navigations (especially from “Add to Home Screen”) get the SPA shell
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'TOPS Scanner',
        short_name: 'Scanner',
        description: 'Enterprise Asset & Container Tracking',
        start_url: '/',
        scope: '/',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
});
