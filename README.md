# Turnos IA

Reserva de turnos médicos online: el paciente conversa con un asistente de IA (o usa un formulario) y el equipo de la clínica gestiona todo desde `/admin`.

> Estado: **hito 3 de 6**. Están listos el esquema, el seed, el motor de disponibilidad, el panel de administración, la reserva por formulario y la cancelación. Ver [`DECISIONS.md`](./DECISIONS.md).

## Requisitos

- Node.js 22+ y pnpm 10 (`corepack enable`)
- PostgreSQL 17 (con Docker o sin Docker, ver abajo)

## Puesta en marcha (desarrollo)

```bash
pnpm install
cp .env.example .env              # completá las claves (ver abajo)

# Opción A: con Docker
docker compose -f docker-compose.dev.yml up -d     # Postgres :5432 + Mailpit :8025

# Opción B: sin Docker (Postgres 17 real desde npm, puerto 5433)
pnpm db:embedded                  # dejarlo corriendo en otra terminal
# y en .env: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/turnos

pnpm db:migrate
pnpm seed                         # datos de demo (inventados) + usuarios del panel
pnpm dev                          # http://localhost:3000  ·  panel: http://localhost:3000/admin
```

Generá cada clave (`PII_ENCRYPTION_KEY`, `PII_HASH_KEY`, `BETTER_AUTH_SECRET`) con `openssl rand -base64 32`.
En Windows sin openssl: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### Usuarios de demo

`pnpm seed` crea estos usuarios. La contraseña es `SEED_ADMIN_PASSWORD`, o una aleatoria que se imprime una sola vez.

| Rol | Email | Puede |
|---|---|---|
| Superadmin | `superadmin@turnos.example` | Todo, en todas las clínicas |
| Administración | `admin@aurora.example`, `admin@aromos.example` | Todo dentro de su clínica |
| Recepción | `recepcion@aurora.example`, `recepcion@aromos.example` | Agenda, turnos y pacientes |

## Para el paciente

- **`/reservar`**: reserva paso a paso: clínica → sede → especialidad → profesional (o «el primero disponible») → tipo de consulta → día (solo se marcan días con horarios libres reales) → horario → datos y consentimiento → confirmación. Los pasos con una sola opción se saltean solos. El estado vive en la URL: funciona sin JavaScript y el botón «atrás» del navegador sirve.
- **`/turno/[código]?t=…`**: el enlace del email. Muestra el turno, «Agregar al calendario (.ics)» y el botón para cancelar si faltan más de las horas configuradas (24 por defecto). Pasado ese plazo muestra el teléfono de la clínica. Después de cancelar ofrece elegir otro horario con el mismo profesional.
- **`/turno`**: ver o cancelar con el **código + teléfono o email** usados al reservar.
- **`/privacidad`**: política de datos personales (Ley 25.326).

La regla de cancelación se evalúa **en el servidor, dentro de la transacción y con la hora del servidor**. Tests de borde: 24 h 00 m 00 s (se puede), 23 h 59 m 59 s (no), ya pasado, ya cancelado y cancelación doble simultánea (solo una gana).

## Panel de administración (`/admin`)

- **Agenda** por día o semana, por sede o por profesional. Tocá un hueco libre para agendar: buscás o creás al paciente y elegís uno de los horarios reales. Tocá un turno para moverlo o cancelarlo. Administración puede dar sobreturnos fuera de la grilla, pero nunca superpuestos.
- **Turnos**: listado con filtros (fechas, profesional, sede, estado, origen, código o paciente) y exportación CSV. Cada turno tiene su ficha con historial.
- **Pacientes**: búsqueda por nombre, o por teléfono, email o código completos (están cifrados).
- **Profesionales y horarios**: datos, especialidades, sedes, grilla semanal con vigencias, vacaciones y horarios extra.
- **Feriados y bloqueos**: de toda la clínica, de una sede o de un profesional. Al cargarlos avisa si hay turnos confirmados afectados.
- **Sedes, especialidades, tipos de consulta y preguntas frecuentes** (la FAQ es lo único que usa el asistente para responder).
- **Ajustes** por clínica: horas para cancelar (24 por defecto), grilla, horizonte, anticipación, recordatorio, textos del asistente, contacto y mensajes.
- **Usuarios** y roles, **auditoría** de acciones del equipo y **dashboard** (turnos del día, ocupación, cancelaciones, origen de las reservas y uso del LLM).

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | Tests unitarios + integración (con Postgres real temporal) |
| `pnpm test:unit` / `pnpm test:integration` | Por separado |
| `pnpm test:e2e` | E2E con Playwright contra el build de producción y una base temporal (`--rebuild` fuerza `next build`) |
| `pnpm typecheck` / `pnpm lint` | Tipos y lint |
| `pnpm db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `pnpm db:migrate` | Aplica migraciones |
| `pnpm seed` / `pnpm seed --reset` | Carga datos de demo (con `--reset` vacía la base antes) |
| `pnpm db:embedded` | Postgres 17 local sin Docker |

Los tests de integración y E2E levantan su propio Postgres y no tocan tu base. Antes del primer `pnpm test:e2e` instalá el navegador: `pnpm exec playwright install chromium`.

## Estructura

```
src/
  app/
    admin/                panel: login, (panel)/… pantallas, _actions (server actions)
    api/auth/             endpoints de Better Auth
    healthz/              chequeo de salud
  components/
    ui/                   componentes base (estilo shadcn/ui)
    admin/                kit de formularios, agenda, listas
  db/                     esquema Drizzle, cliente, migrador, seed
  lib/                    utilidades puras (zonas horarias, cifrado, códigos)
  server/
    availability/         motor de disponibilidad (puro) + servicio con BD
    appointments/         alta, cancelación, reprogramación y estados (única puerta de entrada)
    admin/                servicios del panel, todos con control de permisos y auditoría
    auth/                 Better Auth, roles y permisos, sesión
drizzle/                  migraciones SQL
tests/integration/        tests contra Postgres real (concurrencia, permisos, reservas…)
tests/e2e/                Playwright
```
