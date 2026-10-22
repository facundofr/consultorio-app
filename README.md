# Turnos IA

Reserva de turnos médicos online: el paciente conversa con un asistente de IA (o usa un formulario) y el equipo de la clínica gestiona todo desde `/admin`.

> Estado: **hito 1 de 6** — esquema de datos, seed y motor de disponibilidad. Ver [`DECISIONS.md`](./DECISIONS.md).

## Requisitos

- Node.js 22+ y pnpm 10 (`corepack enable`)
- PostgreSQL 17 (con Docker o sin Docker, ver abajo)

## Puesta en marcha (desarrollo)

```bash
pnpm install
cp .env.example .env              # completá las claves (ver abajo)

# Opción A — con Docker
docker compose -f docker-compose.dev.yml up -d     # Postgres :5432 + Mailpit :8025

# Opción B — sin Docker (Postgres 17 real desde npm, puerto 5433)
pnpm db:embedded                  # dejarlo corriendo en otra terminal
# y en .env: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/turnos

pnpm db:migrate
pnpm seed                         # datos de demo (inventados)
pnpm dev                          # http://localhost:3000
```

Generá las claves de datos personales con `openssl rand -base64 32` (una para `PII_ENCRYPTION_KEY` y otra para `PII_HASH_KEY`).
En Windows sin openssl: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | Todos los tests (unitarios + integración con Postgres real) |
| `pnpm test:unit` / `pnpm test:integration` | Por separado |
| `pnpm typecheck` / `pnpm lint` | Tipos y lint |
| `pnpm db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `pnpm db:migrate` | Aplica migraciones |
| `pnpm seed` / `pnpm seed --reset` | Carga datos de demo (con `--reset` vacía la base antes) |
| `pnpm db:embedded` | Postgres 17 local sin Docker |

Los tests de integración levantan su propio Postgres temporal (no tocan tu base). Para usar uno existente: `TEST_DATABASE_URL=...`.

## Estructura

```
src/
  app/                    rutas de Next.js
  db/                     esquema Drizzle, cliente, migrador, seed
  lib/                    utilidades puras (zonas horarias, cifrado, códigos)
  server/
    availability/         motor de disponibilidad (puro) + servicio con BD
    appointments/         alta de turnos (única puerta de entrada)
    patients/             alta/búsqueda de pacientes (datos cifrados)
drizzle/                  migraciones SQL
tests/integration/        tests contra Postgres real (concurrencia, reservas, seed)
```
