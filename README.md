# Turnos RB Estética

App de reserva de turnos online para RB Estética (Villa Allende, Córdoba), con panel de administración
para gestionar turnos, servicios, horarios y fichas de clientas.

- **Frontend + backend:** Next.js 14 (App Router), todo en un solo proyecto.
- **Base de datos:** Postgres (Neon).
- **Deploy:** Vercel.

## Qué incluye

- Reserva pública: elegir tratamiento → día → horario → datos → confirmación.
- Panel `/admin` (con login): turnos de hoy, todos los turnos (cargar manual, cambiar estado, reprogramar,
  ajustar la duración de cada turno), servicios (precio, duración, días/horario), horarios y excepciones
  (abrir una fecha puntual fuera de lo habitual, o cerrar un día), y fichas de clientas (último diagnóstico
  e historial de tratamientos para seguimiento).

## Deploy (resumen)

1. `npm install`
2. Crear un proyecto en [Neon](https://neon.tech), copiar `DATABASE_URL` (pooled) y `DIRECT_URL` (directa)
   a un archivo `.env` (ver `.env.example`).
3. `openssl rand -hex 32` para generar `AUTH_SECRET` y sumarlo al `.env`.
4. `npx prisma migrate deploy` (crea las tablas).
5. Definir `ADMIN_EMAIL` / `ADMIN_PASSWORD` en `.env` y correr `npm run seed` (carga los 7 servicios de
   RB Estética y crea el primer usuario del panel).
6. `vercel --prod` (o conectar el repo desde el dashboard de Vercel) — cargar las mismas variables de
   entorno (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`) en Vercel → Project Settings → Environment Variables.

## Cosas a tener en cuenta (v1 → próximas mejoras)

- El login del panel es un único usuario compartido; sumar cuentas por persona es una mejora simple a futuro.
- No hay recordatorios automáticos por WhatsApp/email todavía (tuturno.io los tiene) — se puede sumar
  reutilizando la automatización de Make que ya existe para las publicaciones.
- No hay cobro de seña online (Mercado Pago) — v1 es solo reserva y gestión.
- Los turnos de "hoy" en el panel usan el huso horario del servidor (UTC); con el horario real de atención
  de RB Estética esto no genera problemas prácticos, pero es un detalle a afinar si se nota algo raro
  entre las 21:00 y las 00:00.
