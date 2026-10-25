# Puesta en producción

Guía para instalar Turnos IA en un servidor propio (VPS) con Docker. Todo queda en un solo servidor:

- la base PostgreSQL 17;
- la app, que también envía los emails y recordatorios;
- Caddy, con HTTPS automático;
- un backup diario.

## Qué necesitás

- Un **VPS con Linux**, 2 GB de RAM y 20 GB de disco alcanzan para empezar. Por ejemplo: DigitalOcean, Hetzner, Vultr o Contabo.
- **Docker** con el plugin `compose` ([instalación](https://docs.docker.com/engine/install/)).
- Un **dominio** (por ejemplo `turnos.miclinica.com.ar`) con un registro **A** que apunte a la IP del servidor.
- Una cuenta de **email con SMTP**: Brevo, Amazon SES, Resend, Gmail con contraseña de aplicación, o el de la clínica.

## 1. Preparar el servidor

```bash
# Firewall: solo SSH y web. La base nunca se expone.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

git clone <tu-repositorio> turnos && cd turnos
cp .env.production.example .env.production
```

## 2. Completar `.env.production`

| Variable | Qué poner |
|---|---|
| `DOMAIN`, `APP_URL` | El dominio, con `https://` en `APP_URL` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`, `BETTER_AUTH_SECRET` | Una distinta cada una: `openssl rand -base64 32`. **Claves nuevas**, nunca las de desarrollo |
| `SMTP_*`, `MAIL_FROM` | Los datos del proveedor de email |
| `TWO_FACTOR_REQUIRED_ROLES` | `superadmin,clinic_admin` (recomendado) |
| `GROQ_API_KEY` u otra | Opcional: sin claves, el asistente queda apagado y se usa el formulario |

> **Muy importante:** guardá una copia de `PII_ENCRYPTION_KEY` en un gestor de contraseñas, **separada de los backups**. Sin esa clave, los teléfonos y emails de los pacientes no se pueden leer nunca más.

## 3. Levantar todo

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app
```

Las migraciones se aplican solas antes de que arranque la app (servicio `migrate`). En el log de la app tiene que aparecer `[jobs] scheduler started`. Si aparece algún `[startup] …`, es una advertencia de configuración que conviene revisar.

Abrí `https://tu-dominio/healthz`: tiene que responder `{"status":"ok"}`.

## 4. Crear el primer usuario

`pnpm seed` está bloqueado en producción (son datos de demo). Creá el superadmin:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate \
  pnpm create-admin --email vos@miclinica.com.ar --name "Tu Nombre"
```

La contraseña se muestra **una sola vez**. Después:

1. Entrá a `https://tu-dominio/admin`. Te va a pedir que configures el **doble factor** con una app como Google Authenticator. Guardá los códigos de respaldo.
2. En **Clínicas**, cargá la clínica real. Después, en este orden: sedes, especialidades, tipos de consulta, profesionales con sus horarios, y feriados.
3. En **Usuarios**, creá los usuarios de administración y recepción.
4. En **Ajustes**, completá el teléfono de contacto, el plazo de cancelación y el recordatorio.
5. Reservá un turno de prueba con tu email y revisá que llegue la confirmación. Su estado se ve en **Panel → Emails**.

Si alguien pierde el celular del doble factor y sus códigos de respaldo, administración se lo quita desde **Usuarios → (la persona) → Quitar doble factor**.

## Backups

El servicio `backup` hace un `pg_dump` al arrancar y después todos los días a las `BACKUP_HOUR` (3 AM por defecto). Los guarda en `BACKUP_DIR` (`./backups`) y conserva `BACKUP_KEEP_DAYS` días.

- **Copialos fuera del servidor** (otro proveedor, un bucket S3, rclone a Google Drive…). Un backup que vive solo en el mismo disco no protege de perder el servidor.
- Los teléfonos y emails dentro del backup están cifrados: sin `PII_ENCRYPTION_KEY` no sirven.

### Restaurar un backup

Hacé una prueba de restauración **antes** de usar la app con pacientes, y repetila cada tanto:

```bash
# 1. Frenar la app para que nadie escriba durante la restauración
docker compose --env-file .env.production -f docker-compose.prod.yml stop app

# 2. Restaurar (reemplaza el contenido actual de la base)
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_restore -U turnos -d turnos --clean --if-exists < backups/turnos_AAAA-MM-DD_HHMM.dump

# 3. Volver a levantar
docker compose --env-file .env.production -f docker-compose.prod.yml start app
```

## Actualizar a una versión nueva

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

`migrate` aplica las migraciones nuevas antes de que arranque la app nueva.

## Monitoreo

- **Disponibilidad:** configurá un monitor gratuito (UptimeRobot, Better Stack…) contra `https://tu-dominio/healthz`. Avisa si la app o la base dejan de responder.
- **Errores:** cada error del servidor queda en el log como una línea JSON, sin datos de pacientes (`docker compose … logs app`). Con `ERROR_WEBHOOK_URL` también se envía a un webhook de Slack, de Discord o de tu herramienta de logs.
- **Emails:** **Panel → Emails** muestra cada envío, los reintentos y los que fallaron. Si las tareas automáticas se frenan, muestra un aviso.

## Seguridad: checklist

- [ ] El firewall deja abiertos solo los puertos 22, 80 y 443. La base no tiene puertos publicados.
- [ ] Las claves de `.env.production` son nuevas y hay una copia de `PII_ENCRYPTION_KEY` fuera del servidor.
- [ ] `TWO_FACTOR_REQUIRED_ROLES=superadmin,clinic_admin`.
- [ ] El dominio del remitente tiene SPF, DKIM y DMARC configurados.
- [ ] Los backups se copian fuera del servidor y ya probaste una restauración.
- [ ] El sistema tiene actualizaciones automáticas (`unattended-upgrades` en Debian/Ubuntu).
- [ ] Revisaste la política de privacidad con un abogado y, si corresponde, inscribiste la base en la AAIP.
- [ ] Un médico revisó la lista de frases de urgencia del asistente.
