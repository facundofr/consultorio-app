# Turnos IA: lo que falta

Actualizado el 25 de octubre de 2026. **La app está lista para producción**: emails, recordatorios, doble factor, tareas automáticas, despliegue con Docker (HTTPS, migraciones y backups) y los arreglos de seguridad de la revisión. Ver [`DECISIONS.md`](./DECISIONS.md) (S1–S6, E1–E6, J1–J2, F1–F4, D5–D7) y la guía de instalación [`deploy/README.md`](./deploy/README.md).

Cómo funciona hoy la app: [`GUIA.md`](./GUIA.md).

**Leyenda de esfuerzo**: S = horas · M = 1 a 2 días · L = 3 días o más.

---

## 1. Antes de abrirla a pacientes (fuera del código)

Esto no se resuelve programando: lo tiene que hacer o decidir la clínica.

| # | Qué | Quién |
|---|---|---|
| 1 | **Servidor y dominio**: contratar un VPS y apuntar el dominio. Seguir [`deploy/README.md`](./deploy/README.md) | Técnico |
| 2 | **Proveedor de email** (Brevo, Amazon SES, Resend, Gmail…) y **SPF, DKIM y DMARC** del dominio del remitente, para que no caiga en spam | Técnico + clínica |
| 3 | **Claves de producción nuevas**, con una copia de `PII_ENCRYPTION_KEY` en un gestor de contraseñas, separada de los backups | Técnico |
| 4 | **Backups fuera del servidor** (otro proveedor o bucket) y **una prueba de restauración** | Técnico |
| 5 | **Monitor de disponibilidad** (UptimeRobot o similar) sobre `/healthz`; opcional `ERROR_WEBHOOK_URL` para recibir los errores | Técnico |
| 6 | **Textos legales**: revisión de la política de privacidad por un abogado, responsable de la base y, si corresponde, inscripción ante la AAIP (Ley 25.326) | Clínica + abogado |
| 7 | **Lista de urgencias del asistente** revisada por un médico, y el texto del mensaje de emergencia | Clínica |
| 8 | **Asistente con IA real** (opcional): cargar al menos una clave (Groq o Gemini) y probarlo con conversaciones reales; para volumen, un plan pago que no entrene con los datos | Técnico |
| 9 | **Cargar la clínica real** (sedes, profesionales, horarios, feriados) y los usuarios del equipo | Clínica |

---

## 2. Hecho en esta etapa

- **Emails**: confirmación (con enlace y `.ics`), cancelación (de paciente o clínica), cambio de horario y recordatorio. Cola en la base, reintentos, contenido cifrado que se borra al enviarse, bandeja de prueba y pantalla **Emails** en el panel.
- **Avisos cuando la clínica cancela o mueve**: llegan por email automáticamente.
- **Tareas automáticas**: envíos, recordatorios y limpieza (conversaciones, contenido de emails, contadores de intentos), seguras con varias instancias.
- **Doble factor** con app de autenticación y códigos de respaldo, obligatorio por rol, más cambio de la propia contraseña.
- **Producción**: `Dockerfile`, `docker-compose.prod.yml` (Postgres, migraciones, app, Caddy con HTTPS y backup diario), `pnpm create-admin` y `pnpm jobs`, validación de la configuración al arrancar y registro de errores sin datos personales.
- **Seguridad**: IP real detrás del proxy, límites de intentos en Postgres, endpoints de Better Auth cerrados, cabeceras con CSP, reserva pública que no pisa datos de pacientes, CSV solo para administración, clínica desactivada sin reservas e intentos de login fallidos en auditoría.
- **Bugs corregidos**: escape de `;` en el `.ics` y lockfile desactualizado.

---

## 3. Mejoras para el paciente

| Mejora | Detalle | Esfuerzo |
|---|---|---|
| **Recordatorio por WhatsApp** | Mucho más leído que el email en Argentina. Requiere la API oficial de WhatsApp Business (Meta), plantillas aprobadas y costo por mensaje. | L |
| **Lista de espera** | Si no hay horarios: «avisame si se libera un turno con este profesional». Al cancelarse uno, se avisa a los primeros de la lista. | L |
| **Reprogramar en un paso** | Hoy el paciente cancela y vuelve a reservar. Un «Cambiar horario» desde «Mi turno», dentro del plazo. | M |
| **Coberturas / obras sociales** | Elegir la cobertura al reservar y filtrar profesionales que la aceptan. Hoy solo está en la FAQ. | M |
| **Datos opcionales del paciente** | DNI, fecha de nacimiento, motivo breve de consulta. Revisar antes con la clínica qué hace falta (ver punto 10). | M |
| **Identidad por clínica** | Logo y color de cada clínica en sus páginas y emails. Hoy todo dice «Turnos IA». | M |

---

## 4. Mejoras para el panel

| Mejora | Detalle | Esfuerzo |
|---|---|---|
| **Búsqueda global** | Un buscador en el encabezado: pegar un código `T-XXXXXX`, un teléfono o un nombre y abrir la ficha directo. | M |
| **Calendario en todos los campos de fecha** | Hoy el calendario está en la agenda. Faltan los filtros de Turnos y Conversaciones, el diálogo «Agendar / Mover turno» y Feriados y bloqueos, que usan el selector nativo del navegador. | S |
| **Rol «Profesional»** | Que cada médico entre y vea solo su agenda del día (sin datos de otros profesionales), cómodo desde el celular. | M |
| **Arrastrar turnos en la agenda** | Mover un turno arrastrándolo, además del diálogo actual. Siempre con revalidación en el servidor. | M |
| **Dashboard con más métricas** | Cuántas conversaciones del chat terminan en reserva; ausentes por profesional; horarios con menos ocupación; comparación mes a mes. | M |
| **Imprimir / exportar la agenda del día** | PDF o vista de impresión para recepción. | S |
| **Recuperar contraseña del equipo** | Hoy la cambia un administrador (o `pnpm create-admin`). Un «Olvidé mi contraseña» por email, ahora que hay envío. | M |

---

## 5. Diseño y accesibilidad

- **Tamaño de letra ajustable** («A+»), junto al botón de tema (S). El público incluye personas mayores.
- **Revisión con lector de pantalla** (NVDA, VoiceOver) de los flujos completos: reserva, chat y panel (M).
- **Prueba en celulares reales**: iPhone con muesca, Android chico y el teclado del chat sobre la barra inferior (S).
- **Imagen para compartir** (Open Graph) e **ícono de la app** con el logo, para cuando se comparte el enlace por WhatsApp (S).
- **Instalable como app** (PWA: manifiesto e íconos), para que el paciente o la recepción la agreguen a la pantalla de inicio (S).
- **Páginas de error y 404** con el diseño de la app y un camino de vuelta (S).

---

## 6. Deuda técnica

| Tema | Riesgo | Qué hacer | Esfuerzo |
|---|---|---|---|
| **Playwright en Windows** | La instalación automática de Chromium se colgaba en esta máquina al extraer (probablemente el antivirus). Se resolvió extrayendo a mano. | Documentarlo en el README o excluir la carpeta del antivirus. | S |
| **Avisos de bloqueos** | Al cargar un feriado o vacaciones el panel dice «hay N turnos afectados», pero no ofrece cancelarlos y avisar en un paso. | Botón «Cancelar y avisar a los pacientes» (los emails ya existen). | M |
| **CI/CD** | El workflow corre tests y E2E, pero no despliega. | Desplegar al servidor cuando se mergea a `main` (SSH + `docker compose up -d --build`). | S |
| **Dependencias** | `react-day-picker` 10 ya existe (se usa la 9). | Revisar actualizaciones cada mes (`pnpm outdated`), con los tests como red. | S |
| **Aviso de hidratación en desarrollo** | Apareció una vez tras un compilado en caliente y no se reprodujo. | Vigilarlo; si vuelve, revisar los componentes con fechas. | S |
| **Plan original** | No se encontró el documento de los 6 hitos. Los hitos 5 y 6 de este archivo se infirieron del código. | Si aparece, contrastarlo con este documento. | — |

---

## 7. Para decidir con la clínica

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
