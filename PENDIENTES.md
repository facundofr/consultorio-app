# Turnos IA: lo que falta

Todo lo que todavía no está hecho, ordenado por prioridad. Actualizado el 22 de octubre de 2026, con el hito 4 terminado.

Cómo funciona hoy la app: [`GUIA.md`](./GUIA.md). Decisiones tomadas: [`DECISIONS.md`](./DECISIONS.md).

**Leyenda de esfuerzo**: S = horas · M = 1 a 2 días · L = 3 días o más.

---

## Resumen

| # | Tema | Prioridad | Esfuerzo | Bloquea |
|---|---|---|---|---|
| 1 | [Guardar el trabajo en git](#1-guardar-el-trabajo-en-git) | 🔴 Urgente | S | Todo lo demás |
| 2 | [Emails: confirmación, cancelación, cambios y recordatorios](#2-emails) | 🔴 Alta | L | Que el paciente reciba su turno |
| 3 | [Asistente con IA real](#3-asistente-con-ia-real) | 🔴 Alta | S | Que el chat entienda frases libres |
| 4 | [Puesta en producción](#4-puesta-en-producción) | 🔴 Alta | L | Usarla con pacientes reales |
| 5 | [Avisos cuando la clínica cancela o mueve](#5-avisos-cuando-la-clínica-cancela-o-mueve) | 🟠 Media | M | Depende del punto 2 |
| 6 | [Mejoras para el paciente](#6-mejoras-para-el-paciente) | 🟠 Media | M c/u | — |
| 7 | [Mejoras para el panel](#7-mejoras-para-el-panel) | 🟡 Normal | M c/u | — |
| 8 | [Diseño y accesibilidad](#8-diseño-y-accesibilidad) | 🟡 Normal | S–M | — |
| 9 | [Deuda técnica](#9-deuda-técnica) | 🟡 Normal | S–M | — |
| 10 | [Para decidir con la clínica](#10-para-decidir-con-la-clínica) | — | — | Varios puntos de arriba |

---

## 1. Guardar el trabajo en git

**Estado:** hay **más de 50 archivos con cambios sin commitear**. Incluyen el hito 4 completo, las correcciones, las mejoras de experiencia, la barra móvil, el modo oscuro, el calendario y la documentación. Si algo se borra o se pisa, se pierde.

**Qué hacer**: commits separados, como en los hitos anteriores.

1. `fix(booking)`: lock por profesional y reintento ante deadlocks; sesión del panel sin prerender; E2E en Windows.
2. `feat(assistant)`: asistente de IA, herramientas, límites, urgencias, redacción de datos.
3. `feat(admin)`: conversaciones del asistente.
4. `feat(public)`: mejoras de experiencia (guardar enlace, próximo turno libre, chat sin doble reserva).
5. `feat(ui)`: barra inferior en celular.
6. `feat(ui)`: modo oscuro y calendario de la agenda.
7. `docs`: README, GUIA, DECISIONS, PENDIENTES.

**Ojo**: `.env` está ignorado por git y debe seguir así. Tiene las claves de cifrado de esta máquina.

---

## 2. Emails

**Estado:** **no se envía ningún email.** No hay código de envío ni plantilla. Hoy funciona así:

- El paciente ve su enlace y su código **solo en pantalla**, al confirmar la reserva. Puede copiarlo o mandárselo por WhatsApp.
- El ajuste **«Recordatorio (horas antes)»** se guarda pero no hace nada.
- El historial del turno ya tiene previstos los eventos `email_sent` y `reminder_sent`, pero nunca se usan.
- La tabla de turnos ya tiene la columna `reminder_sent_at` y un índice para buscar recordatorios pendientes.

### Emails a enviar

| Email | Cuándo | Contenido |
|---|---|---|
| **Turno confirmado** | Al reservar (formulario, chat o panel, si el paciente tiene email) | Día, hora, profesional, sede con dirección y notas, código, botón «Ver o cancelar mi turno» (enlace con token), archivo `.ics` adjunto, plazo para cancelar |
| **Turno cancelado** | Cuando cancela el paciente o la clínica | Qué turno se canceló, quién lo canceló, botón «Sacar otro turno» con el mismo profesional |
| **Turno movido** | Cuando la clínica lo cambia de día u hora | Horario anterior tachado, horario nuevo, nuevo `.ics` |
| **Recordatorio** | N horas antes, según Ajustes (48 por defecto) | Mismo contenido que la confirmación, con «¿No podés ir? Cancelalo» si todavía está dentro del plazo |

### Plantilla

- Que siga la estética de la app:
  - verde eucalipto;
  - el recuadro amarillo con día y hora;
  - la tipografía Atkinson, con respaldo seguro para clientes de email;
  - el nombre, teléfono y dirección de **cada clínica**.
- Tiene que verse bien en Gmail, Outlook, Apple Mail y el celular: HTML con tablas, estilos en línea, ancho máximo de 600 px y **versión en texto plano**.
- Modo oscuro del cliente de email: colores que no se rompan cuando Gmail u Outlook invierten la paleta.
- Asunto claro, por ejemplo «Turno confirmado: jueves 5/11, 10:30 h · Dr. Molinari».
- Pie con el aviso de privacidad y el teléfono de la clínica. No hace falta link de desuscripción porque son emails del servicio, no publicidad.

### Técnica

- **Envío**: genérico por SMTP (Nodemailer). Así sirve cualquier proveedor: Brevo, Gmail, Resend, Amazon SES o el de la clínica.
- **Nuevas variables**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` (por ejemplo «Centro Médico Aurora <turnos@…>»).
- **Cola de envío** en la base (tabla `email_outbox`). El email se encola **dentro de la misma transacción** que el turno y lo envía un proceso aparte, con reintentos. Así, si el proveedor falla, la reserva no falla.
- **Recordatorios**: una tarea cada 5 a 10 minutos que busca turnos confirmados con `reminder_sent_at` vacío y que empiezan dentro de N horas.
  - Puede correr dentro de la app o como cron del servidor.
  - Si un turno se mueve, se reinicia su recordatorio (eso ya está hecho).
- **Registro**: cada envío queda en el historial del turno (`email_sent` / `reminder_sent`). **Nunca** se guarda el contenido con datos personales en los logs.
- **Bandeja de prueba**: sin SMTP configurado, los emails se ven en el panel en lugar de enviarse, con una vista previa de la plantilla. Hace falta porque Docker está apagado en esta máquina y Mailpit lo necesita.
- **Tests**:
  - integración: se encola al reservar, cancelar y mover; los recordatorios no se duplican; el token del enlace no queda guardado en texto plano;
  - E2E: el email aparece en la bandeja de prueba.

### Textos a corregir cuando esté hecho

Hoy dicen que no hay emails, o los evitan. Hay que volver a mencionarlos en:

- el formulario de reserva y la tarjeta del chat (pista del campo email);
- «Mi turno» («Está en el email de confirmación»);
- Ajustes (pista de «Recordatorio»);
- la FAQ de demo («¿Cómo cancelo un turno?»);
- `GUIA.md` (sección 12).

**Decisión pendiente:** qué proveedor usar. Ver [punto 10](#10-para-decidir-con-la-clínica).

---

## 3. Asistente con IA real

**Estado:** el chat funciona con un **modelo simulado** (`LLM_MOCK=1`), que solo entiende frases simples:

- el nombre de una especialidad;
- «mañana» o «tarde»;
- «H3»;
- «cancelar».

No responde preguntas libres ni la FAQ.

**Qué hacer**:

1. Sacar al menos una clave gratuita en [console.groq.com/keys](https://console.groq.com/keys). Conviene también una de respaldo en [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Cargarla en `.env` (`GROQ_API_KEY=…`), dejar `LLM_MOCK=` vacío y reiniciar.
3. **Probar con conversaciones reales**:
   - pedidos ambiguos;
   - preguntas de la FAQ;
   - intentos de sacarle consejos médicos;
   - urgencias escritas de formas raras;
   - intentos de manipularlo («ignorá tus reglas»).
   - Revisar cada caso en Panel → Conversaciones.
4. Verificar que los **nombres de modelo** por defecto sigan existiendo: `llama-3.3-70b-versatile`, `gemini-2.5-flash` y `meta-llama/llama-3.3-70b-instruct:free`. Cambian seguido.
5. Ajustar el **tope diario de tokens** (`LLM_DAILY_TOKEN_LIMIT`, 300.000 por defecto) según el uso real.

**A tener en cuenta**: los planes gratuitos pueden usar los mensajes para entrenar sus modelos. El asistente no les manda nombre, teléfono ni email, y la política de privacidad ya lo explica. Para producción con volumen conviene un plan pago con «no entrenar con mis datos».

### Mejoras del asistente

- **Conversación que sobreviva a una recarga** (M): guardar el id y el secreto en la pestaña y recuperar el historial.
- **Respuestas palabra por palabra** (streaming) (M): se siente mucho más rápido.
- **Lista de urgencias revisada por un médico** (S): hoy es una lista razonable de frases, no validada clínicamente.
- **Responder sobre un turno existente sin formulario** (M): por ejemplo «¿a qué hora es mi turno?». Hoy siempre muestra el formulario seguro, y está bien por privacidad, pero se podría resumir el turno una vez verificado.

---

## 4. Puesta en producción

**Estado:** no hay `Dockerfile` ni configuración de producción. La app ya compila en modo `standalone` y espera estar detrás de un proxy que pase la IP real del visitante.

**Qué hacer**:

- **Dockerfile** multi-etapa (build + `node server.js`) y **docker-compose de producción**: app + PostgreSQL 17 + proxy con HTTPS (Caddy o nginx con Let's Encrypt).
- **Variables de producción**: `NODE_ENV=production`, `APP_URL` con el dominio real y claves nuevas, que **no** sean las de desarrollo.
- **Respaldo de `PII_ENCRYPTION_KEY`** en un lugar seguro y separado de los backups de la base. Sin esa clave se pierden todos los teléfonos y emails.
- **Backups automáticos** de la base (`pg_dump` diario, con retención) y **una prueba de restauración**.
- **Migraciones al desplegar**: `pnpm db:migrate` antes de levantar la versión nueva.
- **Usuarios reales**: no correr `pnpm seed` en producción (ya está bloqueado salvo `SEED_ALLOW_PRODUCTION=true`). Crear el superadmin con un script o a mano y cargar la clínica real.
- **Monitoreo**:
  - `/healthz` ya existe; conectarlo a un monitor de disponibilidad (UptimeRobot o similar);
  - registro de errores (Sentry o similar), sin datos personales.
- **Seguridad del servidor**:
  - firewall y la base sin exposición a internet;
  - actualizaciones automáticas;
  - cabeceras de seguridad (CSP, HSTS) en el proxy.
- **CI/CD**: el workflow de GitHub ya corre tests y E2E. Falta el despliegue automático cuando se mergea a `main`.
- **Dominio y email del dominio** (SPF, DKIM y DMARC), para que los emails del punto 2 no caigan en spam.

---

## 5. Avisos cuando la clínica cancela o mueve

**Estado:** cuando la clínica cancela o mueve un turno desde el panel, **el paciente no se entera**. Lo mismo pasa al cargar un bloqueo o unas vacaciones: el panel avisa «hay N turnos afectados», pero no hace nada más.

**Qué hacer** (depende del punto 2):

- Email automático al cancelar o mover desde el panel, con un campo opcional «Motivo» para el paciente.
- En **Feriados y bloqueos**: mostrar la lista de turnos afectados y un botón **«Cancelar y avisar a los pacientes»**, con confirmación y registro en auditoría.
- Botones **«Llamar»** y **«Abrir WhatsApp»** en la ficha del turno y del paciente, para avisar a mano.

---

## 6. Mejoras para el paciente

| Mejora | Detalle | Esfuerzo |
|---|---|---|
| **Recordatorio por WhatsApp** | Mucho más leído que el email en Argentina. Requiere la API oficial de WhatsApp Business (Meta), plantillas aprobadas y costo por mensaje. | L |
| **Lista de espera** | Si no hay horarios: «avisame si se libera un turno con este profesional». Al cancelarse uno, se avisa a los primeros de la lista. | L |
| **Reprogramar en un paso** | Hoy el paciente cancela y vuelve a reservar. Un «Cambiar horario» desde «Mi turno», dentro del plazo. | M |
| **Coberturas / obras sociales** | Elegir la cobertura al reservar y filtrar profesionales que la aceptan. Hoy solo está en la FAQ. | M |
| **Datos opcionales del paciente** | DNI, fecha de nacimiento, motivo breve de consulta. Revisar antes con la clínica qué hace falta (ver punto 10). | M |
| **Identidad por clínica** | Logo y color de cada clínica en sus páginas y emails. Hoy todo dice «Turnos IA». | M |

---

## 7. Mejoras para el panel

| Mejora | Detalle | Esfuerzo |
|---|---|---|
| **Búsqueda global** | Un buscador en el encabezado: pegar un código `T-XXXXXX`, un teléfono o un nombre y abrir la ficha directo. | M |
| **Calendario en todos los campos de fecha** | Hoy el calendario está en la agenda. Faltan los filtros de Turnos y Conversaciones, el diálogo «Agendar / Mover turno» y Feriados y bloqueos, que usan el selector nativo del navegador. | S |
| **Rol «Profesional»** | Que cada médico entre y vea solo su agenda del día (sin datos de otros profesionales), cómodo desde el celular. | M |
| **Arrastrar turnos en la agenda** | Mover un turno arrastrándolo, además del diálogo actual. Siempre con revalidación en el servidor. | M |
| **Dashboard con más métricas** | Cuántas conversaciones del chat terminan en reserva; ausentes por profesional; horarios con menos ocupación; comparación mes a mes. | M |
| **Imprimir / exportar la agenda del día** | PDF o vista de impresión para recepción. | S |
| **Recuperar contraseña del equipo** | Hoy la cambia un administrador. Un «Olvidé mi contraseña» por email (depende del punto 2). | M |
| **Doble factor (2FA)** para administradores | Better Auth lo soporta. Recomendable por manejar datos de salud. | M |

---

## 8. Diseño y accesibilidad

- **Tamaño de letra ajustable** («A+»), junto al botón de tema (S). El público incluye personas mayores.
- **Revisión con lector de pantalla** (NVDA, VoiceOver) de los flujos completos: reserva, chat y panel (M).
- **Prueba en celulares reales**: iPhone con muesca, Android chico y el teclado del chat sobre la barra inferior (S).
- **Imagen para compartir** (Open Graph) e **ícono de la app** con el logo, para cuando se comparte el enlace por WhatsApp (S).
- **Instalable como app** (PWA: manifiesto e íconos), para que el paciente o la recepción la agreguen a la pantalla de inicio (S).
- **Páginas de error y 404** con el diseño de la app y un camino de vuelta (S).

---

## 9. Deuda técnica

| Tema | Riesgo | Qué hacer | Esfuerzo |
|---|---|---|---|
| **Límites de intentos en memoria** | Con más de una instancia de la app los límites no se comparten, y se reinician al reiniciar. | Pasarlos a Postgres o Redis antes de escalar. | S |
| **Retención del chat y `/privacidad`** | Si se cambia `CHAT_RETENTION_DAYS`, la página de privacidad sigue diciendo «30 días». | Mostrar el valor configurado en la página. | S |
| **Limpieza de conversaciones** | Corre como mucho una vez por hora, solo cuando alguien abre el chat. Si nadie lo usa, no se borra nada. | Moverla a la tarea programada de los recordatorios (punto 2). | S |
| **Playwright en Windows** | La instalación automática de Chromium se colgaba en esta máquina al extraer (probablemente el antivirus). Se resolvió extrayendo a mano. | Documentarlo en el README o excluir la carpeta del antivirus. | S |
| **Dependencias** | `react-day-picker` 10 ya existe (se usa la 9). | Revisar actualizaciones cada mes (`pnpm outdated`), con los tests como red. | S |
| **Aviso de hidratación en desarrollo** | Apareció una vez tras un compilado en caliente y no se reprodujo. | Vigilarlo; si vuelve, revisar los componentes con fechas. | S |
| **Plan original** | No se encontró el documento de los 6 hitos. Los hitos 5 y 6 de este archivo se infirieron del código. | Si aparece, contrastarlo con este documento. | — |

---

## 10. Para decidir con la clínica

Estas respuestas cambian lo que hay que construir:

1. **Proveedor de email**:
   - **Brevo**: gratis, 300 por día, solo verificar el remitente;
   - **Gmail**: rápido de configurar, pero sale desde una cuenta personal;
   - **Resend** o **Amazon SES**: necesitan un dominio propio.

   Y **desde qué dirección** salen los emails.
2. **Dominio y servidor** donde va a vivir la app (VPS propio, Railway, Render…).
3. **Qué datos pedir al paciente** además de nombre, teléfono y email (DNI, cobertura, fecha de nacimiento). Cada dato extra implica revisar la política de privacidad.
4. **Plazo de cancelación y de recordatorio** por clínica. Hoy son 24 h y 48 h por defecto.
5. **Si se cobra la consulta online** (seña con Mercado Pago). Hoy no está contemplado.
6. **WhatsApp**: si vale el costo por mensaje de la API oficial.
7. **Quién revisa la lista de urgencias** del asistente y el texto del mensaje de emergencia.
8. **Textos legales finales**: la política de privacidad actual es un borrador razonable para la Ley 25.326, no revisado por un abogado. Hay que agregar el responsable de la base de datos y su inscripción ante la AAIP, si corresponde.
