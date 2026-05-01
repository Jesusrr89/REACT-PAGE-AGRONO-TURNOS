# Agronomía Central — Sitio React

Sitio web oficial del Club S. y D. Agronomía Central, con Portal del Socio
y sistema de pago de mensualidades.

## 🚀 Cómo ejecutarlo

Abrí una terminal DENTRO de esta carpeta (donde está este README) y corré:

```
npm install
npm run dev
```

La terminal te va a mostrar una URL tipo `http://localhost:5173/`.
Abrila en el navegador.

> ⚠️ La terminal tiene que quedar abierta mientras usás el sitio.

## 📦 Requisitos

- Node.js 18 o superior: https://nodejs.org (instalá la versión LTS)

## 🎯 Novedades

### Login — "Soy Jugador Agronomo"
Hacé clic en el botón de la navbar o del hero para ingresar con tu usuario.
El portal te muestra:
- Tu carnet digital con nombre, dorsal y categoría
- Tu estado actual (al día / con deuda)
- Historial de cuotas con montos y fechas de pago
- Monto total adeudado (si tenés deuda)

### 👤 Acceso de prueba

| Email            | Contraseña |
|------------------|------------|
| `test@test.com`  | `1234`     |

Este usuario accede al portal como "Jugador Agronomo" (dorsal #37) con
cuotas pendientes, para que puedas ver cómo funciona la sección de pagos.

### 💳 Métodos de pago

- **Transferencia bancaria** con CBU y alias (se copian al portapapeles)
- **Mercado Pago** (alias + botón, marcado como "Recomendado")
- **Efectivo en el club** (con dirección y horarios)
- **Débito automático** (adhesión por secretaría)

## 🔧 Comandos disponibles

- `npm install` — instala las dependencias (solo la primera vez)
- `npm run dev` — servidor de desarrollo con recarga automática
- `npm run build` — genera la versión de producción
- `npm run preview` — sirve la producción con headers de seguridad completos

## 📁 Estructura

```
ac-react/
├── public/
│   ├── favicon.svg
│   └── media/           ← fotos y videos del club (incl. logo)
├── src/
│   ├── App.jsx          ← todos los componentes
│   ├── main.jsx         ← punto de entrada
│   ├── styles/
│   │   └── global.css   ← estilos completos
│   └── utils/
│       └── security.js  ← sanitización + validación + rate limit
├── index.html
├── package.json
└── vite.config.js
```

## 🔒 Seguridad del login

- **Rate-limiter** contra fuerza bruta (2 segundos de cooldown por intento)
- **Sanitización** del usuario antes de buscar en la "base de datos"
- **Validación de longitud** para evitar inputs absurdamente largos
- **Escape de HTML** en todos los campos del sistema
- Modal con `aria-modal` y cerrado por tecla ESC (accesibilidad)

> ⚠️ **Importante para producción**: este sistema de login es un prototipo
> funcional. Para usar en producción real, es IMPRESCINDIBLE:
> 1. Mover la autenticación a un backend con HTTPS
> 2. Guardar las contraseñas hasheadas con bcrypt/argon2 (nunca en texto plano)
> 3. Usar JWT o sesiones firmadas con HttpOnly cookies
> 4. Implementar CSRF tokens en endpoints que modifican datos
> 5. Rate-limit server-side con captcha tras N intentos fallidos
> 6. Conectar con el sistema real de facturación del club

## 🔒 Seguridad general

- Headers de seguridad en producción: CSP, X-Frame-Options, HSTS, Referrer-Policy
- Iframe del mapa con `sandbox`
- `noopener noreferrer` en links externos
- Formularios con validación + sanitización anti-XSS

## 📱 Responsive

Mobile-first con breakpoints en 480/640/820/900/1024/1100 px.
El portal del socio, la tabla de cuotas y el modal de login están optimizados
para pantallas chicas.

## 📞 Datos del club

- **Dirección:** Bauness 958, Parque Chas, CABA
- **Teléfono:** 4524-2225
- **Buffet:** abierto todos los días de 9 a 24 hs
