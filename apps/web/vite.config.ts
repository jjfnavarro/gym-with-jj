import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'GYM WITH JJ',
        short_name: 'GYM WITH JJ',
        description: 'Your personal workout companion',
        theme_color: '#FAF8EC',
        background_color: '#FAF8EC',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,wav}'],
        maximumFileSizeToCacheInBytes: 4000000,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { chunkSizeWarningLimit: 850 },
});
