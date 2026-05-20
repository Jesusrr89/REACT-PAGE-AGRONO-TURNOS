import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// En desarrollo no aplicamos CSP estricta (Vite necesita inline scripts para el HMR).
// Los headers de seguridad completos se aplican en el build de producción / preview.
//
// El host de Supabase se inyecta en la CSP a partir de VITE_SUPABASE_URL (.env).
// El .htaccess generado en dist/ también recibe la sustitución (ver plugin de abajo).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawUrl = (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseHost = rawUrl.replace(/^https?:\/\//, '') || 'placeholder.supabase.co';

  const csp =
    "default-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "script-src 'self'; " +
    "frame-src 'self' https://www.openstreetmap.org; " +
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}; ` +
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';";

  return {
    plugins: [
      react(),
      {
        name: 'ac-inject-supabase-host',
        apply: 'build',
        closeBundle() {
          // Archivos en dist/ que contienen __SUPABASE_HOST__ y deben recibir la
          // sustitución después de que Vite los copie:
          // - .htaccess: Hostinger / Apache (target principal)
          // - _headers:  Netlify / Cloudflare Pages
          //
          // OJO: vercel.json se queda con el valor literal en root porque Vercel
          // lo lee desde la raíz del repo, no desde dist/. Si algún día se
          // mueve el deploy a Vercel y cambia el proyecto Supabase, hay que
          // actualizar vercel.json a mano además del .env.
          const targets = [
            path.resolve('dist/.htaccess'),
            path.resolve('dist/_headers')
          ];
          for (const file of targets) {
            if (!fs.existsSync(file)) continue;
            const original = fs.readFileSync(file, 'utf8');
            if (!original.includes('__SUPABASE_HOST__')) continue;
            fs.writeFileSync(file, original.replace(/__SUPABASE_HOST__/g, supabaseHost));
          }
        }
      }
    ],
    server: {
      port: 5173,
      strictPort: false,
      host: 'localhost'
    },
    preview: {
      port: 4173,
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), accelerometer=()',
        'Content-Security-Policy': csp
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'supabase': ['@supabase/supabase-js']
          }
        }
      }
    }
  };
});
