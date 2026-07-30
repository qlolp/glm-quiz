import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    root: fileURLToPath(new URL('./frontend-v2', import.meta.url)),
    base: '/v2/',
    build: {
        outDir: fileURLToPath(new URL('./public/v2', import.meta.url)),
        emptyOutDir: true,
        sourcemap: true
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000'
        }
    },
    preview: {
        port: 4173,
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
