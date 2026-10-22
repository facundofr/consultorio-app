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

## Panel de administración (hito 2)

| # | Decisión | Por qué |
|---|----------|---------|
| P1 | **Permisos**: `superadmin` todo; `clinic_admin` todo dentro de su clínica (no crea clínicas ni superadmins); `staff` (recepción) agenda, turnos y pacientes, y ve el catálogo en solo lectura. Matriz en `src/server/auth/rbac.ts`. | Recepción no debería cambiar horarios ni reglas. |
| P2 | Cada función de `src/server/admin/*` valida rol **y** clínica. Las server actions solo traducen formularios. Lo que no se puede ver devuelve 404 (no 403), para no confirmar que existe. | El control no depende de la UI y está testeado a nivel servicio. |
| P3 | El superadmin elige la clínica activa con un selector (cookie `httpOnly`). El resto trabaja siempre en la suya. | Un panel por clínica, sin mezclar datos. |
| P4 | Sesiones en base de datos, 12 h. Cambiar contraseña, rol, clínica o desactivar a un usuario **cierra sus sesiones**. Nadie puede bajarse el rol ni desactivarse a sí mismo. | Que un cambio de permisos tenga efecto inmediato. |
| P5 | Login limitado a 5 intentos por email y 20 por IP cada 15 minutos. Sin registro público: los usuarios los crea un admin. | Fuerza bruta. |
| P6 | **Sobreturnos**: administración (no recepción) puede agendar o mover fuera de la grilla publicada. Igual nunca se superpone (lo impide la base). | Caso real de consultorio, sin romper el anti doble turno. |
| P7 | Mover un turno: diálogo con día y horarios libres reales (no arrastrar). Reinicia el recordatorio. | Más accesible por teclado y lector de pantalla. Arrastrar queda como mejora. |
| P8 | Pacientes cargados por el equipo: email **opcional** y sin consentimiento online (se registra «Cargado por el equipo»). Si ya existe con ese teléfono y nombre, se reutiliza. | En recepción no siempre hay email. |
| P9 | Bajas lógicas para sedes, especialidades, servicios, FAQ, profesionales, pacientes y clínicas. No se puede dar de baja algo con turnos futuros confirmados. Los **feriados y bloqueos se borran de verdad** (son configuración) y queda registro en auditoría. | Conservar historial sin dejar turnos huérfanos. |
| P10 | Cargar un bloqueo **no cancela** turnos automáticamente: avisa cuántos quedan afectados para que el equipo decida. | Cancelar es una decisión humana (hay que avisar al paciente). |
| P11 | El CSV incluye teléfono y email descifrados, separados por `;` y con BOM UTF-8 para Excel es-AR. Se protege contra inyección de fórmulas y **cada exportación queda en auditoría**. | Uso habitual de recepción, con trazabilidad. |
| P12 | La auditoría guarda ids y **nombres de campos** cambiados, nunca valores de datos personales. | Ley 25.326: el log no puede ser otra copia de los datos. |
| P13 | Un turno puede marcarse atendido o ausente, y volver a confirmado. Un turno cancelado no se reactiva: se crea uno nuevo. | Historial claro. |

## Interfaz

| # | Decisión | Por qué |
|---|----------|---------|
| U1 | Componentes estilo **shadcn/ui escritos a mano** (Radix + CVA + Tailwind) en `src/components/ui`, con `components.json` para usar `shadcn add` después. | El registro de shadcn no era accesible desde el entorno de desarrollo. El resultado es el mismo código. |
| U2 | Tipografía **Atkinson Hyperlegible Next**, servida desde la propia app (sin Google Fonts). Paleta eucalipto sobre blanco mineral; el amarillo «sol» marca solo lo importante del momento (horario elegido, hoy, la hora actual). | Diseñada para baja visión, pensando en pacientes mayores. Sin pedidos a terceros. |
| U3 | Solo tema claro por ahora. | Menos superficie para revisar contraste. Se puede sumar. |
| U4 | Selects nativos en formularios, búsquedas por GET y pestañas por URL. | Funcionan sin JavaScript, son accesibles y el estado queda en la URL. |

## Reserva y cancelación del paciente (hito 3)

| # | Decisión | Por qué |
|---|----------|---------|
| R1 | El formulario es un **asistente paso a paso con el estado en la URL** (`/reservar?clinica=…&especialidad=…`), renderizado en el servidor. Cada paso se valida en el servidor; un parámetro inválido vuelve a ese paso. | Funciona sin JavaScript (accesibilidad), el «atrás» del navegador anda y se puede compartir el enlace. |
| R2 | Formulario y asistente usan la **misma capa** `src/server/booking/public.ts` (catálogo, `findSlots`, `bookPublic`, `findAppointmentPublic`, `cancelPublic`). | Un único lugar para las reglas. |
| R3 | «El primero disponible» combina los horarios de todos los profesionales de la especialidad. En cada horario se ofrece un solo profesional (el primero por orden alfabético). | Evitar horarios repetidos. |
| R4 | La confirmación pide una casilla de consentimiento obligatoria (texto y versión guardados en el paciente). Hay un campo trampa invisible contra bots y un límite de 10 reservas por IP por hora. | Ley 25.326 y spam. |
| R5 | Segundo dato para ver un turno: **token del enlace** (256 bits, solo se guarda su hash) **o teléfono o email** del paciente. El error es siempre el mismo («no encontramos un turno con esos datos»), para no confirmar que un código existe. Límites: 15 consultas por IP cada 15 minutos y 8 por código por hora. | Evitar que se adivinen turnos ajenos. |
| R6 | La regla de cancelación es `ahora ≤ inicio − horas configuradas`. Justo en el límite se puede cancelar; un segundo después, no. Se evalúa con un `SELECT … FOR UPDATE` dentro de la transacción. | Lo pide el §6 y evita que dos cancelaciones simultáneas pasen las dos. |
| R7 | Las páginas `/turno/*` envían `Referrer-Policy: no-referrer`, `noindex` y `no-store`. | El enlace lleva el token: no se puede filtrar por el Referer ni quedar en caché. |
| R8 | El `.ics` usa horas UTC, una alarma 2 h antes, y `METHOD:CANCEL` si el turno se canceló. | Compatible con Google Calendar, Apple y Outlook. |
