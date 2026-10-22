# Decisiones

Registro de decisiones tomadas por default cuando el pedido era ambiguo. Cada una se puede revisar.

## Generales

| # | Decisión | Por qué | Cómo cambiarla |
|---|----------|---------|----------------|
| D1 | **Next.js 16 sin Cache Components** (`cacheComponents` apagado). | Casi todo es dato en tiempo real (agenda, disponibilidad, admin). Cache Components obliga a envolver cada lectura de sesión/BD en `Suspense` o `use cache` sin beneficio real acá. | Activar en `next.config.ts` y migrar según la guía de Next. |
| D2 | **Teléfono y email del paciente cifrados** (AES-256-GCM) + **índice ciego** (HMAC-SHA256) para buscar por coincidencia exacta. | Ley 25.326: datos de salud sensibles. El cifrado protege ante una fuga de la base o de un backup; el HMAC permite buscar sin descifrar. | — |
| D2a | Consecuencia: en el admin, la búsqueda por teléfono/email es **exacta** (normalizada). La búsqueda por nombre es libre. | Un índice ciego no permite búsquedas parciales. | — |
| D2b | Consecuencia: **si se pierde `PII_ENCRYPTION_KEY` se pierden teléfonos y emails**. La clave se respalda aparte de los dumps. | — | — |
| D3 | **Solo modelos de IA gratuitos por default** (free tiers de Groq y Gemini, modelos `:free` de OpenRouter) + tope diario de tokens: al superarlo la app pasa sola a modo formulario. | Evitar costos sorpresa. | Variables `LLM_*` en `.env` (hito 4). |
| D4 | Desarrollo/tests con **PostgreSQL 17 real** vía `embedded-postgres` (npm) además de Docker. | Los tests de concurrencia necesitan Postgres de verdad; así corren en cualquier máquina sin Docker. | `TEST_DATABASE_URL` apunta a otro servidor. |

## Modelo de datos

| # | Decisión | Por qué |
|---|----------|---------|
| M1 | Especialidades, servicios, sedes, profesionales y pacientes pertenecen a **una clínica**. | Simplifica permisos: un `clinic_admin`/`staff` ve solo su clínica. |
| M2 | Un **servicio** (tipo de consulta) se asocia a una especialidad (o a ninguna = vale para todas). Un profesional ofrece todos los servicios activos de sus especialidades. | Evita una tabla profesional↔servicio que casi siempre replicaría la de especialidades. |
| M3 | `schedule_rules`: horario en **hora local de la clínica**, día ISO 1 (lunes)–7 (domingo). Si `end_time <= start_time` el bloque cruza la medianoche. Vigencia opcional `valid_from`/`valid_to`. | Las grillas se piensan en hora de pared, no en UTC. |
| M4 | `schedule_exceptions` con **alcance** `clinic` (feriados), `location` (cierre de sede) o `professional` (vacaciones, horario extra). Bloqueos y extras se guardan como instantes UTC. Los extras requieren profesional y sede. | Un feriado se carga una vez para toda la clínica. |
| M5 | Paciente identificado por **clínica + teléfono + nombre normalizado**. Familiares que comparten teléfono quedan como pacientes distintos. Nombre y email se actualizan en cada reserva. | No mezclar a una madre con su hijo por compartir celular. |
| M6 | Normalización de teléfonos argentinos a 10 dígitos (código de área + número), quitando `+54`, `9`, `0` y el `15`. | Que "011 15 1234-5678" y "+54 9 11 1234 5678" sean el mismo teléfono. |
| M7 | Estados que **ocupan agenda**: `confirmed`, `completed`, `no_show`. Los cancelados liberan el horario al instante. | Constraint `EXCLUDE USING gist (professional_id WITH =, during WITH &&)` con rangos `[)` (turnos pegados permitidos). |
| M8 | Código de turno `T-XXXXXX` con alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L). `cancel_token` de 256 bits; en la base se guarda solo su hash SHA-256. | Legible por teléfono; si se filtra la base no se pueden usar los enlaces. |
| M9 | Tablas de usuarios con el esquema de **Better Auth** (`users`, `sessions`, `accounts`, `verifications`) más `role` y `clinic_id`. | Better Auth: mantenida, sesiones en base de datos (revocables), adaptador Drizzle. Auth.js con credenciales solo permite JWT. |

## Motor de disponibilidad

| # | Decisión |
|---|----------|
| A1 | Los horarios candidatos siguen una **grilla anclada al inicio de cada bloque** de atención, con paso = `slot_step_minutes` (ajuste por clínica). Un turno fuera de grilla (cargado por admin) bloquea todos los candidatos que se superponen. |
| A2 | "Ahora + margen": un horario se ofrece si `inicio >= ahora + min_lead_minutes` (default 60). Con margen 0, un turno que empieza exactamente ahora se ofrece; uno que empezó hace 1 ms, no. |
| A3 | El horizonte de reserva (`booking_horizon_days`) recorta la búsqueda del paciente. El staff no tiene horizonte ni margen. |
| A4 | Un turno en **cualquier sede** bloquea al profesional en todas (no puede estar en dos lugares). Un bloqueo de sede solo afecta esa sede. |
| A5 | Si dos reglas se superponen en la misma sede, los horarios no se duplican. |

## Datos de demo

| # | Decisión |
|---|----------|
| S1 | Clínicas, personas, direcciones y teléfonos del seed son **inventados** (`.example`, "Av. Inventada"). |
| S2 | Feriados nacionales 2026 completos y los **inamovibles** de 2027 (los trasladables de 2027 aún no tienen decreto). Se editan desde el admin. Los "días no laborables con fines turísticos" no se cargan porque las clínicas suelen atender. |
