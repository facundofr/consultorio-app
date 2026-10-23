# Turnos IA: guía completa

Qué hace la app, quién la usa, cómo se entra y cómo funciona por dentro, de punta a punta.

Estado: **hito 4 de 6** (octubre de 2026). Las decisiones de diseño, con sus motivos, están en [`DECISIONS.md`](./DECISIONS.md). La instalación resumida está en [`README.md`](./README.md).

---

## Índice

1. [Qué es](#1-qué-es)
2. [Puesta en marcha](#2-puesta-en-marcha)
3. [Usuarios y credenciales](#3-usuarios-y-credenciales)
4. [Datos de demo](#4-datos-de-demo)
5. [Recorrido del paciente](#5-recorrido-del-paciente)
6. [El asistente de IA](#6-el-asistente-de-ia)
7. [Panel de administración](#7-panel-de-administración)
8. [Cómo funciona por dentro](#8-cómo-funciona-por-dentro)
9. [Seguridad y datos personales](#9-seguridad-y-datos-personales)
10. [Configuración (variables de entorno)](#10-configuración-variables-de-entorno)
11. [Tests](#11-tests)
12. [Lo que todavía no hace](#12-lo-que-todavía-no-hace)
13. [Mapa de rutas](#13-mapa-de-rutas)

---

## 1. Qué es

Una app web para reservar turnos médicos online, pensada para clínicas argentinas. Una sola instalación atiende **varias clínicas**, cada una con sus sedes, especialidades, profesionales y reglas.

Hay dos lados:

| Lado | Quién lo usa | Para qué |
|---|---|---|
| **Sitio público** (`/`) | Pacientes, sin cuenta | Sacar un turno con un formulario paso a paso o con un chat de IA, ver el turno, agregarlo al calendario y cancelarlo. |
| **Panel** (`/admin`) | El equipo de la clínica, con usuario y contraseña | Agenda, turnos, pacientes, profesionales y horarios, feriados, catálogo, ajustes, usuarios, conversaciones del asistente y auditoría. |

Tres reglas atraviesan toda la app:

- **Nunca hay dos turnos superpuestos para el mismo profesional.** Lo garantiza la base de datos, no solo la pantalla.
- **Solo se ofrecen horarios reales**, calculados en el servidor a partir de la grilla del profesional, los feriados, los bloqueos y los turnos ya tomados.
- **Los datos personales se protegen** (Ley 25.326): teléfono y email van cifrados, y el asistente de IA nunca los ve.

Tecnología: Next.js 16, React 19, PostgreSQL 17, Drizzle ORM, Better Auth, Tailwind 4, componentes estilo shadcn/ui y calendario con `react-day-picker`. Interfaz en español rioplatense, con la tipografía Atkinson Hyperlegible, pensada para baja visión.

**Tema claro y oscuro** en toda la app (sitio y panel), con **un solo botón**:

- en modo claro muestra una **luna** y al tocarla pasa a oscuro;
- en modo oscuro muestra un **sol** y vuelve a claro.

Está en el encabezado (también en el celular), en «Más» y abajo del menú del panel. Hasta que la persona elige, se usa el tema de su teléfono o computadora. La elección queda guardada en el navegador y se aplica antes de mostrar la página, sin parpadeos.

---

## 2. Puesta en marcha

Requisitos: Node.js 22 o más nuevo, pnpm 10 (`corepack enable`) y PostgreSQL 17 (con Docker o sin Docker).

```bash
pnpm install
cp .env.example .env              # completar las claves (ver sección 10)

# Base de datos, opción A: con Docker (Postgres en :5432 + Mailpit en :8025)
docker compose -f docker-compose.dev.yml up -d

# Opción B: sin Docker (Postgres 17 real desde npm, puerto 5433)
pnpm db:embedded                  # dejarlo corriendo en otra terminal
# y en .env: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/turnos

pnpm db:migrate                   # crea las tablas
pnpm seed                         # datos de demo + usuarios del panel
pnpm dev                          # http://localhost:3000
```

Las tres claves obligatorias (`PII_ENCRYPTION_KEY`, `PII_HASH_KEY`, `BETTER_AUTH_SECRET`) se generan así:

```bash
openssl rand -base64 32
# en Windows sin openssl:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Importante:** si se pierde `PII_ENCRYPTION_KEY` se pierden todos los teléfonos y emails guardados. Hay que respaldarla aparte de los backups de la base.

Para probar el asistente **sin claves de IA**, agregar `LLM_MOCK=1` al `.env`. Usa un modelo simulado local (ver sección 6).

Para chequear que todo está vivo, `GET /healthz` devuelve `{"status":"ok"}`, o un error 503 si la base no responde.

---

## 3. Usuarios y credenciales

### Pacientes

Los pacientes **no tienen cuenta ni contraseña**. Se identifican así:

- **Al reservar**: nombre y apellido, teléfono y email, más la aceptación de la política de datos.
- **Para ver o cancelar un turno**: el **código del turno** (`T-XXXXXX`) más una de dos cosas:
  - el **enlace secreto** que se muestra al confirmar la reserva (`/turno/T-XXXXXX?t=…`), o
  - el **teléfono o el email** que usaron al reservar.

### Equipo de la clínica (panel `/admin`)

`pnpm seed` crea estos usuarios de demo:

| Rol | Email | Clínica |
|---|---|---|
| Superadmin | `superadmin@turnos.example` | Todas |
| Administración | `admin@aurora.example` | Centro Médico Aurora |
| Recepción | `recepcion@aurora.example` | Centro Médico Aurora |
| Administración | `admin@aromos.example` | Clínica Los Aromos |
| Recepción | `recepcion@aromos.example` | Clínica Los Aromos |

**Contraseña**: es la misma para todos. Hay dos casos:

- Si `.env` tiene `SEED_ADMIN_PASSWORD` (10 caracteres o más), se usa esa.
- Si no, `pnpm seed` genera una al azar y **la imprime una sola vez** en la terminal, junto a cada email. No se guarda en ningún otro lado. Si se pierde, hay dos salidas:
  - correr `pnpm seed --reset`, que borra todo y crea datos nuevos, o
  - entrar con otro usuario administrador y cambiarla desde **Usuarios**.

Los tests E2E crean su propia base temporal con la contraseña `e2e-password-123`. Esa contraseña **solo existe en esa base de prueba**.

Reglas de las cuentas del panel:

- **No hay registro público**: los usuarios los crea un administrador desde **Usuarios**.
- **Contraseña**: mínimo 10 caracteres, guardada con argon2.
- **Intentos de ingreso**: como máximo 5 por email y 20 por IP cada 15 minutos.
- **Sesión**: dura 12 horas.
- **Cambios con efecto inmediato**: cambiar la contraseña, el rol o la clínica de alguien, o desactivarlo, **cierra todas sus sesiones abiertas**.
- **Límites sobre uno mismo**: nadie puede bajarse el rol ni desactivarse a sí mismo.
- No hay "olvidé mi contraseña": la cambia un administrador.

### Qué puede hacer cada rol

| Sección | Superadmin | Administración | Recepción |
|---|---|---|---|
| Inicio (dashboard) | ✔ | ✔ | ✔ |
| Agenda, turnos, pacientes | ✔ | ✔ | ✔ |
| Sobreturnos (fuera de la grilla) | ✔ | ✔ | ✘ |
| Profesionales, horarios, feriados y bloqueos | ✔ | ✔ | solo ver |
| Sedes, especialidades, tipos de consulta, FAQ | ✔ | ✔ | solo ver |
| Ajustes de la clínica | ✔ | ✔ | solo ver |
| Usuarios | ✔ (todos los roles) | ✔ (administración y recepción de su clínica) | ✘ |
| Conversaciones del asistente | ✔ | ✔ | ✘ |
| Auditoría | ✔ | ✔ | ✘ |
| Clínicas (crear, editar, dar de baja) | ✔ | ✘ | ✘ |
| Ver otras clínicas | ✔ (con un selector) | ✘ | ✘ |

Los permisos se controlan **en el servidor**, en cada función (`src/server/auth/rbac.ts`), no solo ocultando botones. Lo que un usuario no puede ver responde "no encontrado" (404) en vez de "prohibido", para no confirmar que existe.

---

## 4. Datos de demo

Todo lo que carga `pnpm seed` es **inventado**: clínicas, personas, direcciones y teléfonos.

**Centro Médico Aurora** (`/reservar?clinica=aurora`): teléfono 011 4000-1000, grilla cada 15 minutos.

| Sede | Dirección |
|---|---|
| Sede Centro | Av. Inventada 1234, CABA |
| Sede Norte | Calle Imaginaria 567, Vicente López |

| Especialidad | Profesionales | Tipos de consulta |
|---|---|---|
| Clínica médica | Dra. Lucía Ferrante, Dr. Martín Galván, Dr. Pablo Soria | Consulta (20 min), Control con estudios (30 min) |
| Pediatría | Dra. Carolina Rivas, Dr. Pablo Soria | Consulta pediátrica (20), Control de niño sano (30) |
| Cardiología | Dr. Andrés Molinari | Consulta (30), Primera consulta (45) |
| Dermatología | Dra. Valeria Pazos (de vacaciones de 3 a 5 semanas después del seed) | Consulta (20), Control de lunares (30, $35.000) |
| Ginecología | Dra. Sofía Herrán, Dra. Julieta Acuña | Consulta (30), Control anual (30) |

**Clínica Los Aromos** (`/reservar?clinica=aromos`): teléfono 011 4000-2000, una sede (Pasaje Ficticio 89, Quilmes), grilla cada 20 minutos.

| Especialidad | Profesionales | Tipos de consulta |
|---|---|---|
| Traumatología | Dr. Diego Romano, Dra. Natalia Castell | Consulta (20), Primera consulta (40) |
| Oftalmología | Dr. Federico Lunardi (con atención extra el próximo sábado) | Consulta (20), Fondo de ojo (30, $28.000) |
| Nutrición | Lic. Mariana Vergara | Primera consulta (60, $45.000), Seguimiento (30, $30.000) |

El seed también carga:

- Los **feriados nacionales** de 2026 y los inamovibles de 2027, para las dos clínicas.
- Un **bloqueo por mantenimiento** de la Sede Norte, una mañana, 10 días después del seed.
- **8 preguntas frecuentes** por clínica: qué llevar, llegada, cancelación, coberturas, acompañantes, estacionamiento, certificados y contacto.
- **16 turnos de ejemplo** en los próximos 10 días, con 6 pacientes inventados (por ejemplo Laura Benítez, teléfono 11 5550-0101) y origen variado (asistente, formulario y panel), para que la agenda y el dashboard no arranquen vacíos. Los códigos se generan al azar: se ven en **Turnos** del panel. Con uno de esos códigos y el teléfono del paciente se puede probar **Mi turno**.

---

## 5. Recorrido del paciente

### En el celular

Abajo hay una **barra fija**, al estilo de las apps de pagos: **Inicio · Asistente · Reservar** (botón central destacado) **· Mi turno · Más**.

- Si el asistente está apagado, en su lugar aparece **Privacidad**.
- **Más** abre desde abajo un panel con privacidad, ingreso del equipo de la clínica y los botones **911** y **SAME 107**.
- En pantallas anchas se usa el menú de arriba y la barra no aparece.

### Portada (`/`)

Tiene tres botones:

- **Reservar un turno**: el formulario.
- **Hablar con el asistente**: aparece solo si el asistente está activo.
- **Ver o cancelar mi turno**.

### Reservar con el formulario (`/reservar`)

Es un paso a paso:

1. **Clínica**.
2. **Sede**.
3. **Especialidad**: solo las que alguien atiende en esa sede.
4. **Profesional**, o **«el primero disponible»**, que combina los horarios de todos los profesionales de la especialidad.
5. **Tipo de consulta**, con su duración y, si tiene, su precio.
6. **Día**: arriba aparece **«El próximo turno libre»**, que lleva directo a confirmar. Debajo hay un calendario donde **solo se pueden tocar los días con horarios libres de verdad**.
7. **Horario**: «tickets» con las horas libres, separadas por mañana y tarde.
8. **Datos y consentimiento**: nombre y apellido, celular con código de área, email y la casilla obligatoria de aceptación de datos.
9. **Confirmación**: lleva a la página del turno.

Detalles:

- Los pasos con **una sola opción se saltean solos**. Por ejemplo, Aromos tiene una sola sede.
- **El estado vive en la URL** (`/reservar?clinica=aurora&sede=…&especialidad=…`). Por eso el formulario **funciona sin JavaScript**, el botón «atrás» del navegador anda y el enlace se puede compartir.
- Cada paso se **valida en el servidor**. Si algo de la URL es inválido, se vuelve a ese paso.
- Si alguien toma el horario mientras el paciente completa sus datos, aparece «Uy, alguien acaba de tomar ese horario» y un enlace para elegir otro.
- Protección contra bots y abuso: un campo trampa invisible y un máximo de **10 reservas por IP por hora**.
- Teléfonos argentinos normalizados: «011 15 1234-5678» y «+54 9 11 1234 5678» se toman como el mismo número.
- Si ya existe un paciente con ese teléfono y ese nombre en la clínica, se reutiliza. Familiares que comparten celular quedan como pacientes distintos.

### Página del turno (`/turno/T-XXXXXX?t=…`)

Es el enlace secreto que aparece al confirmar. Recién reservado, muestra arriba el recuadro **«Guardá este enlace»**, con los botones **Copiar enlace** y **Enviármelo por WhatsApp**: hasta que existan los emails, es la única copia del paciente. Además muestra:

- Día, hora, profesional, especialidad, tipo de consulta, sede con dirección e indicaciones, teléfono de la clínica y código.
- **«Agregar al calendario»**: un archivo `.ics` que sirve para Google Calendar, Apple y Outlook, con una alarma 2 horas antes.
- **«Cancelar turno»**, si faltan más horas que las configuradas (24 por defecto). Pide confirmar. Pasado ese plazo se muestra el mensaje «Ya no se puede cancelar online…» con el teléfono de la clínica.
- Después de cancelar, ofrece **«Elegir otro día y horario con el mismo profesional»**, que abre el formulario en el paso del día.

Esta página no se indexa en buscadores, no se guarda en caché y no filtra el enlace a otros sitios (`Referrer-Policy: no-referrer`).

### Mi turno (`/turno`)

Para quien no tiene el enlace: se ingresa el **código** más el **teléfono o el email** de la reserva. Muestra lo mismo que la página del turno y permite cancelar.

- Si algo no coincide, el error es siempre el mismo («No encontramos un turno con esos datos»), para que nadie pueda adivinar códigos ajenos.
- Límites: 15 consultas por IP cada 15 minutos y 8 por código por hora.

### Privacidad (`/privacidad`)

Es la política de datos personales: qué se pide, para qué, cómo se protege, el uso de proveedores de IA en el chat, la retención de 30 días de las conversaciones y los derechos de la Ley 25.326.

---

## 6. El asistente de IA

### Para el paciente (`/asistente`)

1. Si hay varias clínicas, primero se elige una.
2. Aparece el mensaje de bienvenida de la clínica y tres sugerencias: «Quiero sacar un turno», «Quiero cancelar mi turno» y «¿Dónde quedan las sedes?».
3. El paciente escribe libremente, por ejemplo «necesito cardiología el martes a la mañana».
4. El asistente busca **horarios reales** y los muestra como **botones** agrupados por día, con profesional y sede.
5. Al tocar uno, o al decir «el de las 10», aparece una **tarjeta de confirmación** con el resumen del turno y el formulario de datos: nombre, celular, email y consentimiento.
6. El paciente confirma. Aparece la tarjeta **«Turno confirmado»** con el código y el botón **«Ver mi turno y agregarlo al calendario»**. Los horarios ofrecidos antes quedan bloqueados, en pantalla y en el servidor: para un segundo turno hay que pedir horarios nuevos. Así nadie reserva dos por tocar una tarjeta vieja.

Otras cosas que hace:

- **Ver o cancelar un turno**: muestra dentro del chat el mismo formulario seguro de «Mi turno» (código más teléfono o email).
- **Preguntas sobre la clínica**: responde **solo** con la FAQ, los datos de contacto, las sedes y las reglas cargadas en el panel.
- **No da consejos médicos.** Ante una pregunta médica, sugiere consultar con un profesional y ofrece un turno.
- **Urgencias**: si el mensaje parece una emergencia («dolor en el pecho», «no puede respirar», «se desmayó», ideas de suicidio…), responde al instante con el mensaje de emergencia de la clínica y los botones **Llamar al 911** y **SAME 107**, **sin consultar al modelo**. «Necesito un turno urgente» no se toma como emergencia.
- **Si el chat no está disponible**, ofrece siempre el formulario y el teléfono de la clínica. Pasa en cuatro casos: el asistente está apagado, se llegó a un límite de uso, fallaron todos los proveedores o el navegador no tiene JavaScript.
- Si se recarga la página, la conversación empieza de nuevo.

### Cómo decide, paso a paso

Por cada mensaje del paciente, el servidor hace esto:

1. Verifica que la conversación existe y que el navegador tiene su secreto.
2. **Reemplaza datos personales**: emails por «[email]» y números de 8 dígitos o más (teléfono, DNI, tarjeta) por «[número]». Recién después guarda el mensaje.
3. **Revisa si parece una urgencia.** Si es así, responde sin llamar al modelo.
4. **Revisa los límites**: el diario de tokens y el de tokens y mensajes por conversación. Si se pasó alguno, ofrece el formulario.
5. Arma el contexto para el modelo:
   - las reglas;
   - el día y la hora actuales;
   - el catálogo activo de la clínica con **códigos cortos**: sedes `L1`, especialidades `E1`, tipos de consulta `C1`, profesionales `P1`;
   - el contacto y la FAQ;
   - los últimos mensajes.
6. Llama al modelo con **cuatro herramientas**:

   | Herramienta | Qué hace |
   |---|---|
   | `buscar_horarios` | Busca horarios libres reales (especialidad y, opcionalmente, consulta, profesional, sede, fechas y franja mañana o tarde). Devuelve hasta 8, como máximo 3 por día, con códigos `H1`, `H2`… |
   | `ofrecer_reserva` | Muestra la tarjeta de confirmación de un horario `H…` ya ofrecido. |
   | `gestionar_turno_existente` | Muestra el formulario seguro para ver o cancelar. |
   | `marcar_emergencia` | Muestra el mensaje de emergencia. |

7. Repite como máximo 4 veces por mensaje (búsqueda → respuesta). Después devuelve el texto y las tarjetas.

**Ninguna herramienta reserva ni cancela.** La reserva ocurre solo cuando el paciente aprieta «Confirmar turno» en la tarjeta. Esa reserva pasa por la misma función que el formulario (`bookPublic`), con revalidación del horario en el servidor. El servidor **solo acepta horarios que él mismo ofreció en esa conversación**, así que el modelo no puede inventar un turno.

### Proveedores

| Proveedor | Variable de la clave | Modelo por defecto |
|---|---|---|
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` |

- Todos son **planes gratuitos**.
- Se prueban en el orden de `LLM_PROVIDERS`. Si uno falla (error, límite del proveedor, respuesta vacía o demora de más de 20 s), sigue el siguiente.
- **Sin ninguna clave, el asistente queda apagado** y los pacientes usan el formulario.
- Las claves gratuitas se sacan en [console.groq.com](https://console.groq.com/keys), [aistudio.google.com](https://aistudio.google.com/apikey) y [openrouter.ai](https://openrouter.ai/keys).
- Los nombres de modelos cambian seguido. Si un proveedor responde 404, hay que actualizar `GROQ_MODEL`, `GEMINI_MODEL` u `OPENROUTER_MODEL`.

**Modo simulado** (`LLM_MOCK=1`): un "modelo" local, sin internet, que entiende frases simples:

- el nombre de una especialidad («turno de cardiología»);
- «a la mañana» o «a la tarde»;
- un código de horario («H3»);
- «cancelar mi turno» o «ver mi turno».

Usa las herramientas reales. Sirve para demos y para los tests E2E. **No usarlo en producción.**

### Estados de una conversación

| Estado | Significa |
|---|---|
| En curso | Activa, sin reserva todavía. |
| Reservó | Terminó en un turno confirmado. |
| Posible urgencia | Se mostró el mensaje de emergencia. |
| Límite de uso | Se pasó a formulario por un límite. |
| Sin terminar | Más de 24 h sin mensajes y sin reserva. |

Las conversaciones se **borran solas a los 30 días** (`CHAT_RETENTION_DAYS`). Las estadísticas de uso se conservan.

---

## 7. Panel de administración

Se entra por `/admin/login`.

**En el celular** el panel tiene la misma barra inferior para los tres roles: **Inicio · Agenda · Nuevo turno** (botón central) **· Pacientes · Más**.

- **Agenda** muestra un globito rojo con los turnos confirmados de hoy.
- **Nuevo turno** abre directo el diálogo para agendar.
- **Más** sube desde abajo con el menú completo que corresponde al rol, el selector de clínica (superadmin), el usuario y **Cerrar sesión**. Por ejemplo, recepción no ve Usuarios ni Conversaciones.

 Sin sesión, cualquier dirección de `/admin` redirige al login y, después de ingresar, vuelve a donde se quería ir. El menú lateral muestra solo lo que el rol permite. El **superadmin** tiene arriba un **selector de clínica**: todo el panel muestra la clínica elegida.

### Inicio (dashboard)

- **Indicadores**: turnos de hoy, ocupación de hoy y de la semana, cancelaciones de los últimos 30 días.
- **Lista de los turnos de hoy**, con acceso a la agenda.
- **Cómo reservan**: turnos de los últimos 30 días por origen (asistente, formulario o panel).
- **Asistente, últimos 7 días**: llamadas, errores, tokens y demora promedio por proveedor. Solo lo ven Administración y Superadmin.

### Agenda

- Vista por **día, semana o mes**, por **sede** o por **profesional**. La hora actual y el día de hoy aparecen resaltados.
- **Vista Mes**: un calendario mensual. Cada día muestra:
  - la cantidad de turnos;
  - una barra de ocupación: verde con menos del 50 %, amarilla entre 50 y 84 %, roja con 85 % o más;
  - los cancelados;
  - los feriados y cierres.

  Abajo del calendario aparece el total del mes. Tocar un día abre su agenda.
- **Mini calendario** al costado de las vistas Día y Semana (en pantallas anchas): sirve para saltar a cualquier fecha y marca con un punto los días con turnos. Los feriados aparecen tachados.
- **Agendar**: tocar un hueco libre o «Agendar turno». Después se busca un paciente existente o se crea uno nuevo; el email es opcional para el equipo. Por último se elige uno de los **horarios libres reales** del día.
- **Sobreturno** (solo Administración): permite agendar fuera de la grilla publicada. Igual **nunca se puede superponer** con otro turno.
- **Mover**: diálogo con día y horarios libres reales. Al mover se reinicia el recordatorio.
- **Cancelar** un turno.

### Turnos

- Listado con filtros: fechas, profesional, sede, estado, origen y código o paciente.
- **Exportar CSV**: separado por `;`, con caracteres especiales listos para Excel en español y protegido contra fórmulas maliciosas. Incluye teléfono y email descifrados. **Cada exportación queda en auditoría.**
- **Ficha del turno**: datos completos, origen y conversación del asistente si la hubo. También muestra el **historial**: creado, movido, cancelado y cambios de estado, con quién lo hizo.
- **Estados**:
  - Confirmado, Atendido y Ausente se pueden alternar entre sí.
  - Un turno **cancelado no se reactiva**: hay que crear uno nuevo.

### Pacientes

- **Búsqueda**: por nombre (parcial), o por **teléfono, email o código completos**. Estos datos están cifrados, así que no admiten búsqueda parcial.
- **Ficha del paciente**: datos de contacto editables, los últimos 100 turnos, «Darle un turno» y dar de baja.
- **Dar de baja**: el paciente deja de aparecer en las búsquedas y su historial se conserva.

### Profesionales y horarios

- **Datos del profesional**: tratamiento (Dr., Dra., Lic.), nombre, apellido, matrícula, presentación opcional, especialidades, sedes y la opción «Recibe turnos».
- **Grilla semanal**: franjas por día y por sede, con vigencia opcional (desde y hasta). Tiene el botón «copiar de lunes a viernes» y avisa si dos franjas se pisan. Una franja puede cruzar la medianoche.
- **Desactivar a un profesional**: deja de aparecer al reservar y conserva su agenda.
- **Quitarle una sede**: borra los horarios de esa sede.

### Feriados y bloqueos

- **Alcances**:
  - **toda la clínica**, para feriados;
  - **una sede**, para cierres o mantenimiento;
  - **un profesional**, para vacaciones o ausencias.
- **Tipos**:
  - **bloqueo**: no se atiende;
  - **horario extra**: atención fuera de la grilla, que requiere profesional y sede.
- Puede ser de **todo el día** o de un rango de horas, y abarcar varios días.
- Al cargarlo **avisa cuántos turnos confirmados quedan afectados**, pero **no los cancela solo**: cancelar es una decisión del equipo, porque hay que avisar al paciente.

### Catálogo

- **Sedes**: nombre, dirección, ciudad, teléfono y notas (por ejemplo «Piso 2»). Las notas se muestran al paciente.
- **Especialidades**.
- **Tipos de consulta**: nombre, duración, precio opcional y especialidad. Uno sin especialidad vale para todas.
- **Preguntas frecuentes**: pregunta, respuesta y etiquetas. **Es lo único que usa el asistente para responder consultas generales.**
- No se puede dar de baja algo que tenga **turnos futuros confirmados**. Las bajas son lógicas y conservan el historial.

### Ajustes (por clínica)

- **Reservas y cancelaciones**:
  - horas mínimas para cancelar online (24 por defecto);
  - grilla de horarios en minutos (15);
  - horizonte de reserva en días (60);
  - anticipación mínima en minutos (60);
  - recordatorio, en horas antes del turno (48).
- **Asistente**: mensaje de bienvenida y tono. El tono no cambia las reglas: el asistente igual nunca inventa horarios ni da consejo médico.
- **Contacto**: teléfono, email y horario de atención telefónica.
- **Mensajes**:
  - qué se muestra cuando ya no se puede cancelar online;
  - qué se muestra ante una posible urgencia (debe incluir 911 y, si corresponde, SAME 107).

Todas estas reglas se aplican **en el servidor**, igual para el formulario y para el chat.

### Clínicas (solo Superadmin)

Crear, editar y dar de baja clínicas: nombre, identificador para la URL, zona horaria, teléfono, email y web.

### Usuarios

Crear y editar usuarios: nombre, email, rol, clínica, contraseña y activo o inactivo. Las reglas de la sección 3 aplican acá.

### Conversaciones (Administración y Superadmin)

- **Listado** por fecha y estado, con mensajes, tokens y turno resultante.
- **Ficha de cada conversación**:
  - la transcripción: lo que escribió el paciente (ya sin teléfonos ni emails) y lo que respondió el asistente;
  - cada herramienta que usó, con sus argumentos y su resultado;
  - el turno resultante;
  - cada llamada al modelo, con proveedor, modelo, tokens, demora y error si lo hubo.
- **Abrir una conversación queda en auditoría.**

### Auditoría

Registro de las acciones del equipo: altas, cambios, bajas, exportaciones, conversaciones abiertas, etc. Muestra quién, cuándo y **qué campos** cambiaron. **Nunca guarda los valores de datos personales**, para que el registro no sea otra copia de los datos.

---

## 8. Cómo funciona por dentro

### Estructura del código

```
src/
  app/
    (public)/             sitio del paciente: portada, reservar, turno, asistente, privacidad
    admin/                panel: login, pantallas y server actions
    api/auth/             endpoints de Better Auth
    healthz/              chequeo de salud
  components/             interfaz (ui = componentes base, admin, public)
  db/                     esquema, cliente, migraciones, seed
  lib/                    utilidades puras: zonas horarias, cifrado, códigos, .ics
  server/
    availability/         motor de disponibilidad
    appointments/         alta, cancelación, movimiento y estados (única puerta de entrada)
    booking/              capa pública compartida por formulario y asistente
    assistant/            asistente de IA
    admin/                servicios del panel, con permisos y auditoría
    auth/                 sesiones, roles y permisos
    security/             límites de intentos, IP
drizzle/                  migraciones SQL
tests/                    unitarios, integración (Postgres real) y E2E (Playwright)
```

Hay un principio de capas. Las pantallas y las server actions **solo traducen formularios**. Las reglas viven en `src/server/*`:

- todas las reservas (formulario, chat y panel) terminan en `createAppointment`;
- todo lo del paciente pasa por `src/server/booking/public.ts`.

### Motor de disponibilidad

Para un profesional, un tipo de consulta y un rango de fechas, el motor calcula así:

1. Toma la **grilla semanal** del profesional, en **hora local de la clínica**, con sus vigencias.
2. Suma los **horarios extra** y resta los **bloqueos**: feriados de la clínica, cierres de sede y ausencias del profesional.
3. Dentro de cada franja genera horarios candidatos cada `grilla` minutos, contando desde el inicio de la franja. Un candidato sirve solo si el turno entero, con su duración, entra en la franja.
4. Descarta los que se superponen con **turnos existentes del profesional en cualquier sede**, porque no puede estar en dos lugares.
5. Para pacientes aplica además la **anticipación mínima** (no ofrece turnos que empiecen antes de ahora + margen) y el **horizonte** (no ofrece más allá de N días). El equipo no tiene esas dos restricciones.

Las fechas se guardan en UTC y se muestran en la zona horaria de la clínica (Buenos Aires por defecto).

### Reserva y anti doble turno

Cuando alguien confirma, `createAppointment` hace todo en **una transacción**:

1. Toma un **lock por profesional**, así las reservas simultáneas del mismo profesional se procesan de a una.
2. **Recalcula la disponibilidad ahora mismo**. Si el horario ya no está libre, responde «Ese horario ya no está disponible».
3. Busca o crea al paciente, con su teléfono y email cifrados.
4. Inserta el turno con un **código** `T-XXXXXX` y un **token de cancelación** de 256 bits.
   - El código usa un alfabeto sin caracteres que se confunden (sin 0/O ni 1/I/L).
   - Del token solo se guarda su hash.
5. Registra el evento «creado» con su origen: asistente, formulario o panel.

La base de datos tiene además una **restricción de exclusión** que **impide dos turnos superpuestos del mismo profesional**, aunque fallara todo lo anterior. Ocupan agenda los turnos confirmados, atendidos y ausentes. Los cancelados liberan el horario al instante. Dos turnos pegados (uno termina 10:00 y otro empieza 10:00) están permitidos.

### Cancelación

La regla es: **se puede cancelar online si ahora ≤ inicio del turno − horas mínimas**.

- Con 24 h justas se puede; con 23 h 59 m 59 s, no.
- Se evalúa con la hora del servidor, dentro de la transacción y con el turno bloqueado, así que si dos personas cancelan a la vez, gana una sola.

### Archivo de calendario

`/turno/[código]/calendario` genera un `.ics` estándar (RFC 5545):

- horas en UTC y una alarma 2 horas antes;
- si el turno está cancelado, el archivo lo marca como cancelado.

---

## 9. Seguridad y datos personales

| Qué | Cómo |
|---|---|
| Teléfono y email del paciente | Cifrados con AES-256-GCM. Para buscarlos se usa un índice ciego (HMAC-SHA256), así que la búsqueda por esos datos es exacta, no parcial. |
| IP de los visitantes | Nunca se guarda en claro: solo un hash, para los límites de intentos. |
| Enlace del turno | Token de 256 bits. Solo se guarda su hash, así que una filtración de la base no permite usar los enlaces. |
| Consentimiento | Casilla obligatoria al reservar online. Se guarda la fecha y la versión del texto aceptado. Los pacientes que carga el equipo quedan como «Cargado por el equipo». |
| Asistente de IA | El modelo nunca recibe nombre, teléfono ni email. Lo que se escriba con esa forma se reemplaza antes de guardar y de enviar. Las conversaciones se borran a los 30 días. |
| Contraseñas del equipo | argon2, mínimo 10 caracteres, límite de intentos. |
| Sesiones | En base de datos, revocables, 12 horas. |
| Permisos | Controlados en cada función del servidor, por rol y por clínica. |
| Auditoría | Registra ids y nombres de campos, nunca valores personales. |
| Formularios | Protección CSRF de Next.js en las server actions, campo trampa contra bots y límites por IP. |

Límites de intentos:

| Acción | Límite |
|---|---|
| Ingreso al panel | 5 por email y 20 por IP cada 15 minutos |
| Reservas (formulario y chat) | 10 por IP por hora |
| Buscar o cancelar un turno | 15 por IP cada 15 minutos y 8 por código por hora |
| Mensajes al asistente | 30 por IP cada 10 minutos, y 10 conversaciones nuevas por IP por hora |

Los límites se guardan en memoria: valen para **una sola instancia** de la app. Con varias instancias habría que llevarlos a Postgres o Redis.

---

## 10. Configuración (variables de entorno)

Todas están en [`.env.example`](./.env.example).

### Obligatorias

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL. |
| `PII_ENCRYPTION_KEY` | Clave de cifrado de teléfonos y emails (32 bytes en base64). **Respaldarla aparte.** |
| `PII_HASH_KEY` | Clave del índice ciego (32 bytes en base64). |
| `BETTER_AUTH_SECRET` | Firma de las sesiones del panel. |

### Generales y demo

| Variable | Por defecto | Para qué |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Dirección pública de la app. |
| `APP_TIMEZONE` | `America/Argentina/Buenos_Aires` | Zona horaria por defecto. |
| `SEED_ADMIN_PASSWORD` | (al azar) | Contraseña de los usuarios de demo. |
| `SEED_ALLOW_PRODUCTION` | `false` | El seed se niega a correr en producción salvo con `true`. |
| `DATABASE_POOL_MAX` | `10` | Conexiones simultáneas a la base. |

### Asistente de IA (todas opcionales)

| Variable | Por defecto | Para qué |
|---|---|---|
| `AI_ENABLED` | `true` | `false` lo apaga aunque haya claves. |
| `LLM_PROVIDERS` | `groq,gemini,openrouter` | Orden de los proveedores. |
| `GROQ_API_KEY` / `GROQ_MODEL` | — / `llama-3.3-70b-versatile` | Groq. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / `gemini-2.5-flash` | Google Gemini. |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | — / `meta-llama/llama-3.3-70b-instruct:free` | OpenRouter. |
| `LLM_DAILY_TOKEN_LIMIT` | `300000` | Tokens por día entre todas las conversaciones (0 = sin límite). |
| `LLM_CONVERSATION_TOKEN_LIMIT` | `40000` | Tokens por conversación. |
| `LLM_CONVERSATION_MESSAGE_LIMIT` | `40` | Mensajes del paciente por conversación. |
| `LLM_TIMEOUT_MS` | `20000` | Espera máxima por proveedor antes de pasar al siguiente. |
| `LLM_MAX_TOOL_ROUNDS` | `4` | Llamadas al modelo por mensaje. |
| `CHAT_RETENTION_DAYS` | `30` | Días hasta borrar una conversación. Si se cambia, hay que actualizar `/privacidad`. |
| `LLM_MOCK` | vacío | `1` = modelo simulado local, sin claves. |

---

## 11. Tests

| Comando | Qué prueba |
|---|---|
| `pnpm test` | Todos los unitarios y de integración (198 tests). |
| `pnpm test:unit` | Lógica pura: motor de horarios, zonas horarias, cifrado, archivo `.ics`, permisos, límites, regla de cancelación, redacción de datos, detector de urgencias y respaldo entre proveedores de IA. |
| `pnpm test:integration` | Contra **PostgreSQL real** en una base temporal: reservas, concurrencia (12 reservas simultáneas del mismo horario y gana una sola), cancelación en el límite exacto, permisos del panel por rol y clínica, el seed y el asistente completo (búsqueda, reserva, horarios inventados, límites, urgencias, retención). |
| `pnpm test:e2e` | Playwright contra el **build de producción** con una base temporal (22 tests, incluidos los de celular a 390×844): reserva por formulario y por chat, cancelación por enlace y por código, bloqueo dentro de las 24 h, urgencias en el chat, agenda del panel, profesionales, bloqueos y conversaciones. `--rebuild` fuerza un `next build` nuevo. |
| `pnpm typecheck` / `pnpm lint` | Tipos y estilo. |

Los tests levantan su propio Postgres y **no tocan la base de desarrollo**. Antes del primer E2E hay que instalar el navegador: `pnpm exec playwright install chromium`.

---

## 12. Lo que todavía no hace

Pendiente para los próximos hitos:

- **No se envía ningún email todavía**: ni confirmación ni recordatorio. Los textos ya no lo prometen. El ajuste «Recordatorio (horas antes)» se guarda para cuando exista el envío. Mientras tanto, la confirmación ofrece **copiar el enlace o mandárselo por WhatsApp**, y si se pierde queda **Mi turno** con el código. `docker-compose.dev.yml` ya trae Mailpit (puerto 8025) para cuando se implemente.
- **Avisos al paciente cuando la clínica cancela o mueve su turno**: el equipo tiene que avisarle por teléfono.
- **Despliegue a producción**: no hay `Dockerfile` ni compose de producción. La app ya se construye en modo `standalone` y espera estar detrás de un proxy (nginx) que pase la IP real del visitante.
- **Recuperar contraseña del panel por email**.
- **Varias instancias**: los límites de intentos viven en memoria (ver sección 9).
- **Asistente**:
  - no conserva la conversación al recargar la página;
  - las respuestas llegan completas, no palabra por palabra.
- **Tema oscuro** y **arrastrar turnos** en la agenda: posibles mejoras.

---

## 13. Mapa de rutas

### Públicas

| Ruta | Qué es |
|---|---|
| `/` | Portada |
| `/reservar` | Reserva paso a paso (estado en la URL) |
| `/asistente` | Chat con el asistente de IA |
| `/turno` | Ver o cancelar con código + teléfono o email |
| `/turno/[código]?t=…` | Página del turno con el enlace secreto |
| `/turno/[código]/calendario?t=…` | Archivo `.ics` |
| `/privacidad` | Política de datos personales |
| `/healthz` | Chequeo de salud (app + base) |

### Panel

Todas las rutas del panel requieren sesión.

| Ruta | Qué es |
|---|---|
| `/admin/login` | Ingreso |
| `/admin` | Inicio (dashboard) |
| `/admin/agenda` | Agenda |
| `/admin/turnos`, `/admin/turnos/[id]` | Turnos y ficha |
| `/admin/exportar-turnos` | Descarga del CSV |
| `/admin/pacientes`, `/nuevo`, `/[id]` | Pacientes |
| `/admin/profesionales`, `/nuevo`, `/[id]` | Profesionales y su grilla |
| `/admin/excepciones` | Feriados y bloqueos |
| `/admin/sedes`, `/admin/especialidades`, `/admin/servicios`, `/admin/faq` | Catálogo (con `/nueva` y `/[id]`) |
| `/admin/ajustes` | Ajustes de la clínica |
| `/admin/clinicas` | Clínicas (superadmin) |
| `/admin/usuarios` | Usuarios |
| `/admin/conversaciones`, `/[id]` | Conversaciones del asistente |
| `/admin/auditoria` | Auditoría |
