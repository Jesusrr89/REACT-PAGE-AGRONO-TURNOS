# Agronomía Central — Sitio React

Sitio oficial del Club S. y D. Agronomía Central, con Portal del Socio
y Panel Admin.

## 🚀 Cómo ejecutarlo

```bash
npm install
npm run dev
```

La terminal abre `http://localhost:5173/`.

> ⚠️ Necesitás Node.js 18+ ([nodejs.org](https://nodejs.org), versión LTS).

## 🔧 Setup inicial (una vez)

El backend corre sobre **Supabase** (Postgres + Auth + Edge Functions).

1. Crear proyecto en [supabase.com](https://supabase.com) (free tier alcanza).
2. Aplicar el schema y crear el primer admin → ver [`supabase/README.md`](./supabase/README.md).
3. Configurar `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deployar la Edge Function `invite-socio` (paso 5 del README de Supabase).

## 📁 Estructura

```
ac-react/
├── public/                  ← assets estáticos (logo, fotos)
├── src/
│   ├── App.jsx              ← componentes de la SPA
│   ├── main.jsx             ← entry point
│   ├── styles/global.css    ← estilos
│   └── utils/
│       ├── supabase.js      ← cliente Supabase
│       ├── api.js           ← wrappers (login, sesión, helpers)
│       ├── session.js       ← persistencia local del socio
│       └── security.js      ← validaciones de inputs
├── supabase/
│   ├── migrations/          ← SQL del schema (tablas + RLS + triggers)
│   ├── seed.sql             ← config inicial del club
│   ├── functions/           ← Edge Functions
│   │   └── invite-socio/    ← crea sockets + manda mail de invitación
│   └── README.md            ← setup paso a paso
├── apps-script-legacy/      ← backend viejo en Google Apps Script (referencia)
├── index.html
└── package.json
```

## 🎯 Funcionalidad

### Portal del socio (`/`)
- Login con email/contraseña (Supabase Auth)
- Carnet digital (nombre, dorsal, categoría, estado de cuenta)
- Historial de cuotas con saldo, recargos, fechas
- Métodos de pago: transferencia bancaria, WhatsApp al club
- Reset de contraseña por mail

### Panel admin
Acceso con un usuario que tenga `role='admin'` en `profiles`.

Pestañas:
- **Resumen** — KPIs (socios activos, al día, con deuda, cobrado del mes)
- **Socios** — listado con buscador y filtros, crear nuevo socio (manda invitación), desactivar/reactivar, marcar pagos manuales
- **Cuotas** — quién está al día / con deuda, marcar pagado en bulk
- **Pagos** — audit trail de todas las operaciones
- **Configuración** — CBU, alias, WhatsApp, montos del cron, etc.

## 🔧 Comandos

- `npm run dev` — servidor de desarrollo con recarga automática
- `npm run build` — versión de producción en `dist/`
- `npm run preview` — sirve la prod con headers de seguridad

## 🔒 Seguridad

- **Auth**: Supabase Auth (PBKDF2, sesiones JWT, refresh automático).
- **RLS**: cada socio solo ve su fila en `profiles` y sus cuotas/pagos. Admin ve todo.
- **Edge Function `invite-socio`**: el `service_role` nunca toca el browser.
- **Headers de prod**: CSP, X-Frame-Options, HSTS, Referrer-Policy
  (`vercel.json` para Vercel, `public/_headers` para Netlify).
- Iframes con `sandbox`, links externos con `noopener noreferrer`.

## 📞 Datos del club

- **Dirección:** Bauness 958, Parque Chas, CABA
- **Teléfono:** 4524-2225
- **Buffet:** abierto todos los días de 9 a 24 hs
