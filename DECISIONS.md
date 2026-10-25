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
| U3 | ~~Solo tema claro.~~ Reemplazada por X6 (tema claro y oscuro). | — |
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

## Asistente de IA (hito 4)

| # | Decisión | Por qué |
|---|----------|---------|
| IA1 | **Cliente propio compatible con OpenAI** (`fetch`, sin SDK) para Groq, Gemini (endpoint `/v1beta/openai`) y OpenRouter. Se prueban en el orden de `LLM_PROVIDERS`; ante error HTTP, límite, respuesta vacía o `LLM_TIMEOUT_MS` sigue el siguiente. Cada intento, bueno o malo, queda en `llm_usage`. | Los tres hablan el mismo protocolo con herramientas. Menos dependencias y el respaldo es explícito. |
| IA2 | Modelos por defecto: `llama-3.3-70b-versatile` (Groq), `gemini-2.5-flash` (Gemini), `meta-llama/llama-3.3-70b-instruct:free` (OpenRouter). Se cambian por variable. | Gratuitos y con herramientas en octubre de 2026. Los catálogos cambian seguido. |
| IA3 | **El modelo nunca reserva ni cancela.** Sus herramientas solo buscan horarios (`buscar_horarios`) o muestran tarjetas (`ofrecer_reserva`, `gestionar_turno_existente`, `marcar_emergencia`). La reserva la confirma el paciente en la tarjeta, con su consentimiento, y pasa por `bookPublic` (la misma capa que el formulario, con revalidación en el servidor). | Un modelo puede equivocarse o ser manipulado. Lo irreversible lo decide una persona. |
| IA4 | **Códigos cortos en vez de ids**: el prompt lista sedes `L1`, especialidades `E1`, consultas `C1` y profesionales `P1`; los horarios ofrecidos son `H1`, `H2`… y se guardan en `conversations.state`. El servidor solo acepta horarios que él mismo ofreció en esa conversación. | El modelo no puede inventar un horario, ni apuntar a otra clínica ni a un id interno. |
| IA5 | **Datos personales fuera del modelo**: nombre, teléfono y email se cargan en la tarjeta (va directo al servidor). Lo que el paciente escriba con forma de email o de número largo (8+ dígitos: teléfono, DNI, tarjeta) se reemplaza antes de guardar y antes de llamar al modelo. Ver o cancelar un turno usa el mismo formulario seguro de `/turno` dentro del chat. | Ley 25.326, y los planes gratuitos pueden usar los textos para entrenar. |
| IA6 | **Urgencias sin modelo**: una lista de frases (dolor en el pecho, falta de aire, desmayo, convulsión, suicidio…) dispara el mensaje de emergencia de la clínica y marca la conversación como «posible urgencia». «Turno urgente» no dispara. El modelo además puede llamar a `marcar_emergencia`. | No depender de que el modelo responda bien (o responda) ante una emergencia. |
| IA7 | **Límites**: tokens por día entre todas las conversaciones (día local), tokens y mensajes por conversación, y rondas de herramientas por mensaje. Pasado un límite el chat ofrece el formulario y la conversación queda «límite de uso». | Evitar costos y abusos (D3). |
| IA8 | La conversación se crea **con el primer mensaje** (no al abrir la página) y el navegador guarda un secreto propio de esa conversación (en la base solo su hash). Al recargar la página empieza una nueva. | Sin conversaciones vacías por bots o precargas; nadie puede continuar una conversación ajena conociendo su id. |
| IA9 | **Retención**: las conversaciones se borran a los `CHAT_RETENTION_DAYS` días (30, como dice `/privacidad`; si se cambia, actualizar ese texto) y las inactivas por más de 24 h pasan a «sin terminar». Corre como mucho una vez por hora, al empezar una conversación. `llm_usage` se conserva sin el vínculo, para las estadísticas. | El registro sirve para auditar respuestas, no para acumular datos. |
| IA10 | Las transcripciones las ve **administración** de la clínica (y superadmin); recepción no. Abrir una queda en auditoría. | Pueden contener información de salud que el paciente escribió. |
| IA11 | `LLM_MOCK=1`: modelo simulado local que usa las herramientas reales. Para E2E y demos sin claves. | Tests deterministas y sin red. |
| IA12 | Respuestas sin streaming: cada mensaje es una server action que devuelve el texto y las tarjetas. | Más simple y robusto; con los modelos rápidos la espera es corta. Streaming queda como mejora. |

## Correcciones del hito 4

| # | Decisión | Por qué |
|---|----------|---------|
| C1 | Las altas y movimientos de turnos toman un **lock transaccional por profesional** (`pg_advisory_xact_lock`) antes de revalidar. Si igual aparece un deadlock o un error de serialización, se reintenta. La restricción de exclusión sigue siendo la última barrera. | Con muchas reservas simultáneas del mismo horario Postgres detectaba deadlocks (~1 s cada uno) y uno se escapaba como error genérico en vez de «alguien tomó ese horario». El test de concurrencia fallaba de forma intermitente. |
| C2 | La sesión del panel lee los headers **antes** de tocar la base. | `next build` sin `DATABASE_URL` fallaba al intentar prerenderizar `/admin` (rompía el E2E en CI). |
| C3 | `scripts/e2e.ts` lanza Playwright con `shell` en Windows. | `pnpm` es un `.cmd` en Windows y fallaba sin mensaje. |

## Mejoras de experiencia (después del hito 4)

| # | Decisión | Por qué |
|---|----------|---------|
| X1 | Mientras no haya emails, ningún texto los promete. La confirmación muestra «Guardá este enlace» con **copiar** y **enviármelo por WhatsApp** (`wa.me`, sin número: el paciente elige el chat). | Era la única copia del enlace y la interfaz decía que llegaba por email. |
| X2 | En el chat, al confirmar un turno se **descartan los horarios ofrecidos antes** (`state.offers = []`) y sus tarjetas se ven bloqueadas. | Evitar dos reservas por tocar una tarjeta vieja. |
| X3 | El paso del día del formulario ofrece **«El próximo turno libre»**, que salta directo a la confirmación. | La mayoría quiere el primero disponible. |
| X4 | La portada no promete «24 horas»: el plazo es por clínica y se muestra antes de confirmar. | Era un número fijo para un ajuste configurable. |
| X5 | **Barra inferior en celular** (debajo de 768 px en el sitio y de 1024 px en el panel), con 4 accesos y una acción central elevada. Paciente: Inicio, Asistente, Reservar, Mi turno, Más. Panel (todos los roles): Inicio, Agenda (con globito de turnos de hoy), Nuevo turno, Pacientes, Más. «Más» abre una hoja desde abajo con el menú completo del rol. Reemplaza la hamburguesa del panel. | Pedido del usuario (estilo Mercado Pago): lo frecuente queda a un toque del pulgar y respeta el área segura del iPhone. |
| X6 | **Tema claro/oscuro** con un solo botón (luna en claro, sol en oscuro; los íconos cambian con `dark:` en CSS, así se ve el correcto desde el primer cuadro). Sin elección guardada sigue al sistema operativo. Usa la variante `dark` de Tailwind sobre la clase `.dark` en `<html>`. Un script mínimo en `<head>` lo aplica antes de pintar (sin parpadeo) y la elección vive en `localStorage`. La paleta oscura es eucalipto sobre grafito, con contraste AA. El texto sobre el amarillo «sol» es siempre oscuro (`--sol-foreground`) y el texto sobre rojo tiene su propio token. Sin dependencias nuevas. | Pedido del usuario. Todo pasa por tokens, así que los componentes no necesitan cambios por tema. |
| X7 | **Calendario de shadcn/ui** (`src/components/ui/calendar.tsx`, sobre `react-day-picker` 9, en español y con la semana empezando el lunes). En la agenda se usa en una **vista Mes** (turnos, ocupación, cancelados y feriados por día) y como **mini calendario** junto a Día y Semana. El resumen mensual (`getAgendaMonth`) suma la agenda semanal, así que respeta exactamente las mismas reglas de horarios y bloqueos, y los mismos permisos. | Pedido del usuario: ver el mes de un vistazo y saltar de fecha rápido. |

## Seguridad (revisión de octubre de 2026)

| # | Decisión | Por qué |
|---|----------|---------|
| S1 | **IP del visitante**: se toma la entrada de `X-Forwarded-For` que escribió *nuestro* proxy (la última, o la que indique `TRUSTED_PROXY_HOPS`), no la primera. También se puede leer otro encabezado con `CLIENT_IP_HEADER` (por ejemplo `x-real-ip`). Si el valor no es una IP, todos caen en un mismo grupo `unknown`. Ver `src/server/security/client-ip.ts`. | La primera entrada la escribe quien quiera: con ella cualquiera salteaba los límites de login, reservas y consultas cambiando un encabezado. |
| S2 | **Endpoints HTTP de Better Auth cerrados** salvo `get-session`, `ok` y `sign-out`. El login pasa solo por la acción del servidor. | Nada en la app usa esos endpoints, y `POST /api/auth/sign-in/email` permitía probar contraseñas sin nuestros límites ni auditoría. |
| S3 | **Límites de intentos en PostgreSQL** (tabla `rate_limits`): ventana fija que arranca con el primer intento, un `INSERT … ON CONFLICT` atómico por llamada, y la clave se guarda como HMAC (nunca el email ni la IP). Los vencidos se borran como mucho cada 10 minutos. | En memoria se reiniciaban con cada deploy y no servían con más de una instancia. Una ventana fija permite como mucho el doble del límite en el borde entre dos ventanas; para estos límites alcanza. |
| S4 | **Cabeceras de seguridad** en `src/proxy.ts`: CSP con *nonce* por pedido y `'strict-dynamic'`, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP` y, solo con `APP_URL` en HTTPS, HSTS y `upgrade-insecure-requests`. Los estilos permiten `'unsafe-inline'`. | El nonce impide ejecutar scripts inyectados. Consecuencia: el layout lee los headers y **todas las páginas se renderizan por pedido** (ya era así en casi todas, ver D1). Radix, Sonner y el calendario usan atributos `style`, que un nonce no cubre; los estilos no ejecutan código. |
| S5 | **Una reserva pública no cambia los datos de un paciente existente** (email ni nombre). Solo el equipo puede actualizarlos. | Conocer el teléfono y el nombre de alguien no prueba que seas esa persona, y el email sirve para ver o cancelar sus turnos. Consecuencia: si un paciente cambió de email, se sigue usando el anterior hasta que recepción lo actualice (el teléfono sigue sirviendo para buscar el turno). |
| S6 | **Exportar el CSV es solo de administración** (permiso `exports`; recepción no lo tiene y no ve el botón). La auditoría de la exportación guarda si hubo búsqueda, no el texto buscado. | El CSV trae todos los teléfonos y emails descifrados. El texto buscado puede ser un nombre o un teléfono (P12). |

## Emails, tareas y producción (octubre de 2026)

| # | Decisión | Por qué |
|---|----------|---------|
| E1 | **Cola de emails en la base** (`email_outbox`): el email se arma y se encola **en la misma transacción** que el turno (alta, cancelación, movimiento) y lo envía una tarea aparte con reintentos (1, 5 y 30 min, 2 h y 6 h, después «Falló»). | Si el proveedor falla, la reserva no falla, y nunca hay un email de un turno que no existe. |
| E2 | El contenido (destinatario, enlace con token) se guarda **cifrado** y **se borra al enviarse**. Para el listado queda el asunto, que no tiene datos del paciente. Los errores SMTP se guardan sin direcciones. | Ley 25.326: la cola no puede ser otra copia de los datos. |
| E3 | **SMTP genérico** (Nodemailer). Sin `SMTP_HOST`, nada sale: los emails quedan en la **bandeja de prueba** del panel con vista previa, y su contenido se borra a los 7 días. | Sirve con cualquier proveedor y se puede probar sin cuenta de email. |
| E4 | Solo el email de **confirmación** lleva el enlace de un toque (con token): es el único momento en que el token existe en claro. Cancelación, cambio y recordatorio enlazan a `/turno/CÓDIGO`, que pide teléfono o email. | Guardar el token para reenviarlo después anularía M8. |
| E5 | **Recordatorio**: se encola cuando faltan `reminder_hours`. Se marca el turno antes de encolar, así que dos tareas a la vez no lo duplican. Si el turno se sacó o se movió **dentro** de ese plazo, no se manda (ya recibió la confirmación). | Evitar emails repetidos. |
| E6 | Los `.ics` llevan `SEQUENCE` creciente y `METHOD:CANCEL` al cancelar. Además se corrigió el escape de `;` (RFC 5545). | Que el calendario del paciente reemplace o borre el evento en vez de duplicarlo. |
| J1 | **Tareas en segundo plano dentro de la app** (`src/instrumentation.ts`): emails cada minuto, recordatorios cada 5 minutos, limpieza cada hora (conversaciones, contenido de emails, contadores de intentos). Cada tarea reclama sus filas (`FOR UPDATE SKIP LOCKED` o un update condicional), así que varias instancias no se pisan. Alternativa: `JOBS_ENABLED=false` y `pnpm jobs` por cron. | Un solo proceso para operar y sin servicios extra. |
| J2 | No se marcan solos como «atendido» los turnos pasados. | Ocultaría las ausencias: lo decide el equipo. |
| F1 | **Doble factor propio con TOTP** (RFC 6238, probado con los vectores oficiales) y 10 códigos de respaldo. El secreto se cifra con `PII_ENCRYPTION_KEY` y los códigos se guardan como HMAC. No se usa el plugin de Better Auth. | El plugin depende de cookies y endpoints HTTP que cerramos (S2). Así, la regla vive en `getActor()`: una sesión de alguien con doble factor no vale hasta que `sessions.two_factor_verified_at` está marcado. |
| F2 | Un código no se acepta dos veces (se guarda el último paso de 30 s usado, con un update condicional contra pedidos simultáneos). Se toleran ±30 s de desfase. Hay 5 intentos cada 15 minutos por usuario, y los fallidos quedan en auditoría. | Que un código interceptado no sirva y no se pueda adivinar. |
| F3 | **Obligatorio por rol** con `TWO_FACTOR_REQUIRED_ROLES`. Hasta configurarlo, `requireActor()` manda a `/admin/seguridad`, que vive fuera del layout del panel con su propio control (`requireSignedIn`). La exportación CSV también lo exige. | Decidir según la ruta permitiría llamar cualquier acción del panel «desde» esa página y saltear la obligación. |
| F4 | Si alguien pierde el celular, **administración le quita el doble factor** (se cierran sus sesiones). Cada uno cambia su contraseña con la actual, y se cierran sus otras sesiones. | Recuperación sin depender del email. |
| D5 | **Producción con Docker**: imagen `runner` (salida standalone, usuario sin privilegios, healthcheck) e imagen `tools` (migraciones, `create-admin`, `jobs`). El compose de producción incluye Postgres sin puertos publicados, migraciones antes de arrancar, Caddy con HTTPS automático y backup diario con `pg_dump`. Probado de punta a punta con `DOMAIN=localhost`. | Un VPS chico alcanza, y se instala con un solo comando. |
| D6 | **Errores del servidor**: una línea JSON por error (ruta, tipo y mensaje; nunca headers, cuerpos ni query strings) y, con `ERROR_WEBHOOK_URL`, también por POST. Al arrancar, la app valida las claves y avisa si falta HTTPS, SMTP o el doble factor obligatorio. | Monitoreo sin agregar un SaaS ni filtrar datos de pacientes. |
| D7 | Una **clínica desactivada** no acepta reservas online ni muestra horarios. El equipo puede seguir agendando. | Antes se podía reservar llamando la acción directamente. |
