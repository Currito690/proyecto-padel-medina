> **ESTADO REAL (2026-09-09):** la migración se ejecutó el mismo día siguiendo el Diseño 1, con estas diferencias respecto al plan: la API se sirve **bajo ruta** (`https://padelmedina.com/supabase/…`, proxy Apache con websockets) en vez del subdominio `api.padelmedina.com` (el DNS vive en IONOS); sin entorno de staging (se probó sobre la ruta nueva sin tocar la web); stack oficial completo con puertos solo en 127.0.0.1 (5433/6544/8000); datos restaurados y verificados fila a fila; funciones en edge-runtime con allowlist pública para Redsys y `delete-user`/`send-push`/`send-booking-email` endurecidas; VAPID regenerado; copia diaria por cron. Los secretos de Resend/Redsys/Google no se pueden extraer de Supabase (la API devuelve huellas) y se cargan desde sus fuentes originales.

# MIGRACIÓN PADEL MEDINA: de Supabase Cloud a Supabase self-hosted en el Plesk de IONOS

> Documento ejecutable. Versión 1.0 (2026-09-09). Sustituye a la parte "Supabase NO se mueve" de `MIGRACION-IONOS.md`.
> Servidor destino: `87.106.229.29` (Debian 13 + Plesk Obsidian, root por SSH). Origen: proyecto cloud `iquibawtbpamhaottlbr` (eu-west-1), hoy en `DatabaseTimeout`.
> Convención: los bloques `bash` se ejecutan como **root en el servidor** salvo que se indique "(PC)" o "(cloud SQL editor)".

---

## 0. Decisión y arquitectura elegida

### 0.1 Por qué Supabase self-hosted y no "Postgres + API propia"

La app cuelga de **una sola URL base** (`VITE_SUPABASE_URL`): supabase-js deriva de ella `/rest/v1`, `/auth/v1`, `/storage/v1`, `/functions/v1` y `wss://…/realtime/v1`. Si el nuevo host expone exactamente esos prefijos, el frontend cambia **2 líneas de `.env.production` y 2 de `index.html`**. Eso solo lo da el stack oficial self-hosted (Kong delante de GoTrue, PostgREST, storage-api, Realtime y edge-runtime).

La alternativa "PostgreSQL 17 + API Node única" (Diseño 2 de la evaluación) obliga a reescribir: 66 referencias a `auth.uid()/auth.jwt()/auth.role()`, ~40 políticas RLS, todo el login (OTP, recovery, Google), 12 funciones Deno (incluida la firma Redsys que mueve dinero) y ~203 puntos de llamada en 21 ficheros sin tests (AdminDashboard 2.398 líneas, TournamentManager 7.705). Son 22-32 días de exposición con una BD cloud que ya se cae. **Queda como hoja de ruta a 6-12 meses**, no como vía de rescate (ver §10.3).

### 0.2 Qué se toma de cada diseño evaluado

| De dónde | Qué |
|---|---|
| Diseño 1 (base) | Stack Docker recortado, límites de memoria por contenedor, swap, `daemon.json`, cron del host para recordatorios, `private.app_config` en vez de Vault, `restore.sh` ensayado en el PC, systemd + prueba de reinicio, backups diarios + offsite + prueba mensual, parches obligatorios a `delete-user` y `send-push`, `dump-env` para rescatar secretos, plan B Node detrás de `kong.yml`, `limit_req_zone` en `/etc/nginx/conf.d`. |
| Diseño 3 (corte) | Congelación con `.htaccess` 503 + drenaje de 20-25 min ANTES del dump final, `T_DUMP` anotado, smoke test desde un build de staging contra los datos de producción restaurados ANTES de mergear el commit de cambio, conciliación diaria 7 días (no solo panel Redsys), cloud vivo 30 días y **no rotar** Redsys/Resend/VAPID/Google hasta cerrarlo, pin exacto de GoTrue v2.188.1 y storage-api v1.37.7, `kong.yml` con `exposed_headers: [Date]`, `restart functions realtime rest` + `NOTIFY pgrst` tras restaurar, diagnóstico del `DatabaseTimeout` (`net._http_response` + cron). |
| Diseño 2 (injertos) | `location ^~` en el nginx de Plesk y **ningún `location /` propio**, comprobar 5432 antes de elegir puertos, `api.padelmedina.com` en modo notify-only tras un rollback, `git tag pre-selfhost`, backups dentro de `/var/www/vhosts/padelmedina.com/private/` para que el Backup Manager de Plesk los lleve fuera, razones para no usar el Postfix de Plesk. |
| Añadidos de los jueces | `DENO_DIR` persistente, calentamiento (warm-up) de funciones tras cada arranque, mapa `verify_jwt` por función en `main/index.ts` (no `false` global), replay de una notificación Redsys real capturada, sin parada semanal "en frío", no tocar ClamAV/SpamAssassin, VPS de 8 GB, `PGRST_DB_SCHEMAS` sin `storage`, chequeo de salida a Internet desde dentro de un contenedor, alerta de disco/RAM, borrar el vhost de staging tras el corte, `send-booking-email` con autenticación y `MyBookings.jsx:72` arreglado, procedimiento de restauración escrito para el backup diario (es el mismo `restore.sh`). |

### 0.3 Topología final

```
Internet ──443──> nginx de Plesk (87.106.229.29)
   │
   ├─ padelmedina.com          docroot estático = rama plesk-deploy (SIN cambios de infra)
   │                           └─ /mail-templates/ NO va aquí (van en api.)
   │
   ├─ staging.padelmedina.com  build del frontend apuntando a api. (solo D-7..D+1, se borra)
   │
   └─ api.padelmedina.com      location ^~ /rest|auth|storage|functions|realtime/v1/  ──> 127.0.0.1:8000 (Kong)
                               location ^~ /mail-templates/  (estático, plantillas GoTrue)
                               location = /healthz            (sonda externa)
                                        │
                     ┌──────────────────┴─────────── docker compose "supabase" (/opt/supabase) ───────────────┐
                     │  kong 2.8.1 (127.0.0.1:8000)                                                            │
                     │   ├─ auth      gotrue v2.188.1        SMTP smtp.resend.com:465, Google OAuth             │
                     │   ├─ rest      postgrest v14.x        PGRST_DB_SCHEMAS=public,graphql_public             │
                     │   ├─ realtime  supabase/realtime      publication supabase_realtime (bookings, regs)     │
                     │   ├─ storage   storage-api v1.37.7    backend FILE ./volumes/storage                    │
                     │   ├─ functions edge-runtime           12 funciones tal cual + main/index.ts parcheado    │
                     │   │            DENO_DIR persistente, warm-up tras cada arranque                          │
                     │   ├─ db        supabase/postgres 17.6.1.x  (pgcrypto, pg_net; sin pg_cron activo)        │
                     │   └─ meta + studio (profile "tools": solo por túnel SSH, apagados por defecto)           │
                     │  ELIMINADOS: analytics (Logflare), vector, imgproxy, supavisor                            │
                     └────────────────────────────────────────────────────────────────────────────────────────┘

Redsys ──POST──> https://api.padelmedina.com/functions/v1/redsys-notify | redsys-notify-split | redsys-redirect
cron del host ──*/30──> http://127.0.0.1:8000/functions/v1/send-reminders   (Bearer SERVICE_ROLE_KEY)
trigger tournament_registrations ──pg_net──> http://kong:8000/functions/v1/send-registration-admin-notify
   (URL, bearer y secreto leídos de private.app_config, no literales ni Vault)
```

Nada de Docker se publica fuera de `127.0.0.1`. Studio nunca se expone. Todo lo público entra por el nginx de Plesk (fail2ban, Let's Encrypt y HSTS del apex siguen mandando).

### 0.4 Reglas que no se negocian

1. **El dump es la verdad, el repo no** (drift confirmado: `profiles.phone`, `site_settings.slots_release_time`, `bookings.share_links`, rol `monitor`, política recursiva de `profiles`, posible `increment_split_paid`).
2. **Auth y storage se restauran como DATOS, nunca su DDL** (GoTrue y storage-api son dueños de sus esquemas y sus migraciones son solo hacia delante). Versiones pineadas a las del cloud para la primera restauración.
3. **Congelar antes del dump final.** Cero escrituras en cloud entre `T_DUMP` y el cambio de frontend.
4. **Probar con dinero real (1 EUR + devolución), nunca con credenciales de test de Redsys en el stack de producción.**
5. **Cloud vivo 30 días** tras el corte. No pausar, no borrar, no rotar `REDSYS_SECRET_KEY`, `RESEND_API_KEY`, VAPID ni el client secret de Google hasta el cierre.
6. **Ningún cambio funcional se mezcla con el corte** salvo los tres parches de seguridad obligatorios (§6.3) y el arreglo de `MyBookings.jsx:72`.
7. **No se toca ClamAV/SpamAssassin/Dovecot del servidor**: si la RAM no llega, se amplía el VPS.

---

## 1. Requisitos previos y comprobaciones del servidor

### 1.1 Medir antes de decidir (como root)

```bash
nproc; free -m; swapon --show; df -h / /var/www /var/lib
cat /etc/debian_version; uname -r
# Puertos que necesitamos libres en loopback: 8000 (Kong), 3000 (Studio, opcional). Plesk puede traer PostgreSQL propio en 5432: nuestro db NO publica puerto, no colisiona.
ss -ltnp | grep -E ':(5432|8000|3000|4000|54322)\b' || echo "puertos libres"
# Qué corre ya (Plesk + correo + antivirus). NO se para nada de esto.
systemctl list-units --type=service --state=running | grep -Ei 'psa|sw-engine|sw-cp|postfix|dovecot|spamassassin|clamav|amavis|mariadb|mysql|apache2|nginx|php|fail2ban'
ps -eo rss,comm --sort=-rss | head -15          # RSS en MB/1024 de los procesos más gordos
timedatectl                                     # zona horaria: fijar Europe/Madrid (los triggers ya convierten explícitamente; el cron del host sí depende de esto)
timedatectl set-timezone Europe/Madrid
```

### 1.2 Requisitos (decisión GO/NO-GO)

| Recurso | Mínimo | Justificación |
|---|---|---|
| RAM total | **8 GB** (IONOS VPS L o superior). Con 4-6 GB solo si `free -m` muestra ≥ 3.5 GB *available* con Plesk y el correo funcionando, y aceptando latencias. Con 2 GB: NO. | Stack recortado en reposo 1.5-2.5 GB (db 300-600 MB con `shared_buffers=256MB`, kong ~250, realtime 250-400, functions 150-400, storage ~120, auth ~40, rest ~60). Plesk + Postfix + Dovecot + MariaDB + Apache/nginx/PHP 1-2.5 GB; **ClamAV 1-1.3 GB si está activo y NO se toca**. |
| CPU | 2 vCPU mínimo, 4 recomendadas | edge-runtime compila TS al primer arranque; `send-bracket-published` y `pg_restore` compiten con el escaneo de correo. |
| Disco | ≥ 20 GB libres tras instalar, SSD/NVMe | Imágenes ~3-4 GB, BD < 1 GB (vigilar `fichajes.firma` base64), pósters < 100 MB, backups 14 días < 2 GB, logs rotados 20 MB × 5 × servicio. |
| Swap | 2 GB | Evita que el OOM-killer mate a Postgres **o a Dovecot/Postfix** bajo un pico. |
| Red | IPv4 pública (ya), 443 abierto (ya), salida HTTPS a esm.sh, deno.land, registry.npmjs.org, api.resend.com, accounts.google.com, endpoints push (FCM/Apple/Mozilla) y TCP 465 a smtp.resend.com | edge-runtime descarga módulos al primer arranque; GoTrue manda correo por SMTP. |
| DNS | `A api 87.106.229.29` (TTL 300) y `A staging 87.106.229.29` (temporal) en el panel de IONOS | CAA existente ya autoriza `letsencrypt.org`. El apex manda HSTS `includeSubDomains; preload`: `api.` necesita TLS válido desde el primer request. |
| Software | Docker CE ≥ 27 + compose plugin v2 (repo oficial Docker para trixie), `postgresql-client-17` (PGDG), `curl`, `jq`, `rclone`, `git` | No hace falta Node en el servidor (el build sigue en GitHub Actions). |
| Kernel | `vm.overcommit_memory=1` | Recomendado por Postgres en contenedor. |

Si RAM < 8 GB: **ampliar el VPS en IONOS antes de la Fase 1** (no requiere reinstalar). No se planifica apagar ClamAV/SpamAssassin: ese servidor da correo a otros dominios y no es decisión del club.

### 1.3 Credenciales y accesos que hay que tener ANTES de empezar

- Contraseña de la BD cloud (Dashboard → Settings → Database; resetear si no se conoce).
- `service_role` legacy del cloud (Settings → API) para descargar pósters y para `dump-env`.
- Acceso al Dashboard de Supabase, a GitHub (`Currito690/proyecto-padel-medina`), a Google Cloud Console (cliente OAuth), a Resend, al panel de administración de Redsys y al DNS de IONOS.
- Secretos de las Edge Functions (Supabase **no** muestra los valores): se rescatan con `dump-env` (§2.4). Origen alternativo: Redsys/banco (clave SHA-256 del comercio), Resend (nueva API key), VAPID (regenerar si se pierde: solo afecta a admins).

### 1.4 Preparación de la máquina

```bash
apt-get update && apt-get install -y ca-certificates curl gnupg jq git rclone
# Cliente PostgreSQL 17 (PGDG), misma major que el cloud (17.6.1.084)
apt-get install -y postgresql-common && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get install -y postgresql-client-17
# Docker CE oficial (Debian 13 "trixie")
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian trixie stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" }, "live-restore": true }
EOF
systemctl enable --now docker && docker info | grep -E 'Server Version|Live Restore'
# Swap si no hay
if [ -z "$(swapon --show)" ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
echo 'vm.overcommit_memory = 1' > /etc/sysctl.d/90-postgres.conf && sysctl --system >/dev/null
# unattended-upgrades sin reiniciar Docker por sorpresa
apt-get install -y unattended-upgrades
sed -i 's|^//Unattended-Upgrade::Package-Blacklist {|Unattended-Upgrade::Package-Blacklist {\n    "docker-ce";\n    "docker-ce-cli";\n    "containerd.io";|' /etc/apt/apt.conf.d/50unattended-upgrades
mkdir -p /opt/supabase /opt/padel /var/log/padel /var/www/vhosts/padelmedina.com/private/backups/supabase
```

Avisos específicos de Plesk + Docker:
- **Plesk Firewall**: al "aplicar" reglas puede vaciar las cadenas iptables de Docker y los contenedores pierden salida a Internet (Resend, esm.sh, Google). Tras cada cambio de firewall: `systemctl restart docker` y ejecutar `bin/healthcheck.sh` (§9.3), que comprueba la salida desde dentro de un contenedor.
- No instalar la extensión "Docker" de Plesk: gestiona contenedores sueltos y no entiende compose.
- fail2ban sigue protegiendo porque todo entra por el nginx del host.

---

## 2. Inventario de lo que se migra

### 2.1 Base de datos (esquema `public`, 15 tablas vivas)

| Tabla | Riesgo | Notas de migración |
|---|---|---|
| `courts` | bajo | 3 filas seed; `price` NULL = `site_settings.court_price`. |
| `profiles` | **alto** | FK a `auth.users`; **drift**: columna `phone` no está en ningún SQL del repo; rol `monitor` contra el CHECK original (`admin`,`client`); política `Admins ven todos los perfiles` autorreferente (el dump dirá cómo está realmente). Trigger `profiles_bloquea_cambio_role` usa `auth.jwt()`. |
| `bookings` | **alto** | Realtime; triggers `trg_bookings_release_time` (usa `auth.role()`/`is_admin()` y `site_settings.slots_release_time` —drift) y `trg_expire_stale_holds`; índices parciales `uq_bookings_slot_activa` + duplicado histórico `bookings_unique_confirmed`; **drift**: `share_links`. |
| `blocked_slots` | medio | FK `created_by → auth.users ON DELETE SET NULL`. |
| `site_settings` | medio | Fila única; **drift**: `slots_release_time`; resto `tienda_activa` (se limpia después). |
| `push_subscriptions` | bajo | FK `profiles`. Sobrevive solo si se conserva el par VAPID. |
| `tournaments` | medio | `config` jsonb con todo el estado; 4 políticas coexistentes (2 legacy por `admin_id`). |
| `tournament_registrations` | **alto** | Realtime; índice único de expresión con `norm_nombre_inscripcion`; política INSERT anon con `torneo_admite_inscripciones()`; **trigger `trg_notify_admin_on_new_registration` → pg_net + Vault + URL/JWT cloud literales (se reescribe, §5.5)**. |
| `events` | medio | `poster_url` con URL absoluta del Storage cloud (se reescribe con `replace()`). |
| `court_payment_rules`, `custom_slots`, `clases_monitor`, `monitor_tarifas` | bajo | Postgres plano + `is_admin()`. |
| `shared_payment_tokens` | medio | `DEFAULT encode(gen_random_bytes(24),'hex')` → **pgcrypto en schema `extensions`**. RLS abierta (deuda post-corte). |
| `fichajes` | medio | **GRANT de columna** `UPDATE (fichado_at) TO authenticated` (pg_dump lo conserva); trigger `fichajes_audita_edicion` usa `auth.uid()`. |
| Tienda (8 tablas) | — | Ya borradas; quedan `SEQUENCE store_order_seq` y `site_settings.tienda_activa` (limpieza post-corte). |

Funciones (11 vivas): `handle_new_user` (trigger en `auth.users`, **no viene en `pg_dump --schema=public`**), `is_admin`, `enforce_bookings_release_time`, `expire_stale_holds`, `notify_admin_on_new_registration` (se reescribe), `torneo_admite_inscripciones`, `norm_nombre_inscripcion`, `monitor_confirmar_cobro` y `monitor_marcar_pago_jugador` (RPC con REVOKE/GRANT), `profiles_bloquea_cambio_role`, `fichajes_audita_edicion`. Posible `increment_split_paid` (solo en cloud; si no existe, el fallback manual de `redsys-notify-split` ya es el camino real).

Dependencias exclusivas del cloud y su sustituto:

| Dependencia | Sustituto |
|---|---|
| `auth.uid()/role()/jwt()`, roles `anon/authenticated/service_role`, FKs a `auth.users` | Idénticos en la imagen `supabase/postgres`. Cero cambios. |
| `pg_cron` + `pg_net` → `send-reminders` (URL + `sb_publishable_` cloud) | Cron del host (§6.4). `pg_cron` no se activa. `setup-reminders.sql` queda obsoleto. |
| Trigger `notify_admin_on_new_registration` (URL + JWT literal + Vault) | Misma función leyendo `private.app_config` (URL interna `http://kong:8000`, anon JWT nuevo, secreto). pg_net se mantiene (viene en la imagen). |
| Realtime (`supabase_realtime` con `bookings`, `tournament_registrations`) | Servicio `realtime` + publicación creada en el fixup. WebSocket por nginx. |
| Storage `event-posters` (bucket + 4 políticas en `storage.objects` + ficheros) | Bucket/políticas en el fixup; ficheros descargados del cloud y **resubidos por API** (§5.6). |
| Vault (`registration_notify_secret`) | Tabla `private.app_config` (sobrevive a cualquier restauración, no depende de `VAULT_ENC_KEY`). |
| Claves `sb_publishable_…` | No existen en self-host: anon y service_role pasan a ser JWT HS256 firmados con `JWT_SECRET`. |

### 2.2 Auth (GoTrue)

- Flujos usados: password, alta con **OTP de 6 dígitos** (`verifyOtp type 'signup'` → la plantilla *Confirm signup* debe contener `{{ .Token }}`), recovery implícito (`/auth/v1/verify` → 302 a `https://padelmedina.com/reset-password#access_token=…` → la plantilla *Reset password* debe contener `{{ .ConfirmationURL }}`), Google OAuth (`redirectTo: window.location.origin`), `getSession` con gate `email_confirmed_at`.
- Se restauran **solo datos** de `auth.users` (hashes bcrypt, `email_confirmed_at`, metadata) y `auth.identities` (Google). Sesiones y refresh tokens no: todos los usuarios se desloguean igualmente al cambiar de host (supabase-js deriva la clave de localStorage del host).
- Config que vive solo en el Dashboard y se exporta a mano: plantillas de email + asuntos, Site URL + Redirect URLs, Google Client ID/Secret, `verify_jwt` real de las 6 funciones que no están en `config.toml`.
- Edge Functions que usan la Admin API de GoTrue: `admin-update-user`, `delete-user`; `GET /auth/v1/user` en `send-*`.

### 2.3 Storage, Realtime, Push

- Storage: un bucket público `event-posters` (5 MB, image/*), URLs absolutas en `events.poster_url`. Escritura permitida a cualquier `authenticated` (deuda).
- Realtime: `src/App.jsx:51-59` (INSERT en `bookings` → `send-push`, solo admin) y `src/components/admin/TournamentManager.jsx:538-553` (INSERT/UPDATE en `tournament_registrations` filtrado). Ambos admin-only; sin Realtime degradan a "recargar a mano", sin error visible.
- Push: VAPID; solo los admins están suscritos; `pushNotifications.js` re-suscribe en cada login de admin. Pública en `.env.production:7`; privada solo en secrets cloud.

### 2.4 Edge Functions (12 vivas, 3 muertas, 3 fantasma)

| Función | Llamada por | `verify_jwt` cloud | Destino |
|---|---|---|---|
| redsys-create | SPA (invoke + fetch anon en SharedPayment.jsx:45) | false | edge-runtime, sin cambios |
| redsys-notify | Redsys (POST form) | false | edge-runtime; L354 fallback `APP_URL` → `https://padelmedina.com` |
| redsys-notify-split | Redsys | false | edge-runtime, sin cambios |
| redsys-redirect | Navegador (303) | false | edge-runtime, sin cambios |
| send-booking-email | SPA, redsys-notify, send-reminders | false | edge-runtime + **exigir Bearer** (service role o sesión) y arreglar `MyBookings.jsx:72` |
| send-push | SPA (admin y clientes), redsys-notify | true (por defecto) | edge-runtime + **autorización obligatoria** |
| send-reminders | cron | true | edge-runtime, disparada por cron del host |
| delete-user | AdminDashboard | true | edge-runtime + **solo admin** + quitar línea `tournament_registrations?user_id` |
| admin-update-user | AdminDashboard | false | sin cambios (ya se autoriza) |
| send-tournament-confirmation, send-bracket-published | TournamentManager | true | sin cambios (ya se autorizan); subir `workerTimeoutMs` |
| send-registration-admin-notify | trigger pg_net | true | sin cambios; secreto en `functions.env` = `private.app_config` |
| create-payment-intent, stripe-webhook, debug-bookings | nadie | — | **no se migran**; borrar |
| shop-create-order, shop-order-status, send-order-email | nadie (solo `config.toml`) | — | borrar bloques |

### 2.5 Secretos a re-provisionar en el nuevo host

`RESEND_API_KEY`, `REDSYS_MERCHANT_CODE`, `REDSYS_TERMINAL`, `REDSYS_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `APP_URL`, `ADMIN_NOTIFY_EMAIL`, `CLUB_NOTIFY_EMAIL`, `REGISTRATION_NOTIFY_SECRET`, Google `CLIENT_ID`/`CLIENT_SECRET`. Nuevos y generados aquí: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `DASHBOARD_PASSWORD`. No se migran: `STRIPE_*`, `SHOP_NOTIFY_EMAIL`, `REDSYS_URL`.

**Cómo rescatar los valores que Supabase no muestra** (mientras el proyecto exista; las Edge Functions siguen vivas aunque la BD esté caída):

```ts
// supabase/functions/dump-env/index.ts  (TEMPORAL: se borra en cuanto se descarga)
Deno.serve((req) => req.headers.get('x-dump') === '<cadena-aleatoria-de-40-chars>'
  ? new Response(JSON.stringify(Deno.env.toObject()), { headers: { 'content-type': 'application/json' } })
  : new Response('no', { status: 403 }));
```
```bash
# (PC)
npx supabase functions deploy dump-env --no-verify-jwt --project-ref iquibawtbpamhaottlbr
curl -sS -H "x-dump: <cadena>" https://iquibawtbpamhaottlbr.supabase.co/functions/v1/dump-env > cloud-secrets.json
npx supabase functions delete dump-env --project-ref iquibawtbpamhaottlbr
# Guardar cloud-secrets.json en un gestor de contraseñas y borrarlo del disco tras copiar los valores. Nunca al repo ni a OneDrive.
```
Cuando la BD responda, el secreto del Vault también se lee: `select name, decrypted_secret from vault.decrypted_secrets;` (como `postgres`).

---

## 3. Preparación en Plesk

### 3.1 DNS (panel IONOS, donde viven los nameservers)

```
A     api       87.106.229.29   TTL 300
A     staging   87.106.229.29   TTL 300   (temporal; se borra en D+1)
```
Comprobar propagación: `dig +short api.padelmedina.com @1.1.1.1`. Los registros de Resend (`send.` MX/TXT, `resend._domainkey`) y el CAA `letsencrypt.org` no se tocan.

### 3.2 Subdominios y certificados

```bash
plesk bin subdomain --create api     -domain padelmedina.com -www-root api.padelmedina.com
plesk bin subdomain --create staging -domain padelmedina.com -www-root staging.padelmedina.com
# Let's Encrypt (si el CLI de la extensión no coincide con tu build, usar la UI: Dominios > api.padelmedina.com > SSL/TLS > Let's Encrypt)
plesk bin extension --exec letsencrypt cli.php -d api.padelmedina.com     -m curritoastdj@gmail.com
plesk bin extension --exec letsencrypt cli.php -d staging.padelmedina.com -m curritoastdj@gmail.com
openssl s_client -connect api.padelmedina.com:443 -servername api.padelmedina.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
```
La renovación la lleva Plesk. Hazlo **≥ 3 días antes del corte**: el apex ya manda `Strict-Transport-Security: includeSubDomains; preload`.

En la UI de `api.padelmedina.com` → *Apache & nginx Settings*: desmarcar **"Serve static files directly by nginx"** (cinturón: con `^~` ya ganamos a las regex de Plesk, pero así ni los pósters de `/storage/v1/object/public/...jpg` ni nada acaba en el manejador de estáticos). Dejar el resto por defecto (modo proxy con Apache detrás es irrelevante: nuestras `location ^~` se evalúan antes que la `location /` generada por Plesk).

### 3.3 Reverse proxy hacia Kong

Rate limit a nivel `http` (Plesk incluye `/etc/nginx/conf.d/*.conf`; sustituye al `middleware.js` de Vercel que ya se perdió):

```bash
cat > /etc/nginx/conf.d/padel-ratelimit.conf <<'EOF'
limit_req_zone $binary_remote_addr zone=padelapi:10m  rate=20r/s;
limit_req_zone $binary_remote_addr zone=padelauth:10m rate=5r/s;
EOF
```

Directivas del vhost (equivalen a "Additional nginx directives"; sobreviven a `httpdmng --reconfigure`). **Sin `location /` propia** (Plesk ya genera una; duplicarla rompe `nginx -t`). Todas las nuestras son `^~` (prefijo con prioridad sobre regex) o `=` (exacta):

```bash
ANON_KEY='<ANON_KEY generado en 4.3>'
cat > /var/www/vhosts/system/api.padelmedina.com/conf/vhost_nginx.conf <<EOF
client_max_body_size 12m;

# Plantillas de correo para GoTrue (estáticas). Si este nginx cae, la API cae con él: no hay dependencia extra.
location ^~ /mail-templates/ {
    root /var/www/vhosts/padelmedina.com/api.padelmedina.com;
    default_type text/html;
}

# Sonda externa sin apikey (UptimeRobot). Kong exige apikey en /auth/v1: se la ponemos aquí.
location = /healthz {
    proxy_pass http://127.0.0.1:8000/auth/v1/health;
    proxy_set_header Host \$host;
    proxy_set_header apikey "${ANON_KEY}";
}

# send-reminders solo desde el propio servidor (el cron llama a 127.0.0.1:8000 directamente; esto cierra la puerta pública)
location = /functions/v1/send-reminders { return 403; }

location ^~ /auth/v1/ {
    limit_req zone=padelauth burst=20 nodelay;
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 60s;
}

location ^~ /rest/v1/     { include /etc/nginx/padel-api-proxy.inc; }
location ^~ /storage/v1/  { include /etc/nginx/padel-api-proxy.inc; }
location ^~ /functions/v1/ {
    include /etc/nginx/padel-api-proxy.inc;
    proxy_read_timeout 300s;      # send-bracket-published tarda 3 s por cada 5 correos
}

location ^~ /realtime/v1/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
EOF

cat > /etc/nginx/padel-api-proxy.inc <<'EOF'
limit_req zone=padelapi burst=60 nodelay;
proxy_pass http://127.0.0.1:8000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header Connection "";
proxy_buffering off;
proxy_read_timeout 120s;
EOF

plesk sbin httpdmng --reconfigure-domain api.padelmedina.com && nginx -t && systemctl reload nginx
```

El docroot `/var/www/vhosts/padelmedina.com/api.padelmedina.com/` queda vacío salvo `mail-templates/`: cualquier ruta no listada la sirve Plesk desde ahí → 404. Studio, `/pg`, `/analytics` nunca salen.

Notas: `proxy_buffering off` en `/functions/v1/` hace falta para respuestas largas; `Connection ""` mantiene keepalive con Kong. La cabecera `Date` para `serverTime.js` se expone en Kong (§4.5), no aquí, para que valga en todas las rutas de auth.

### 3.4 Firewall

Nada que abrir: Kong escucha en `127.0.0.1:8000`, la BD no publica puerto. Comprobar que la extensión Plesk Firewall (si está) no tiene reglas para 8000/3000 y que Docker puede crear `docker0` (172.17.0.0/16) sin chocar con la red del VPS: `ip route | grep 172.17`. Los servidores de Redsys deben poder hacer POST a `api.padelmedina.com:443`: no filtrar por país ni añadir jails de fail2ban sobre `/functions/v1/redsys-*`.

### 3.5 Staging (frontend estático, temporal)

`staging.padelmedina.com` sirve un build del frontend con `VITE_SUPABASE_URL=https://api.padelmedina.com` y el ANON JWT nuevo, subido por SFTP (§7.4). Comparte el stack y, durante el corte, los **datos de producción restaurados**: por eso se borra en D+1 (no puede quedar como segunda puerta a producción).

---

## 4. Despliegue del backend (`/opt/supabase`)

### 4.1 Obtener el compose oficial y recortarlo

```bash
cd /opt/supabase
git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git /tmp/sb && (cd /tmp/sb && git sparse-checkout set docker)
cp -r /tmp/sb/docker/volumes /opt/supabase/ && cp /tmp/sb/docker/.env.example /opt/supabase/.env.example.oficial
mkdir -p /opt/supabase/{bin,volumes/functions,volumes/storage,volumes/db/data}
```
Se conserva `volumes/db/*.sql` (roles, jwt, realtime, webhooks: los scripts de init de la imagen), `volumes/api/kong.yml` y `volumes/functions/main/`. El `docker-compose.yml` se sustituye por el de §4.2 (misma estructura que el oficial del día del clonado, sin `analytics`, `vector`, `imgproxy`, `supavisor`). Si `docker compose config -q` protesta por una variable, prevalece `.env.example.oficial`.

### 4.2 `docker-compose.yml` (completo)

```yaml
name: supabase

x-limits-small: &limits-small
  deploy: { resources: { limits: { memory: 256m } } }

services:

  db:
    container_name: supabase-db
    image: supabase/postgres:17.6.1.084      # misma versión que cloud (supabase/.temp/postgres-version). Si el tag exacto no existe: el 17.6.1.x inmediatamente superior (docker manifest inspect)
    restart: unless-stopped
    deploy: { resources: { limits: { memory: 1g } } }
    volumes:
      - ./volumes/db/realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:Z
      - ./volumes/db/webhooks.sql:/docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql:Z
      - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z
      - ./volumes/db/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:Z
      - ./volumes/db/_supabase.sql:/docker-entrypoint-initdb.d/migrations/97-_supabase.sql:Z
      - ./volumes/db/data:/var/lib/postgresql/data:Z
      - db-config:/etc/postgresql-custom
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 10
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: ${POSTGRES_PORT}
      POSTGRES_PORT: ${POSTGRES_PORT}
      PGPASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: ${POSTGRES_DB}
      POSTGRES_DB: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXPIRY}
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - log_min_messages=warning
      - -c
      - shared_buffers=256MB
      - -c
      - effective_cache_size=768MB
      - -c
      - work_mem=8MB
      - -c
      - max_connections=60

  kong:
    container_name: supabase-kong
    image: kong:2.8.1
    restart: unless-stopped
    deploy: { resources: { limits: { memory: 512m } } }
    ports:
      - "127.0.0.1:${KONG_HTTP_PORT}:8000/tcp"
    volumes:
      - ./volumes/api/kong.yml:/home/kong/temp.yml:ro,z
    depends_on:
      db: { condition: service_healthy }
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /home/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      DASHBOARD_USERNAME: ${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: ${DASHBOARD_PASSWORD}
    entrypoint: bash -c 'eval "echo \"$$(cat ~/temp.yml)\"" > ~/kong.yml && /docker-entrypoint.sh kong docker-start'

  auth:
    container_name: supabase-auth
    image: supabase/gotrue:v2.188.1          # EXACTA a cloud (supabase/.temp/gotrue-version). Actualizar después, por separado.
    restart: unless-stopped
    <<: *limits-small
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999/health"]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      db: { condition: service_healthy }
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: ${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: ${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: ${ENABLE_ANONYMOUS_USERS}
      GOTRUE_MAILER_AUTOCONFIRM: ${ENABLE_EMAIL_AUTOCONFIRM}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}
      GOTRUE_SMTP_MAX_FREQUENCY: 1m0s
      GOTRUE_MAILER_URLPATHS_INVITE: ${MAILER_URLPATHS_INVITE}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: ${MAILER_URLPATHS_CONFIRMATION}
      GOTRUE_MAILER_URLPATHS_RECOVERY: ${MAILER_URLPATHS_RECOVERY}
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: ${MAILER_URLPATHS_EMAIL_CHANGE}
      GOTRUE_EXTERNAL_PHONE_ENABLED: ${ENABLE_PHONE_SIGNUP}
      GOTRUE_SMS_AUTOCONFIRM: ${ENABLE_PHONE_AUTOCONFIRM}
      # ---- Padel Medina: lo que el compose oficial no expone ----
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_CLIENT_SECRET}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback
      GOTRUE_MAILER_OTP_LENGTH: "6"
      GOTRUE_MAILER_OTP_EXP: "3600"
      GOTRUE_PASSWORD_MIN_LENGTH: "6"
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "60"
      GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION: "false"
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: ${API_EXTERNAL_URL}/mail-templates/confirmation.html
      GOTRUE_MAILER_TEMPLATES_RECOVERY: ${API_EXTERNAL_URL}/mail-templates/recovery.html
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: ${API_EXTERNAL_URL}/mail-templates/magic-link.html
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: ${API_EXTERNAL_URL}/mail-templates/email-change.html
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: ${MAIL_SUBJECT_CONFIRMATION}
      GOTRUE_MAILER_SUBJECTS_RECOVERY: ${MAIL_SUBJECT_RECOVERY}
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: ${MAIL_SUBJECT_MAGIC_LINK}
      GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: ${MAIL_SUBJECT_EMAIL_CHANGE}

  rest:
    container_name: supabase-rest
    image: postgrest/postgrest:v14.4          # >= cloud (supabase/.temp/rest-version v14.4); usar el tag v14.x más cercano disponible
    restart: unless-stopped
    <<: *limits-small
    depends_on:
      db: { condition: service_healthy }
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      PGRST_DB_SCHEMAS: ${PGRST_DB_SCHEMAS}
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: ${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: ${JWT_EXPIRY}
    command: ["postgrest"]

  realtime:
    container_name: realtime-dev.supabase-realtime
    image: supabase/realtime:v2.34.47        # la del compose oficial del día del clonado
    restart: unless-stopped
    deploy: { resources: { limits: { memory: 512m } } }
    depends_on:
      db: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "curl", "-sSfL", "--head", "-o", "/dev/null", "-H", "Authorization: Bearer ${ANON_KEY}", "http://localhost:4000/api/tenants/realtime-dev/health"]
      timeout: 5s
      interval: 5s
      retries: 3
    environment:
      PORT: 4000
      DB_HOST: ${POSTGRES_HOST}
      DB_PORT: ${POSTGRES_PORT}
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: ${POSTGRES_DB}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: ${JWT_SECRET}
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "10000"
      APP_NAME: realtime
      SEED_SELF_HOST: true
      RUN_JANITOR: true

  storage:
    container_name: supabase-storage
    image: supabase/storage-api:v1.37.7      # EXACTA a cloud (supabase/.temp/storage-version)
    restart: unless-stopped
    <<: *limits-small
    volumes:
      - ./volumes/storage:/var/lib/storage:z
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://storage:5000/status"]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      db: { condition: service_healthy }
      rest: { condition: service_started }
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      FILE_SIZE_LIMIT: 10485760
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub
      ENABLE_IMAGE_TRANSFORMATION: "false"   # sin imgproxy

  functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.67.4     # la del compose oficial del día del clonado
    restart: unless-stopped
    deploy: { resources: { limits: { memory: 768m } } }
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
      - functions-cache:/var/cache/deno       # DENO_DIR persistente: sin esto cada reinicio vuelve a bajar esm.sh/deno.land/npm
    depends_on:
      kong: { condition: service_started }
    env_file: ./functions.env
    environment:
      JWT_SECRET: ${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"
      DENO_DIR: /var/cache/deno
    command: ["start", "--main-service", "/home/deno/functions/main"]

  meta:
    container_name: supabase-meta
    image: supabase/postgres-meta:v0.89.3
    restart: unless-stopped
    profiles: ["tools"]
    <<: *limits-small
    depends_on:
      db: { condition: service_healthy }
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: ${POSTGRES_HOST}
      PG_META_DB_PORT: ${POSTGRES_PORT}
      PG_META_DB_NAME: ${POSTGRES_DB}
      PG_META_DB_USER: supabase_admin
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}
      PG_META_CRYPTO_KEY: ${PG_META_CRYPTO_KEY}

  studio:
    container_name: supabase-studio
    image: supabase/studio:2025.06.30-sha-6f5982d
    restart: unless-stopped
    profiles: ["tools"]
    deploy: { resources: { limits: { memory: 512m } } }
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      meta: { condition: service_started }
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DEFAULT_ORGANIZATION_NAME: ${STUDIO_DEFAULT_ORGANIZATION}
      DEFAULT_PROJECT_NAME: ${STUDIO_DEFAULT_PROJECT}
      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: ${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      AUTH_JWT_SECRET: ${JWT_SECRET}
      NEXT_PUBLIC_ENABLE_LOGS: "false"

volumes:
  db-config:
  functions-cache:
```

Validar: `docker compose config -q`. Si al clonar el compose oficial ha cambiado alguna variable/servicio (`realtime`, `edge-runtime`, `postgres-meta`, `studio` cambian de tag a menudo), copiar los tags del oficial; **gotrue y storage-api se mantienen pineados a v2.188.1 y v1.37.7** hasta después del corte.

### 4.3 `/opt/supabase/.env` (chmod 600; nunca al repo)

```bash
cd /opt/supabase
gen() { openssl rand -hex "$1"; }
JWT_SECRET=$(gen 32)
cat > gen-keys.js <<'EOF'
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const s=process.argv[2],iat=Math.floor(Date.now()/1e3),exp=iat+10*365*86400;
const sign=p=>{const h=b({alg:'HS256',typ:'JWT'}),q=b(p);return h+'.'+q+'.'+c.createHmac('sha256',s).update(h+'.'+q).digest('base64url')};
console.log('ANON_KEY='+sign({iss:'supabase',ref:'padelmedina',role:'anon',iat,exp}));
console.log('SERVICE_ROLE_KEY='+sign({iss:'supabase',ref:'padelmedina',role:'service_role',iat,exp}));
EOF
# Node no está en el servidor: ejecutar gen-keys.js en el PC (node gen-keys.js "$JWT_SECRET") o con docker run --rm -v $PWD:/w node:22-alpine node /w/gen-keys.js "$JWT_SECRET"
docker run --rm -v "$PWD":/w node:22-alpine node /w/gen-keys.js "$JWT_SECRET" > keys.txt
```

```ini
############ Secrets ############
POSTGRES_PASSWORD=<openssl rand -hex 24>
JWT_SECRET=<el generado arriba, >= 32 chars; compartido por GoTrue/PostgREST/Storage/Realtime/functions>
ANON_KEY=<de keys.txt>
SERVICE_ROLE_KEY=<de keys.txt>
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<openssl rand -hex 16>
SECRET_KEY_BASE=<openssl rand -hex 32>
VAULT_ENC_KEY=<openssl rand -hex 16>       # exactamente 32 chars
PG_META_CRYPTO_KEY=<openssl rand -hex 16>
GOOGLE_CLIENT_ID=<del Dashboard cloud / Google Console>
GOOGLE_CLIENT_SECRET=<Google Console; si no se conoce, crear uno nuevo en el mismo cliente OAuth>

############ Database ############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############ API / URLs ############
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
API_EXTERNAL_URL=https://api.padelmedina.com
SUPABASE_PUBLIC_URL=https://api.padelmedina.com
SITE_URL=https://padelmedina.com
ADDITIONAL_REDIRECT_URLS=https://padelmedina.com/**,https://www.padelmedina.com/**,https://staging.padelmedina.com/**,http://localhost:5173/**
PGRST_DB_SCHEMAS=public,graphql_public      # SIN storage: no exponer ese esquema por REST

############ Auth ############
JWT_EXPIRY=3600
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false              # la app exige email_confirmed_at y usa OTP
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
MAIL_SUBJECT_CONFIRMATION=Tu código de acceso a Padel Medina
MAIL_SUBJECT_RECOVERY=Restablecer tu contraseña de Padel Medina
MAIL_SUBJECT_MAGIC_LINK=Tu enlace de acceso a Padel Medina
MAIL_SUBJECT_EMAIL_CHANGE=Confirma tu nuevo email en Padel Medina

############ SMTP (Resend) ############
SMTP_ADMIN_EMAIL=acceso@padelmedina.com     # remitente en el dominio verificado en Resend
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<RESEND_API_KEY>
SMTP_SENDER_NAME=Padel Medina

############ Functions ############
FUNCTIONS_VERIFY_JWT=true                   # con el mapa por función de §6.2 (las públicas se excluyen en main/index.ts)

############ Studio (perfil tools) ############
STUDIO_DEFAULT_ORGANIZATION=Padel Medina
STUDIO_DEFAULT_PROJECT=Padel Medina
```

`chmod 600 .env keys.txt && shred -u keys.txt gen-keys.js` tras copiar los valores.

### 4.4 `/opt/supabase/functions.env` (chmod 600)

```ini
RESEND_API_KEY=re_...
REDSYS_MERCHANT_CODE=...
REDSYS_TERMINAL=1
REDSYS_SECRET_KEY=...
VAPID_PUBLIC_KEY=BPkGxuT7mSIsUrU2X2rOuyRWZCSBZorYr5ZfIaMmrmdQrXTQRAEX15k9v3JQ4Zfcad5Oq13Q5ThPRkCVcgPKAgU
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=admin@padelmedina.com
APP_URL=https://padelmedina.com
ADMIN_NOTIFY_EMAIL=padelmedina@hotmail.com
CLUB_NOTIFY_EMAIL=padelmedina@hotmail.com
REGISTRATION_NOTIFY_SECRET=<openssl rand -hex 24; el MISMO valor va a private.app_config>
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` y `JWT_SECRET` los inyecta el compose. NO copiar `STRIPE_*`, `SHOP_NOTIFY_EMAIL`, `REDSYS_URL`.

### 4.5 `volumes/api/kong.yml`: exponer `Date`

`src/utils/serverTime.js` lee la cabecera `Date` de `GET /auth/v1/health`; no es CORS-safelisted, así que sin esto la app cae en silencio al reloj del dispositivo. En `kong.yml`, en el servicio `auth-v1` (y en `auth-v1-open*` no hace falta), dentro de `plugins: - name: cors` añadir:

```yaml
      - name: cors
        config:
          exposed_headers: ["Date"]
```
(Si el bloque `cors` no tiene `config`, crearlo.) Verificación tras arrancar: `curl -sI -H "apikey: $ANON_KEY" https://api.padelmedina.com/auth/v1/health | grep -i 'access-control-expose-headers'` debe incluir `Date`.

Kong NO exige `apikey` en `/functions/v1/*` ni en `/storage/v1/object/public/*` (rutas `functions-v1` y `storage-v1` solo llevan `cors`): por eso Redsys y las `<img>` de pósters funcionan sin cambios.

### 4.6 Plantillas de correo (GoTrue)

Exportadas del Dashboard cloud (Auth → Email Templates) a `/var/www/vhosts/padelmedina.com/api.padelmedina.com/mail-templates/{confirmation,recovery,magic-link,email-change}.html` (y versionadas en el repo en `deploy/mail-templates/`). Comprobación obligatoria:

```bash
grep -l '{{ \.Token }}' /var/www/vhosts/padelmedina.com/api.padelmedina.com/mail-templates/confirmation.html   # la app pide el código de 6 dígitos
grep -l '{{ \.ConfirmationURL }}' /var/www/vhosts/padelmedina.com/api.padelmedina.com/mail-templates/recovery.html
curl -s https://api.padelmedina.com/mail-templates/confirmation.html | grep -c Token
```
GoTrue solo acepta plantillas por URL http(s). Si no puede descargarlas usa la suya por defecto (que en *confirmation* también incluye `{{ .Token }}` en versiones recientes, pero no queremos depender de eso): `healthcheck.sh` (§9.3) vigila que la URL responda 200 y contenga `Token`.

### 4.7 Funciones al volumen y primer arranque

```bash
# Clon de solo lectura del repo en el servidor (deploy key en GitHub > Settings > Deploy keys)
git clone git@github.com:Currito690/proyecto-padel-medina.git /opt/padel/repo
rsync -a --delete --exclude main --exclude create-payment-intent --exclude stripe-webhook --exclude debug-bookings \
  /opt/padel/repo/supabase/functions/ /opt/supabase/volumes/functions/
# main/index.ts parcheado según §6.2 (verify_jwt por función, workerTimeoutMs, memoryLimitMb)
cd /opt/supabase && docker compose up -d && sleep 30 && docker compose ps
```
Todo debe estar `healthy`/`running`. En este primer arranque GoTrue y storage-api ejecutan sus migraciones y crean los esquemas `auth` y `storage`: **eso tiene que ocurrir antes de restaurar datos** (§5).

Comprobación de `DENO_DIR`: tras invocar una función (`curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8000/functions/v1/redsys-redirect`), `docker compose exec functions ls /var/cache/deno` debe mostrar `deps/`, `npm/` o similar. Si está vacío, edge-runtime cachea en otra ruta: `docker compose exec functions sh -c 'find / -type d -name deps -path "*deno*" 2>/dev/null'` y remontar el volumen ahí.

---

## 5. Migración de datos

### 5.1 Reanimar el cloud y diagnosticar el `DatabaseTimeout`

1. Dashboard → Settings → General → **Restart project**. Si no vuelve: ticket a soporte (indicar "DatabaseTimeout, necesitamos un pg_dump completo"). Si el plan es Pro, descargar además el backup diario del panel (Database → Backups).
2. En cuanto responda, mirar lo que en un proyecto pequeño suele colgarlo (cloud SQL editor):
   ```sql
   select count(*) from net._http_response;          -- pg_net guarda cada respuesta del cron */30 y del trigger
   select count(*) from net.http_request_queue;
   select jobid, schedule, command, active from cron.job;
   select pid, now()-query_start as dur, state, left(query,80) from pg_stat_activity where state <> 'idle' order by dur desc limit 10;
   ```
   Si `_http_response` tiene decenas de miles de filas: `delete from net._http_response;`. **El `cron.unschedule` se hace en la congelación del corte (§8.3), no antes**: si se quita días antes, los clientes se quedan sin recordatorios de reserva.

### 5.2 Exportar desde el cloud (ejecutar desde el propio Plesk, cliente 17, el MISMO día que responda)

El VPS es IPv4: usar el **pooler en modo sesión, puerto 5432** (`supabase/.temp/pooler-url`); el host directo `db.<ref>.supabase.co` es solo IPv6.

```bash
export OLD="postgresql://postgres.iquibawtbpamhaottlbr:<DB_PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
D=/root/migracion/$(date +%F); mkdir -p $D/posters && cd $D
psql "$OLD" -Atc "select now()" > T_DUMP.txt

# 1) Esquema public completo (tablas, funciones, triggers, políticas, índices, grants de columna, secuencias). Sin --no-owner: los objetos quedan en 'postgres' como en cloud y el rol existe en la imagen.
pg_dump "$OLD" --schema=public --schema-only -f 01_public_schema.sql
# 2) Datos de public
pg_dump "$OLD" --schema=public --data-only -f 02_public_data.sql
# 3) Auth: SOLO datos, SOLO usuarios e identidades (hashes bcrypt + Google). Sesiones/refresh tokens no sirven al cambiar de host.
pg_dump "$OLD" --data-only --table=auth.users --table=auth.identities -f 03_auth_data.sql
# 4) Fila del bucket (sin objetos: se resuben por API)
pg_dump "$OLD" --data-only --table=storage.buckets -f 04_storage_buckets.sql
# 5) Archivo completo por si acaso (puede protestar por esquemas internos: se excluyen)
pg_dump "$OLD" -Fc -f 99_full.dump --exclude-schema=_analytics --exclude-schema=_realtime --exclude-schema=supabase_functions --exclude-schema=pgsodium --exclude-schema=vault --exclude-schema=cron --exclude-schema=net || true
# 6) Estado que pg_dump --schema=public NO trae
psql "$OLD" -c "select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal" > trigger_auth_users.txt
psql "$OLD" -c "select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='storage'" > storage_policies.txt
psql "$OLD" -c "select jobid, schedule, command, active from cron.job" > cron_job.txt
psql "$OLD" -c "select name, decrypted_secret from vault.decrypted_secrets" > vault.txt
psql "$OLD" -c "select * from pg_publication_tables where pubname='supabase_realtime'" > publication.txt
psql "$OLD" -c "select extname, extversion, extnamespace::regnamespace from pg_extension order by 1" > extensions.txt
psql "$OLD" -c "select id, name, bucket_id, metadata->>'mimetype' from storage.objects where bucket_id='event-posters'" > storage_objects.txt
psql "$OLD" -c "select id, poster_url from public.events where poster_url is not null" > posters.txt
psql "$OLD" -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public' order by 1" > functions.txt
# 7) Conteos de referencia
psql "$OLD" -c "select 'users',count(*) from auth.users union all select 'identities',count(*) from auth.identities union all select 'profiles',count(*) from profiles union all select 'bookings',count(*) from bookings union all select 'regs',count(*) from tournament_registrations union all select 'fichajes',count(*) from fichajes union all select 'events',count(*) from events union all select 'push',count(*) from push_subscriptions union all select 'tokens',count(*) from shared_payment_tokens" > counts.txt
# 8) Pósters (bucket público): descarga directa
grep -o 'https://[^ |]*event-posters/[^ |]*' posters.txt | sort -u | xargs -r -n1 -P4 wget -q -P posters/
ls posters | wc -l; sha256sum *.sql *.dump > SHA256SUMS
# 9) Copia fuera del servidor (nunca en OneDrive sincronizado con el repo)
tar czf /root/migracion/cloud-$(date +%F).tgz -C /root/migracion $(date +%F) && rclone copy /root/migracion/cloud-$(date +%F).tgz remote:padel-backups/migracion/
```

**Diff obligatorio** (`01_public_schema.sql` frente al repo), anotar en `docs/DRIFT.md`: `profiles.phone`, `site_settings.slots_release_time`, `bookings.share_links`, `increment_split_paid`, CHECK real de `profiles.role`, cómo está realmente la política `Admins ven todos los perfiles`, cuerpo real de `handle_new_user`, esquema de `pg_net`, `verify_jwt` real de las funciones (`npx supabase functions list --project-ref iquibawtbpamhaottlbr`).

Limpiezas del `.sql` que suelen hacer falta (hacerlas con `sed` en una copia `01_public_schema.clean.sql` y dejar el original intacto): `GRANT ... TO supabase_read_only_user` u otros roles que no existan en la imagen (`docker compose exec db psql -U supabase_admin -c '\du'`), y cualquier `CREATE EXTENSION` (se hace en el paso 0 de `restore.sh`).

### 5.3 `/opt/supabase/bin/restore.sh` (se ensaya en el PC y en el servidor; el día D se ejecuta idéntico)

```bash
#!/bin/bash
# Uso: restore.sh <dir con 01_public_schema.clean.sql 02_public_data.sql 03_auth_data.sql 04_storage_buckets.sql posters/>
# Restaura en un stack RECIÉN arrancado (auth/storage ya migrados por GoTrue/storage-api). Idempotente solo sobre stack limpio.
set -euo pipefail
SRC="${1:?dir de dumps}"; cd /opt/supabase; set -a; . ./.env; set +a
P() { docker compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }
echo "== 0) extensiones"
P -c "create extension if not exists pgcrypto with schema extensions; create extension if not exists pg_net with schema extensions;"
echo "== 1) auth: solo datos, sin triggers ni FKs (aún no existe handle_new_user)"
P --single-transaction -c "set session_replication_role = replica" -f - < "$SRC/03_auth_data.sql"
echo "== 2) bucket"
P --single-transaction -c "set session_replication_role = replica" -f - < "$SRC/04_storage_buckets.sql"
echo "== 3) esquema public (pg_dump ya ordena: is_admin/norm_nombre_inscripcion antes que índices y políticas)"
P --single-transaction -f - < "$SRC/01_public_schema.clean.sql"
echo "== 4) datos public en modo replica (no dispara notify_admin ni los triggers con auth.role())"
P --single-transaction -c "set session_replication_role = replica" -f - < "$SRC/02_public_data.sql"
echo "== 5) trigger en auth.users (no viene en --schema=public)"
P -c "drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();"
echo "== 6) fixups self-host (private.app_config, trigger reescrito, bucket+políticas storage, publicación realtime)"
P -v anon_key="$ANON_KEY" -v notify_secret="$(grep ^REGISTRATION_NOTIFY_SECRET= functions.env | cut -d= -f2-)" -f - < /opt/padel/repo/supabase/migrations/20260910100000_selfhost.sql
echo "== 7) URLs de pósters"
P -c "update public.events set poster_url = replace(poster_url, 'https://iquibawtbpamhaottlbr.supabase.co', 'https://api.padelmedina.com') where poster_url like 'https://iquibawtbpamhaottlbr.supabase.co%';"
echo "== 8) pósters por API (storage-api registra fila + ruta versionada; copiar ficheros a mano NO sirve)"
for f in "$SRC"/posters/*; do [ -e "$f" ] || continue; n=$(basename "$f")
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8000/storage/v1/object/event-posters/$n" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -H "Content-Type: $(file -b --mime-type "$f")" -H "x-upsert: true" --data-binary @"$f")
  echo "  $n -> $code"; done
echo "== 9) recargar esquemas en los servicios"
P -c "notify pgrst, 'reload schema'"
docker compose restart rest realtime functions
sleep 15; /opt/supabase/bin/warmup.sh
echo "== 10) verificación"
P -c "select 'users',count(*) from auth.users union all select 'identities',count(*) from auth.identities union all select 'profiles',count(*) from profiles union all select 'bookings',count(*) from bookings union all select 'regs',count(*) from tournament_registrations union all select 'fichajes',count(*) from fichajes union all select 'events',count(*) from events union all select 'push',count(*) from push_subscriptions union all select 'tokens',count(*) from shared_payment_tokens"
P -c "select count(*) as policies_public from pg_policies where schemaname='public'"
P -c "select * from pg_publication_tables where pubname='supabase_realtime'"
P -c "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal"
P -c "\dp public.fichajes" | grep -q 'authenticated=w(fichado_at)' && echo "grant de columna OK"
P -c "select count(*) from storage.objects where bucket_id='event-posters'"
echo "Comparar con $SRC/counts.txt"
```

Errores esperables y tratamiento: si el paso 3 aborta, `--single-transaction` deja la BD limpia: corregir el `.clean.sql` y repetir desde el paso 3. `store_order_seq` restaura (se borra en la limpieza post-corte). Secuencias: no hay `setval` que cuidar (todo es uuid; `site_settings.id=1` fijo). Si `03_auth_data.sql` falla por una columna inexistente, la versión de GoTrue no es la del cloud: comprobar el tag.

### 5.4 Ensayo (obligatorio, en el PC con Docker Desktop y en el servidor con datos de D-8)

Mismo compose, mismo `restore.sh`, con el dump real. Se repite hasta que pase limpio de principio a fin, anotando el tiempo (esperado 5-15 min). `npm run dev` con `.env` apuntando a `http://localhost:8000` valida login antiguo, OTP nuevo (SMTP Resend real), recovery, Google (añadir temporalmente `http://localhost:8000/auth/v1/callback` en Google Console), Realtime, Storage y la cadena inscripción → trigger → pg_net → email al club.

### 5.5 Migración de fixups `supabase/migrations/20260910100000_selfhost.sql`

Se ejecuta con `psql -v anon_key=... -v notify_secret=...` (variables psql). Contenido:

```sql
-- Self-host (Plesk): sustituye Vault + URL/JWT cloud literales por una tabla privada; recrea bucket, políticas de storage y publicación realtime.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_config (key text primary key, value text not null, updated_at timestamptz not null default now());
revoke all on private.app_config from public, anon, authenticated;
insert into private.app_config (key, value) values
  ('functions_url', 'http://kong:8000/functions/v1'),
  ('functions_bearer', :'anon_key'),
  ('registration_notify_secret', :'notify_secret'),
  ('registrations_url', 'https://padelmedina.com/admin')
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.notify_admin_on_new_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; tournament_name text; fee_txt text; fee_total numeric := 0; amount_out numeric; req_headers jsonb; payload jsonb;
begin
  select jsonb_object_agg(key, value) into cfg from private.app_config;
  select coalesce(name, 'Torneo'), config ->> 'registrationFeeAmount' into tournament_name, fee_txt
  from public.tournaments where id = new.tournament_id;
  if fee_txt is not null and fee_txt ~ '^\d+([.]\d+)?$' then fee_total := (fee_txt::numeric) * 2; end if;
  amount_out := new.amount_paid;
  if amount_out is null and coalesce(new.payment_status, 'not_required') <> 'not_required' and fee_total > 0 then amount_out := fee_total; end if;
  payload := jsonb_build_object(
    'tournamentName', coalesce(tournament_name, 'Torneo'), 'category', new.category,
    'player1Name', new.player1_name, 'player2Name', new.player2_name,
    'player1Email', new.player1_email, 'player2Email', new.player2_email,
    'player1Phone', new.player1_phone, 'player2Phone', new.player2_phone,
    'player1ShirtSize', new.player1_shirt_size, 'player2ShirtSize', new.player2_shirt_size,
    'paymentStatus', new.payment_status, 'paymentMethod', new.payment_method,
    'amount', amount_out, 'registrationsUrl', coalesce(cfg->>'registrations_url', 'https://padelmedina.com/admin'));
  req_headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (cfg->>'functions_bearer'));
  if coalesce(cfg->>'registration_notify_secret', '') <> '' then
    req_headers := req_headers || jsonb_build_object('x-notify-secret', cfg->>'registration_notify_secret');
  end if;
  perform net.http_post(url := (cfg->>'functions_url') || '/send-registration-admin-notify', headers := req_headers, body := payload);
  return new;
exception when others then
  raise warning 'notify_admin_on_new_registration: %', sqlerrm;  -- nunca romper el INSERT de una inscripción
  return new;
end $$;
-- el trigger ya existe (viene en el dump); si no: create trigger trg_notify_admin_on_new_registration after insert on public.tournament_registrations for each row execute function public.notify_admin_on_new_registration();

-- Storage: bucket y 4 políticas (pg_dump --schema=public no las trae). Copiado de 20260420090000_events.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 5242880, array['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public can view event posters') then
    create policy "Public can view event posters" on storage.objects for select using (bucket_id = 'event-posters'); end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Auth can upload event posters') then
    create policy "Auth can upload event posters" on storage.objects for insert with check (bucket_id = 'event-posters' and auth.role() = 'authenticated'); end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Auth can update event posters') then
    create policy "Auth can update event posters" on storage.objects for update using (bucket_id = 'event-posters' and auth.role() = 'authenticated'); end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Auth can delete event posters') then
    create policy "Auth can delete event posters" on storage.objects for delete using (bucket_id = 'event-posters' and auth.role() = 'authenticated'); end if;
end $$;

-- Realtime
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='bookings') then
    alter publication supabase_realtime add table public.bookings; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='tournament_registrations') then
    alter publication supabase_realtime add table public.tournament_registrations; end if;
end $$;
analyze;
```

Deliberadamente NO incluye cambios funcionales (endurecer `handle_new_user`, cerrar `shared_payment_tokens`, borrar `store_order_seq`/`tienda_activa`/`bookings_unique_confirmed`, políticas legacy de `tournaments`): van en `20260925100000_limpieza_post_selfhost.sql`, la semana siguiente al corte (§10.2).

### 5.6 Storage

Los ficheros se resuben por API en el paso 8 de `restore.sh` (storage-api v1.37 guarda rutas versionadas y filas en `storage.objects`; copiar al volumen no los registra). Verificación: `curl -sI https://api.padelmedina.com/storage/v1/object/public/event-posters/<uno>.jpg` → 200 y `select count(*) from storage.objects` = `storage_objects.txt`.

---

## 6. Funciones

### 6.1 Runtime: edge-runtime (recomendado), plan B Node

Las 12 funciones usan `Deno.serve`/std, `esm.sh` (supabase-js, crypto-js) y `npm:web-push`: todo soportado por `supabase/edge-runtime`, el mismo runtime del cloud. Cero cambios de código para funcionar; el frontend sigue con `supabase.functions.invoke` y Redsys sigue recibiendo en `/functions/v1/*`. Mitigaciones a su inmadurez: límite de memoria, `DENO_DIR` persistente, warm-up tras cada arranque, imports pineados, healthcheck que reinicia.

**Plan B** (si edge-runtime se vuelve inestable): contenedor Node/Express con las mismas rutas (`/send-push`, `/redsys-notify`, …), y en `volumes/api/kong.yml` cambiar el `url` del servicio `functions-v1` a ese contenedor; o robar rutas una a una desde nginx con `location = /functions/v1/<nombre> { proxy_pass http://127.0.0.1:3100; }`. Nadie fuera se entera. Coste: 2-3 días; si se porta la firma Redsys, validarla byte a byte contra la Deno con el mismo pedido antes de activarla.

### 6.2 `volumes/functions/main/index.ts`: mapa `verify_jwt` por función, timeouts

edge-runtime self-host solo trae un flag global. Se reproduce el comportamiento del cloud (config.toml + valor por defecto `true`) con un conjunto de funciones públicas:

```ts
// Parche sobre el main/index.ts del compose oficial
const PUBLIC_FUNCTIONS = new Set([
  'redsys-create', 'redsys-notify', 'redsys-notify-split', 'redsys-redirect', 'admin-update-user',
  // 'send-booking-email' era pública en cloud; ahora se autoriza dentro (§6.3) y MyBookings.jsx manda sesión: NO va aquí
]);
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const service_name = url.pathname.split('/')[1];         // Kong hace strip_path de /functions/v1
  if (req.method !== 'OPTIONS' && VERIFY_JWT && !PUBLIC_FUNCTIONS.has(service_name)) {
    try {
      const token = getAuthToken(req);
      if (!(await verifyJWT(token))) return new Response(JSON.stringify({ msg: 'Invalid JWT' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    } catch (e) { return new Response(JSON.stringify({ msg: e.toString() }), { status: 401, headers: { 'Content-Type': 'application/json' } }); }
  }
  ...
  const memoryLimitMb = 256;                 // antes 150
  const workerTimeoutMs = 5 * 60 * 1000;     // antes 60 s: send-bracket-published tarda 3 s por cada 5 correos
  const cpuTimeSoftLimitMs = 30000, cpuTimeHardLimitMs = 60000;
  ...
});
```
(`getAuthToken`/`verifyJWT` ya existen en el fichero oficial y usan `JWT_SECRET`.) El anon JWT satisface la verificación como en cloud; la autorización real la hace cada función.

### 6.3 Qué pasa con cada función

| Función | Cambio | Detalle |
|---|---|---|
| **redsys-create** | ninguno | Recibe `successUrl/failUrl/notifyUrl` del cliente (construidas desde `VITE_SUPABASE_URL`). Deuda: allowlist de dominio (post-corte). |
| **redsys-notify** | 1 línea | `index.ts:354`: `Deno.env.get('APP_URL') || 'https://padelmedina.com'` (hoy `padelmedina.vercel.app`). Fan-out a `${SUPABASE_URL}/functions/v1/send-push` y `send-booking-email` → `http://kong:8000` internamente, con service role. Ya es idempotente (`index.ts:279` reserva confirmada, `:205` inscripción pagada). |
| **redsys-notify-split** | ninguno | `increment_split_paid`: si no aparece en `functions.txt`, el fallback manual ya es el camino. |
| **redsys-redirect** | ninguno | Fallback `https://padelmedina.com/mis-reservas`. Deuda: allowlist de `to`. |
| **send-booking-email** | **obligatorio** | Añadir al principio un `callerAutorizado` que acepte service role **o cualquier sesión válida** (`GET /auth/v1/user` con el token) y rechace el anon key/sin token. Hoy es un relay de correo abierto: si se abusa, Resend degrada el dominio y dejan de llegar los OTP (= nadie puede registrarse). |
| **send-push** | **obligatorio** | Mismo `callerAutorizado` que arriba (service role o sesión válida, cualquier rol: PaymentGateway y MyBookings lo llaman como cliente). Hoy no comprueba nada: cualquiera con el anon key manda push a los admins. |
| **send-reminders** | ninguno | Disparada por cron del host (§6.4); nginx devuelve 403 a la ruta pública. |
| **delete-user** | **obligatorio** | Copiar `callerAutorizado` de `send-tournament-confirmation/index.ts:26-50` (solo admin o service role) y llamarlo antes de leer el body; borrar la línea `await del('tournament_registrations', 'user_id');` (columna inexistente). |
| **admin-update-user** | ninguno | Ya se autoriza (`GET /auth/v1/user` + `profiles.role`). |
| **send-tournament-confirmation**, **send-bracket-published** | ninguno | Ya se autorizan; `workerTimeoutMs` subido. |
| **send-registration-admin-notify** | ninguno | `REGISTRATION_NOTIFY_SECRET` en `functions.env` = `private.app_config`. Llamada por pg_net desde el contenedor `db` a `http://kong:8000` con el anon JWT nuevo. |
| create-payment-intent, stripe-webhook, debug-bookings, shop-* | borrar | Directorios y bloques de `config.toml`. |

Parche tipo (`send-push` y `send-booking-email`), pegado tras el `OPTIONS`:

```ts
async function callerAutorizado(req: Request): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = Deno.env.get('SUPABASE_URL') || '', serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'No autenticado' };
  if (serviceKey && token === serviceKey) return { ok: true };
  const me = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
  if (!me.ok) return { ok: false, status: 401, error: 'Sesión inválida' };   // el anon key NO pasa: /auth/v1/user exige un usuario
  return { ok: true };
}
// ... const auth = await callerAutorizado(req); if (!auth.ok) return json({ error: auth.error }, auth.status);
```

### 6.4 URLs nuevas

| Quién | URL |
|---|---|
| Redsys `DS_MERCHANT_MERCHANTURL` | `https://api.padelmedina.com/functions/v1/redsys-notify` y `.../redsys-notify-split` |
| Redsys `DS_MERCHANT_URLOK/URLKO` | `https://api.padelmedina.com/functions/v1/redsys-redirect?to=<origen>/...` |
| Trigger pg_net | `http://kong:8000/functions/v1/send-registration-admin-notify` (interno; `private.app_config.functions_url`) |
| Cron recordatorios | `http://127.0.0.1:8000/functions/v1/send-reminders` (loopback; Bearer `SERVICE_ROLE_KEY`) |
| Fan-out interno de redsys-notify / send-reminders | `http://kong:8000/functions/v1/send-push`, `.../send-booking-email` (vía `SUPABASE_URL`) |
| Frontend | `https://api.padelmedina.com/functions/v1/<nombre>` (derivado de `VITE_SUPABASE_URL`) |

Nada que tocar en el panel de Redsys: las tres URLs viajan firmadas dentro de cada operación. Requisitos: 443, certificado válido, `POST application/x-www-form-urlencoded`, respuesta `OK`/`KO` en < 30 s (de ahí el warm-up).

Cron del host (`/etc/cron.d/padel-reminders`, instalado **comentado** hasta el corte):
```
# */30 * * * * root /opt/supabase/bin/send-reminders.sh >> /var/log/padel/reminders.log 2>&1
```
```bash
#!/bin/bash  # /opt/supabase/bin/send-reminders.sh
set -a; . /opt/supabase/.env; set +a
echo "$(date -Is) $(curl -sS -m 120 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8000/functions/v1/send-reminders \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}')"
```

### 6.5 Warm-up y despliegue

```bash
#!/bin/bash  # /opt/supabase/bin/warmup.sh : fuerza la descarga/compilación de cada worker para que la primera notificación real de Redsys no pille un arranque en frío
for f in redsys-notify redsys-notify-split redsys-create redsys-redirect send-booking-email send-push send-reminders delete-user admin-update-user send-tournament-confirmation send-bracket-published send-registration-admin-notify; do
  printf '%-32s %s\n' "$f" "$(curl -sS -m 60 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8000/functions/v1/$f" -H 'Content-Type: application/json' -d '{}')"
done   # 4xx es lo esperado (sin firma, sin auth); lo importante es que no haya 5xx ni timeouts
```
```bash
#!/bin/bash  # /opt/supabase/bin/deploy-functions.sh
set -euo pipefail
git -C /opt/padel/repo pull --ff-only
rsync -a --delete --exclude main --exclude create-payment-intent --exclude stripe-webhook --exclude debug-bookings /opt/padel/repo/supabase/functions/ /opt/supabase/volumes/functions/
docker compose -f /opt/supabase/docker-compose.yml restart functions && sleep 10 && /opt/supabase/bin/warmup.sh
```
Pinear imports: `https://esm.sh/@supabase/supabase-js@2` → `@2.<minor exacto>`, `npm:web-push` → `npm:web-push@3.6.7`, std ya va pineado. Así el path de pago no depende de que esm.sh resuelva "latest" en un arranque.

### 6.6 Replay de una notificación Redsys real (sin cobrar dos veces)

Durante el pago de prueba de D-3 (§8.1 paso 8), con `docker compose logs -f functions` abierto, guardar el cuerpo `Ds_SignatureVersion/Ds_MerchantParameters/Ds_Signature` que Redsys envía (añadir temporalmente `console.log(await req.clone().text())` al principio de `redsys-notify` y quitarlo después). Reproducirlo:
```bash
curl -sS -X POST https://api.padelmedina.com/functions/v1/redsys-notify -H 'Content-Type: application/x-www-form-urlencoded' --data @notify-capturado.txt
```
Esperado: `OK`, log `notify duplicado: reserva ... ya confirmada (idempotente)`, sin emails ni tokens nuevos. Con un byte de `Ds_Signature` alterado: `KO`. Este replay se repite en el ensayo del corte y tras cada actualización de edge-runtime.

---

## 7. Cambios en el frontend y en servicios externos

### 7.1 Repo: lista cerrada (rama `selfhost-cutover`, se mergea en el paso 15 del runbook)

| # | Fichero | Cambio |
|---|---|---|
| 1 | `.env.production` L5 | `VITE_SUPABASE_URL=https://api.padelmedina.com` |
| 2 | `.env.production` L6 | `VITE_SUPABASE_ANON_KEY=<ANON_KEY JWT eyJ...>` (el `sb_publishable_` no existe en self-host) |
| 3 | `.env.production` L7 | sin cambios si se conserva la VAPID privada; si se regenera, la pública nueva |
| 4 | `index.html` L22 y L24 | `href="https://api.padelmedina.com"` (preconnect y dns-prefetch) |
| 5 | `src/pages/MyBookings.jsx` L70-88 | `sendConfirmationEmail` → `supabase.functions.invoke('send-booking-email', { body: {...} })` (manda sesión; el `fetch` sin cabeceras deja de funcionar al exigir auth) |
| 6 | `supabase/functions/redsys-notify/index.ts` L354 | fallback `APP_URL` → `https://padelmedina.com` |
| 7 | `supabase/functions/send-push/index.ts`, `send-booking-email/index.ts` | `callerAutorizado` (service role o sesión válida) §6.3 |
| 8 | `supabase/functions/delete-user/index.ts` | `callerAutorizado` admin-only + quitar `del('tournament_registrations','user_id')` |
| 9 | `supabase/migrations/20260910100000_selfhost.sql` | nuevo (§5.5) |
| 10 | `supabase/migrations/00000000000000_baseline_cloud.sql` | `01_public_schema.clean.sql` del dump final: a partir de aquí el repo vuelve a ser la verdad |
| 11 | `deploy/` (nuevo, sin secretos) | `supabase/docker-compose.yml`, `supabase/.env.example`, `supabase/functions.env.example`, `functions-main/index.ts` (parcheado), `nginx/api.padelmedina.com.conf`, `nginx/padel-api-proxy.inc`, `nginx/padel-ratelimit.conf`, `bin/{restore.sh,backup.sh,healthcheck.sh,warmup.sh,deploy-functions.sh,send-reminders.sh,smoke.sh}`, `systemd/supabase.service`, `cron/padel`, `mail-templates/*.html`, `maintenance/{maintenance.html,.htaccess.maintenance}` |
| 12 | `.env` (local) L1-2, `.env.example` L9-10 y textos "Supabase Dashboard > Secrets" | URL nueva; los secrets ahora viven en `/opt/supabase/functions.env` |
| 13 | Borrar | `src/services/firebase.js`, `vercel.json`, `middleware.js`, `.env.local`, `test.cjs`, `test-redsys.js`, `test-redsys2.cjs`, `inject-test-tournament.js`, `supabase/functions/{create-payment-intent,stripe-webhook,debug-bookings}/`, bloques `[functions.create-payment-intent|stripe-webhook|debug-bookings|shop-create-order|shop-order-status|send-order-email]` de `supabase/config.toml` |
| 14 | Mover a `sql-historico/` | `setup-settings.sql`, `setup-reminders.sql` (obsoleto: cron del host), `setup-tournaments.sql`, `add-banned-field.sql`, `push-subscriptions.sql`, `borrar-clases-5-agosto.sql`, `reset-horas-lolo.sql` |
| 15 | `MIGRACION-IONOS.md` | nota de cabecera "el backend ya no está en Supabase Cloud: ver MIGRACION-PLESK.md"; `docs/OPERACION.md` = §9 de este documento |

Sin cambios: `src/services/supabase.js` (todo deriva de la URL), `vite.config.js`, `package.json`, `public/.htaccess`, `public/sw.js`, `public/manifest.json`, `src/utils/serverTime.js`, `src/services/pushNotifications.js`, `.github/workflows/deploy-plesk.yml`. El build sigue en GitHub Actions (`npm run build` lee `.env.production` **del repo**, no de Plesk): por eso hay que commitear los valores nuevos.

Antes del corte: `git tag pre-selfhost` sobre el último commit de `main` que apunta al cloud (rollback = `git revert` o `git push origin pre-selfhost:main --force-with-lease`).

### 7.2 Google OAuth

Google Cloud Console → cliente OAuth existente → *Authorized redirect URIs*: **añadir** `https://api.padelmedina.com/auth/v1/callback` (y durante los ensayos `http://localhost:8000/auth/v1/callback`). **Mantener** `https://iquibawtbpamhaottlbr.supabase.co/auth/v1/callback` hasta cerrar el cloud. Si no se conoce el client secret, crear uno nuevo en ese mismo cliente (admite varios; los usuarios no se enteran) y usarlo en `.env`. Las identidades restauradas en `auth.identities` conservan el mismo `auth.users.id`: perfiles y reservas siguen enlazados. Si el proyecto de Google está en modo "Testing", los usuarios no listados como testers fallan (hoy igual).

### 7.3 Resend, Redsys, VAPID

- **Resend**: el dominio `padelmedina.com` ya está verificado (`send.` MX/TXT, `resend._domainkey`). GoTrue usa SMTP `smtp.resend.com:465` (user `resend`, pass = API key; remitente `acceso@padelmedina.com` o `reservas@`); las funciones siguen por HTTP. Revisar el plan: el gratuito son 100 correos/día compartidos entre OTP, recovery, confirmaciones y cuadros de torneo (un cuadro de 60 parejas lo agota). **No usar el Postfix de Plesk**: el apex no tiene DKIM/SPF propios, la IP de IONOS no tiene reputación, "Outgoing mail control" limita mensajes/hora y no hay webhooks de rebote.
- **Redsys**: nada que configurar en el panel (§6.4). Sí: tener a mano el acceso al Canal de Administración para devoluciones y para el **reenvío manual de notificaciones** (no confiar en los reintentos automáticos de `MERCHANTURL`).
- **VAPID**: misma pareja (privada a `functions.env`, pública ya en `.env.production:7`). Si la privada no se recupera: `npx web-push generate-vapid-keys`, cambiar L7, `truncate push_subscriptions`; solo los admins están suscritos y `pushNotifications.js` los re-suscribe al entrar.

### 7.4 Build de staging (temporal)

```bash
# (PC) desde la rama selfhost-cutover
VITE_SUPABASE_URL=https://api.padelmedina.com VITE_SUPABASE_ANON_KEY='<ANON_KEY>' npx vite build --outDir dist-staging
# subir dist-staging/* (incluido .htaccess) por SFTP a /var/www/vhosts/padelmedina.com/staging.padelmedina.com/
```
Protegerlo con contraseña HTTP en Plesk (Directorios protegidos) para que ningún buscador ni cliente lo use. Se borra en D+1.

---

## 8. Runbook de corte

Ventana: **martes o miércoles, 02:30-05:30 Europe/Madrid** (club cerrado; los holds `pendiente_pago` caducan a los 15 min; Redsys notifica en segundos). Duración prevista 75-100 min; reservar 3 h. Ejecutor con: SSH root, GitHub, Dashboard Supabase, Google Console, panel Redsys, panel Plesk.

### 8.1 D-14 a D-3: preparación (sin impacto en producción)

1. **D-14** Restart del proyecto cloud; ticket a soporte si no vuelve. Exportar del Dashboard: plantillas + asuntos, URL config, Google Client ID, `service_role` legacy, `functions list` con `verify_jwt`. `dump-env` para los secretos (§2.5). Copia de `cloud-secrets.json` en gestor de contraseñas.
2. **En cuanto la BD responda**: bloque completo de dumps (§5.2) → `/root/migracion/<fecha>` + copia offsite. Diff contra el repo → `docs/DRIFT.md`. Si el plan es Pro, descargar además el backup diario del panel.
3. Escribir `20260910100000_selfhost.sql`, baseline, parches de funciones y `MyBookings.jsx` en la rama `selfhost-cutover`. `workflow_dispatch` sobre la rama para ver que compila (NO mergear).
4. **Ensayo en el PC** (Docker Desktop, mismo compose, `restore.sh`) hasta que pase limpio (§5.4). Anotar tiempos.
5. **D-7** Servidor: medir (§1.1), ampliar VPS si < 8 GB, instalar (§1.4), DNS `api`/`staging`, subdominios + certificados, nginx (§3.3), `/opt/supabase` con `.env`, `functions.env`, compose, `kong.yml` con `Date`, plantillas en `mail-templates/`, funciones + `main/index.ts` parcheado. `docker compose up -d` → todo healthy. `restore.sh` con el dump de D-14 (datos de ensayo en el servidor real). systemd `supabase.service` habilitado (§9.1), `backup.sh` probado a mano + rclone configurado, `healthcheck.sh` en cron, cron de recordatorios instalado **comentado**, UptimeRobot sobre `/healthz` (silenciado hasta D-day).
6. Google Console: añadir `https://api.padelmedina.com/auth/v1/callback` (sin quitar la del cloud). Subir el build de staging (§7.4).
7. **D-5** Prueba end-to-end en `https://staging.padelmedina.com` contra los datos de ensayo: login password de un usuario antiguo, Google de un usuario antiguo (mismo `profiles.id`), alta nueva → OTP de 6 dígitos por Resend, olvidé contraseña → email → `/reset-password` → cambio, reserva gratis y "pago en club" (emails + push al admin), pósters (ver, subir, borrar), panel admin con dos pestañas (Realtime: reserva manual en una → push/refresco en la otra), MonitorView (fichar con firma/GPS, `monitor_confirmar_cobro`, `monitor_marcar_pago_jugador`), inscripción a torneo → email al club (`select * from net._http_response order by id desc limit 3` → 200), publicar cuadro (emails escalonados), editar usuario (`admin-update-user`), `delete-user` con un no-admin → 403, `serverToday()` en consola no cae al reloj local (`Date` expuesto).
8. **D-3** **Pago Redsys real de 1 EUR** desde staging (tarjeta y, si el club lo usa, Bizum): Redsys llega a `api.padelmedina.com/functions/v1/redsys-notify` → hold pasa a `confirmed` → push admin + emails + `shared_payment_tokens`. Capturar la notificación (§6.6) y hacer el replay. Pago compartido `/pago-compartido?token=` con `redsys-notify-split`. Devolver los cobros desde el panel de Redsys. `reboot` del servidor en hora cerrada → `docker compose ps` todo healthy sin intervención, `warmup.sh` ejecutado por systemd.
9. **Congelar código**. Preparar el commit de corte en `selfhost-cutover`. `git tag pre-selfhost` en `main`. Avisar al club: "la madrugada del X de 02:30 a 05:00 la web estará en mantenimiento; después habrá que volver a iniciar sesión".

### 8.2 D-1 (tarde)

10. `psql "$OLD" -c 'select 1'` responde (si no: **posponer**; sin dump fresco no hay corte). Panel Redsys sin incidencias. `openssl s_client` cert de `api.` válido. `docker compose ps` healthy, `df -h`, `free -m`. Bandeja de Resend con cuota disponible. Copiar a `/var/www/vhosts/padelmedina.com/httpdocs/` el `maintenance.html` (logo + "Volvemos a las 05:00") **sin activar** el `.htaccess`.

### 8.3 D-day: congelación (02:30)

11. **Congelar la web** (instantáneo, sin build):
    ```bash
    cd /var/www/vhosts/padelmedina.com/httpdocs && cp .htaccess .htaccess.bak
    cat > .htaccess <<'EOF'
    ErrorDocument 503 /maintenance.html
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/maintenance\.html$
    RewriteCond %{REQUEST_URI} !^/logo\.png$
    RewriteRule ^ - [R=503,L]
    Header always set Retry-After "3600"
    EOF
    curl -sI https://padelmedina.com/ | head -1     # HTTP/2 503
    ```
    Los navegadores dejan de crear reservas/pagos; Redsys sigue notificando al cloud (URLs firmadas en las operaciones en vuelo).
12. **Drenaje (20-25 min)**. Cada 5 min en cloud:
    ```sql
    select count(*) from bookings where status='pendiente_pago' and created_at > now()-interval '30 min';
    select count(*) from tournament_registrations where payment_status='pending' and created_at > now()-interval '30 min';
    ```
    Continuar cuando ambos sean 0 (o a los 25 min: los holds caducan a los 15).
13. En cloud: `select cron.unschedule('send-booking-reminders-job');` (evita que el cloud siga mandando recordatorios en paralelo) y `delete from net._http_response;`.
14. **Dump final (≈02:55)**: bloque §5.2 a `/root/migracion/final/`, `T_DUMP.txt` = `select now()`, `counts.txt`, pósters nuevos desde D-14. Limpieza `.clean.sql` (mismos `sed` que en el ensayo). Copia offsite.

### 8.4 Restauración (≈03:05)

15. Stack limpio y determinista:
    ```bash
    cd /opt/supabase && docker compose down && rm -rf volumes/db/data/* volumes/storage/* && docker compose up -d
    sleep 40 && docker compose ps      # GoTrue/storage crean sus esquemas de nuevo
    /opt/supabase/bin/restore.sh /root/migracion/final 2>&1 | tee /var/log/padel/restore-$(date +%F).log
    ```
    Si el paso 3 de `restore.sh` falla: **parar y decidir rollback R1** (§8.7), no parchear en caliente.
16. Verificación de datos: conteos = `counts.txt` (±0 en users/profiles/bookings/regs/fichajes), `policies_public` ≈ 40, publicación con 2 tablas, trigger `on_auth_user_created`, grant de columna, `storage.objects` = `storage_objects.txt`, `select id from auth.identities where provider='google' limit 1`.
17. `warmup.sh` (lo lanza `restore.sh`): ningún 5xx ni timeout. Replay de la notificación capturada en D-3 → `OK` + "duplicado".

### 8.5 Smoke test contra `staging.padelmedina.com` con los datos de producción (≈03:25)

18. Login password del admin; login Google de un usuario antiguo; alta con email de prueba → OTP → `profiles` con `phone` → borrar después; recuperar contraseña de la cuenta de prueba.
19. Realtime: dos pestañas admin, reserva manual → push/refresco. Storage: abrir un póster real; subir y borrar uno de prueba.
20. Monitor (usuario lolo): agenda del día, marcar pago de jugador (RPC), fichaje y borrado.
21. Inscripción a torneo abierto (o torneo de prueba) → email al club (`net._http_response` 200) → borrar inscripción y torneo de prueba.
22. **Pago real de 1 EUR** desde staging → `bookings.status='confirmed'`, tokens, emails, push. Anotar nº de pedido para devolverlo por la mañana.
    Si 18-22 fallan en algo que no se arregla en 30 min → **R1**.

### 8.6 Switch (≈03:50)

23. GitHub: merge de `selfhost-cutover` en `main` → Actions (~3 min) → rama `plesk-deploy`. En Plesk → Git → "Pull now" (o `plesk ext git --deploy -domain padelmedina.com -name <repo>`). El `dist/.htaccess` nuevo **sustituye** al de mantenimiento automáticamente. Comprobar:
    ```bash
    cd /var/www/vhosts/padelmedina.com/httpdocs && grep -l 'api.padelmedina.com' assets/*.js | head -1 && ! grep -rl 'iquibawtbpamhaottlbr' assets/ && curl -sI https://padelmedina.com/ | head -1   # 200
    ```
24. Producción en ventana privada + móvil: login, calendario, `/torneos`, `/reset-password` (recarga directa), `/pago-compartido?token=<uno real>`; DevTools sin peticiones a `supabase.co`, `wss://api.padelmedina.com/realtime/v1` conecta (101). El SW se actualiza al recargar (`sw.js` no se cachea).
25. Descomentar `/etc/cron.d/padel-reminders`; ejecutar `send-reminders.sh` a mano → 200 en `/var/log/padel/reminders.log`. Activar el monitor externo. `backup.sh` a mano y comprobar que llega al remoto de rclone.
26. Anotar hora de fin y `T_DUMP` en `docs/OPERACION.md`. Mensaje al club. `docker compose logs -f --tail=50 functions auth rest` 30 min.

### 8.7 Rollback

**R1 — antes del switch (pasos 15-22 fallan):** `mv /var/www/vhosts/padelmedina.com/httpdocs/.htaccess.bak .htaccess` → la web vuelve al cloud tal cual (no se ha escrito nada en él desde `T_DUMP`); en cloud `select cron.schedule('send-booking-reminders-job','*/30 * * * *', $$ ... $$)` con el comando de `cron_job.txt`. Cero pérdida de datos. Repetir otra noche.

**R2 — después del switch (primeras horas/días):**
1. Frontend: en el docroot `git log --oneline -3 && git checkout <sha del build anterior>` (instantáneo) o `git revert` del merge en `main` (3 min por Actions). Restaurar el cron en cloud como en R1.
2. Datos escritos en el self-host desde `T_DUMP` (`bookings`, `tournament_registrations`, `profiles`/`auth.users` nuevos, `fichajes`, `clases_monitor`, `push_subscriptions`, `shared_payment_tokens`): `pg_dump --data-only --inserts -t <tabla>` filtrado por `created_at > T_DUMP` y reinserción a mano en cloud respetando los `auth.users.id` (usuarios nuevos primero, vía Admin API de GoTrue cloud). Volumen esperado en una noche: decenas de filas.
3. **`api.padelmedina.com` se queda encendido en modo notify-only**: las operaciones Redsys creadas con el build nuevo llevan firmada `api.padelmedina.com/functions/v1/redsys-notify`; se deja el stack vivo (o solo `functions`+`kong`+`db`) y se concilian a mano hasta que no quede ninguna abierta. Simétricamente el cloud sigue vivo para las firmadas con la URL vieja.
4. Comunicar al club que vuelven a iniciar sesión.
Ventana práctica de R2: mientras el cloud siga sin pausar/borrar y no se hayan rotado claves (30 días).

### 8.8 D+1 a D+30

- **D+1 09:00**: devolver el pago de prueba en el panel Redsys. **Conciliación** (repetir a diario 7 días, luego semanal):
  ```sql
  -- en CLOUD: lo que haya entrado después del dump (esperado 0-2 filas)
  select id, date, time_slot, status, metodo_pago, created_at, cobrado_at from bookings where created_at > :'T_DUMP' or cobrado_at > :'T_DUMP';
  select id, tournament_id, payment_status, paid_at from tournament_registrations where created_at > :'T_DUMP' or paid_at > :'T_DUMP';
  select id, booking_id, paid_at from shared_payment_tokens where paid_at > :'T_DUMP';
  select id, email, created_at from auth.users where created_at > :'T_DUMP';
  ```
  Todo lo que aparezca se replica a mano en el self-host (y se coteja con el panel de Redsys "Operaciones"). `net._http_response` y `docker stats`, `free -m`, logs de GoTrue (SMTP), bandeja del club, UptimeRobot.
- **D+1**: borrar `staging.padelmedina.com` (subdominio + DNS) y quitar `https://staging.padelmedina.com/**` de `ADDITIONAL_REDIRECT_URLS` (`docker compose up -d auth`). Comprobar que las reservas del día reciben recordatorio (`reminder_sent=true` 10 h antes) y que los admins reciben push (se re-suscriben al entrar).
- **D+7**: prueba de restauración del backup del día en el PC (mismo `restore.sh`). Aplicar `20260925100000_limpieza_post_selfhost.sql` (§10.2) con backup previo.
- **D+30 (cierre)**: conciliación final = 0; último dump del cloud; Dashboard → Settings → **Pause** (2 semanas más) → Delete. Quitar el callback `supabase.co` en Google Console; rotar `RESEND_API_KEY`, `REGISTRATION_NOTIFY_SECRET`; borrar `cloud-secrets.json`, `dump-env`, scripts de prueba con claves cloud. El JWT anon cloud embebido en dos migraciones históricas queda inerte.

---

## 9. Operación

### 9.1 Arranque al reiniciar

`restart: unless-stopped` en el compose + `systemctl enable docker` ya lo cubren. Cinturón: `/etc/systemd/system/supabase.service`

```ini
[Unit]
Description=Supabase self-hosted (Padel Medina)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/supabase
ExecStart=/usr/bin/docker compose up -d
ExecStartPost=/bin/sh -c 'sleep 45; /opt/supabase/bin/warmup.sh >> /var/log/padel/warmup.log 2>&1'
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```
`systemctl daemon-reload && systemctl enable supabase`. Prueba obligatoria en D-3: `reboot` en hora cerrada; al volver `docker compose ps` todo healthy sin tocar nada (Postgres tarda ~20 s; nginx da 502 ese rato). Studio solo bajo demanda: `docker compose --profile tools up -d meta studio` + `ssh -L 3000:127.0.0.1:3000 root@87.106.229.29` → `http://localhost:3000`; apagar después (`docker compose --profile tools stop meta studio`).

### 9.2 Backups (diarios, restaurables con el MISMO `restore.sh`)

`/opt/supabase/bin/backup.sh`, cron `30 3 * * *`. Produce exactamente el juego de ficheros que consume `restore.sh` (así el procedimiento de restauración es uno solo y se prueba cada mes), más un `-Fc` completo de respaldo. Sin paradas del stack (una notificación de Redsys durante una parada semanal "en frío" se perdería y Redsys no garantiza el reintento).

```bash
#!/bin/bash
set -euo pipefail; cd /opt/supabase; set -a; . ./.env; set +a
B=/var/www/vhosts/padelmedina.com/private/backups/supabase; TS=$(date +%F_%H%M); D=$B/$TS; mkdir -p $D/posters
PD() { docker compose exec -T db pg_dump -U supabase_admin -d postgres "$@"; }
PD --schema=public --schema-only > $D/01_public_schema.clean.sql
PD --schema=public --data-only   > $D/02_public_data.sql
PD --data-only --table=auth.users --table=auth.identities > $D/03_auth_data.sql
PD --data-only --table=storage.buckets > $D/04_storage_buckets.sql
PD -Fc > $D/99_full.dump
# pósters: por API (mismo formato que la migración), no copiando el volumen versionado
curl -sS "http://127.0.0.1:8000/storage/v1/object/list/event-posters" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{"prefix":"","limit":1000}' \
 | jq -r '.[].name' | while read -r n; do curl -sS -o "$D/posters/$n" "http://127.0.0.1:8000/storage/v1/object/public/event-posters/$n"; done
docker compose exec -T db psql -U supabase_admin -d postgres -Atc "select 'users',count(*) from auth.users union all select 'profiles',count(*) from profiles union all select 'bookings',count(*) from bookings union all select 'regs',count(*) from tournament_registrations union all select 'fichajes',count(*) from fichajes" > $D/counts.txt
tar czf $D/config.tgz -C /opt/supabase .env functions.env docker-compose.yml volumes/api volumes/functions
tar czf $D/storage-volume.tgz -C /opt/supabase/volumes storage
chmod -R go-rwx $B; find $B -maxdepth 1 -mindepth 1 -type d -mtime +14 -exec rm -rf {} +
rclone sync $B remote:padel-backups/daily --transfers 4 --quiet      # offsite: Backblaze B2 / Hetzner Storage Box / Google Drive
echo "$(date -Is) backup OK $TS $(du -sh $D | cut -f1)" >> /var/log/padel/backup.log
```
- Está dentro de `/var/www/vhosts/padelmedina.com/private/`: el **Backup Manager de Plesk** (programado, destino remoto) lo incluye en el backup de la suscripción sin más configuración. rclone es la segunda copia offsite.
- **Restauración** = `restore.sh <dir>` sobre un stack limpio (`docker compose down && rm -rf volumes/db/data/* volumes/storage/* && docker compose up -d`). El esquema `private` no viaja en `pg_dump --schema=public`: `restore.sh` lo recrea en su paso 6 con los valores de `.env`/`functions.env`, así que el backup diario se restaura exactamente igual que el dump del cloud. `config.tgz` guarda `.env` y `functions.env`: sin `JWT_SECRET` ningún token ni `SERVICE_ROLE_KEY` valdría; guardar una copia de `config.tgz` también en el gestor de contraseñas.
- **Prueba mensual** en el PC (Docker Desktop): restaurar el backup del día y hacer login + una reserva. Si no se prueba, no es un backup.
- RPO 24 h asumido conscientemente (antes Supabase daba PITR). Si algún día duele: `pgbackrest` con WAL archiving (+0,5 día).

### 9.3 Monitorización

`/opt/supabase/bin/healthcheck.sh`, cron `*/5 * * * *`:
```bash
#!/bin/bash
cd /opt/supabase; set -a; . ./.env; set +a; ALERT=curritoastdj@gmail.com; MSG=""
# contenedores
bad=$(docker compose ps --format json | jq -r 'select(.State!="running" or (.Health!="" and .Health!="healthy")) | .Service')
if [ -n "$bad" ]; then MSG+="Contenedores KO: $bad (relanzando)\n"; docker compose up -d >/dev/null 2>&1; fi
# BD y API
docker compose exec -T db pg_isready -U postgres -h localhost >/dev/null || MSG+="pg_isready KO\n"
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 10 https://api.padelmedina.com/healthz)" = 200 ] || MSG+="/healthz KO\n"
curl -s -m 10 https://api.padelmedina.com/mail-templates/confirmation.html | grep -q 'Token' || MSG+="plantilla OTP no accesible\n"
# salida a Internet DESDE DENTRO de un contenedor (Plesk Firewall puede cortarla al reaplicar reglas)
docker compose exec -T realtime curl -sfI -m 10 https://api.resend.com >/dev/null 2>&1 || MSG+="sin salida a Internet desde Docker (¿Plesk Firewall? systemctl restart docker)\n"
# disco y RAM del host (los logs de Docker y fichajes.firma son los que crecen)
[ "$(df --output=pcent / | tail -1 | tr -dc 0-9)" -lt 85 ] || MSG+="disco / > 85%\n"
[ "$(free -m | awk '/Mem:/{print $7}')" -gt 400 ] || MSG+="RAM disponible < 400 MB (riesgo OOM para Postgres/Dovecot)\n"
[ -z "$MSG" ] || printf "$MSG\n$(docker stats --no-stream)" | mail -s "[padel] alerta $(hostname) $(date +%H:%M)" $ALERT
```
(`mail` usa el Postfix del propio Plesk; solo para alertas internas.) Externo: UptimeRobot/Better Stack sobre `https://api.padelmedina.com/healthz` (200) y `https://padelmedina.com/` con aviso por email/Telegram. Plesk → Health Monitoring para RAM/CPU/swap. Primera semana: `docker compose logs -f functions auth` y panel de Redsys a diario.

### 9.4 Actualizaciones

- Debian: `unattended-upgrades` (docker-ce excluido). Plesk: sus propias actualizaciones; tras cualquier cambio en firewall/nginx: `nginx -t`, `healthcheck.sh`.
- Imágenes: nunca `latest`. Cada 2-3 meses, con backup previo, **una imagen cada vez**: gotrue → storage-api → postgrest → realtime → edge-runtime → kong; `docker compose pull <svc> && docker compose up -d <svc>` → `warmup.sh` → smoke test (§10.1) → replay Redsys. GoTrue y storage migran sus esquemas solos hacia delante (nunca hacia atrás: si hay que volver, restaurar backup). Postgres mayor (17→18) solo con dump/restore planificado.
- Funciones: `bin/deploy-functions.sh` tras cada push a `main` que toque `supabase/functions/` (manual; si se quiere automático, un segundo workflow con `paths: ['supabase/functions/**']` que haga `ssh root@... /opt/supabase/bin/deploy-functions.sh`).

### 9.5 Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Stack, compose, `.env`, `functions.env` | `/opt/supabase` (chmod 600 los `.env`) |
| Funciones desplegadas | `/opt/supabase/volumes/functions/` (fuente: `/opt/padel/repo/supabase/functions/`) |
| BD y ficheros | `/opt/supabase/volumes/db/data`, `/opt/supabase/volumes/storage` |
| Plantillas de correo | `/var/www/vhosts/padelmedina.com/api.padelmedina.com/mail-templates/` |
| nginx del API | `/var/www/vhosts/system/api.padelmedina.com/conf/vhost_nginx.conf`, `/etc/nginx/padel-api-proxy.inc`, `/etc/nginx/conf.d/padel-ratelimit.conf` |
| Backups | `/var/www/vhosts/padelmedina.com/private/backups/supabase/` + rclone remoto + Plesk Backup Manager |
| Logs | `docker compose logs <svc>`, `/var/log/padel/{reminders,backup,warmup}.log`, `/var/www/vhosts/system/api.padelmedina.com/logs/` |
| Cron | `/etc/cron.d/padel-reminders`, `/etc/cron.d/padel-ops` (backup 03:30, healthcheck */5) |
| Secretos "maestros" (JWT_SECRET, POSTGRES_PASSWORD, config.tgz) | gestor de contraseñas del club, fuera del servidor |

---

## 10. Estimación honesta y riesgos residuales

### 10.1 Tiempo

| Bloque | Días |
|---|---|
| Rescate cloud (restart, exportaciones, `dump-env`, dumps, diff/drift) | 1 (más la espera de soporte, fuera de control) |
| Repo: fixup SQL, baseline, 3 parches de funciones, `MyBookings.jsx`, `main/index.ts`, `deploy/` | 1,5 |
| Ensayo `restore.sh` en el PC hasta que pase limpio + pruebas locales (OTP, Google, Realtime, trigger) | 1,5 |
| Servidor: Docker, swap, DNS, subdominios, certificados, nginx, `/opt/supabase`, `.env`, kong `Date`, plantillas, systemd, backups, healthcheck, restore de ensayo | 2 |
| Pruebas E2E en staging + pago real + replay + reboot | 1 |
| Corte (noche) + hipercuidado D+1 | 1 |
| Convivencia (conciliación diaria, limpieza post-corte, prueba de restore, cierre D+30) | 1 (repartido) |
| **Total** | **≈ 9 días/persona** (rango realista **11-14** si es la primera vez con compose/Kong/GoTrue/Plesk-nginx; × 1,5 si se hace a ratos). Calendario: 3-5 semanas + 30 días de convivencia. |

Comparativa: la reescritura a Postgres + Node (Diseño 2) son 22-32 días/persona antes de poder salir del cloud.

### 10.2 Deuda que NO se mezcla con el corte (semana +1, migración `20260925100000_limpieza_post_selfhost.sql` + parches)

1. `handle_new_user`: dar `admin` solo a una lista explícita (hoy cualquier email con `admin` es admin) y copiar `phone` desde `raw_user_meta_data` si el dump muestra que no lo hace.
2. `shared_payment_tokens`: INSERT/UPDATE solo `service_role` (hoy `WITH CHECK true` para anon).
3. Pósters: políticas de `storage.objects` con `is_admin()` en vez de cualquier `authenticated`.
4. `redsys-redirect`: allowlist de `to` a `padelmedina.com`; `redsys-create`: allowlist de dominio en `successUrl/failUrl/notifyUrl`.
5. Limpieza: `drop sequence store_order_seq`, `alter table site_settings drop column tienda_activa`, `drop index bookings_unique_confirmed` (duplicado de `uq_bookings_slot_activa`), políticas legacy por `admin_id` en `tournaments`/`tournament_registrations`.
6. `send-reminders`: `pg_advisory_xact_lock` o marca `reminder_sent` en la misma transacción (hoy ya idempotente por `reminder_sent`, pero el cron del host puede solaparse si una ejecución tarda > 30 min).

### 10.3 Hoja de ruta 6-12 meses (bajar el peso en el servidor de correo)

- Push desde el servidor: `redsys-notify` ya llama a `send-push`; hacer lo mismo en el camino de reserva gratis/club y **eliminar el canal Realtime de `App.jsx`**. Sustituir el canal de `TournamentManager` por polling cada 30 s → se puede apagar el contenedor `realtime` (Elixir, 250-400 MB, un eje de upgrades menos).
- Mover el aviso de inscripción a la SPA/función (llamar a `send-registration-admin-notify` tras el INSERT) → quitar pg_net y el trigger.
- Portar funciones a Node una a una detrás de `location = /functions/v1/<nombre>` (empezar por `redsys-redirect`, terminar por `redsys-*`): elimina edge-runtime.
- Si se llega a quitar PostgREST/GoTrue: el *shim* `auth.uid()/role()/jwt()` sobre `current_setting` + `SET LOCAL ROLE` del Diseño 2 conserva las 40 políticas tal cual.

### 10.4 Riesgos residuales (ordenados por probabilidad × impacto)

1. **La BD cloud no vuelve o vuelve inestable.** Sin dump no hay migración con datos. Mitigación: ticket ya; dumps el mismo día que responda; pooler en modo sesión; backup diario del panel si es Pro; `delete from net._http_response` antes del dump. Peor caso: reconstruir esquema desde el repo + `docs/DRIFT.md` y pedir a los usuarios que se registren de nuevo.
2. **Pagos Redsys en vuelo.** Mitigado por congelación + drenaje + dual-run 30 días + conciliación diaria; residual: una operación iniciada segundos antes del 503 y notificada al cloud si este está caído → cobro sin reserva → detección en la conciliación y arreglo a mano. Redsys no garantiza reintentos: reenvío manual desde el panel.
3. **RAM en un servidor de correo compartido.** Límites por contenedor + swap + alerta < 400 MB; con 8 GB hay margen; con menos, ampliar. No se apaga nada del correo.
4. **edge-runtime.** Pieza menos madura del stack: `DENO_DIR` persistente, imports pineados, warm-up, límite de memoria, healthcheck que relanza, plan B Node en 2-3 días sin tocar frontend ni Redsys.
5. **Secretos irrecuperables.** `dump-env` mientras el proyecto exista; alternativas por origen (banco para Redsys, Resend nueva key, VAPID regenerado con re-suscripción automática de admins).
6. **Drift repo ↔ BD.** El dump es la fuente; baseline nuevo; `docs/DRIFT.md`. Residual: objetos en otros esquemas no revisados (`99_full.dump` los conserva).
7. **Correo.** Resend gratuito = 100/día; plantilla sin `{{ .Token }}` = nadie se registra; `healthcheck.sh` vigila la plantilla; plan Pro de Resend si hay torneos grandes.
8. **Google OAuth.** `redirect_uri_mismatch` si falta el callback; probado en D-5 con usuario antiguo y nuevo.
9. **Plesk + Docker.** Firewall que vacía cadenas (healthcheck lo detecta), `httpdmng` que regenera config (las directivas viven en `vhost_nginx.conf`), Plesk que actualiza nginx (Docker sigue en loopback).
10. **Un solo punto de fallo** (web + API + BD + correo en un VPS, RPO 24 h). Aceptado conscientemente a cambio de salir del cloud; backups probados + monitorización externa; `pgbackrest` si se quiere PITR.
11. **Deslogueo global** (clave de localStorage por host) y push de admins (se re-suscriben). Avisado al club.
12. **Certificado/HSTS de `api.`** (`includeSubDomains` del apex): emitido ≥ 3 días antes; renovación por Plesk; UptimeRobot avisa si caduca.

Fin del documento.
