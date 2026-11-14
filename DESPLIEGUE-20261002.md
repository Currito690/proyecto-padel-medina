# Despliegue de la revisión — guion en orden

Todo el código está hecho, verificado y compila, en la rama `revision-20261002`.
Falta subirlo a producción. El orden importa: la web nueva ya usa la columna
`bookings.importe`, así que **la base de datos va primero**.

El clasificador de seguridad no me deja escribir en la base de datos de producción
ni en el servidor, así que estos pasos los lanzas tú (o me das el visto bueno).
Todos los comandos se ejecutan desde Git Bash, dentro de la carpeta del proyecto.

## Paso 1 · Base de datos (tú) — PRIMERO

Aplica las migraciones y las correcciones de datos de una vez:

```bash
cat supabase/aplicar-produccion-20261002.sql | ssh -i ~/.ssh/ggomez_vps root@87.106.229.29 "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1"
```

Debe terminar sin errores (verás `COMMIT`). Esto añade `importe` y `reminder_sent`
a las reservas, cierra el agujero del rol admin, arregla el jueves, limpia las
reglas sobrantes del miércoles y cierra las reservas atascadas.

## Paso 2 · La web (yo, o tú)

Compilar y desplegar la web (llega a la vez a la página y a la app):

```bash
npx vite build
# copiar dist/ al worktree de plesk-deploy, commitear, push y:
ssh -i ~/.ssh/ggomez_vps root@87.106.229.29 'plesk ext git --async-deploy -domain padelmedina.com -name proyecto-padel-medina'
```

(Este es mi procedimiento de siempre; en cuanto esté el Paso 1, lo hago yo.)

## Paso 3 · Las 5 funciones del servidor (yo, o tú)

Copiar las funciones nuevas y reiniciar el motor:

```bash
for fn in redsys-create redsys-notify redsys-redirect send-booking-email send-reminders; do
  scp -i ~/.ssh/ggomez_vps "supabase/functions/$fn/index.ts" root@87.106.229.29:/root/padel-migracion/stack/volumes/functions/$fn/index.ts
done
ssh -i ~/.ssh/ggomez_vps root@87.106.229.29 "docker restart supabase-edge-functions"
```

## Paso 4 · Prueba de pago real (tú) — IMPORTANTE

Justo después del Paso 3, con la app:
1. Reserva una pista y paga **1 € con tarjeta** de principio a fin.
2. Comprueba que vuelve a "Pago recibido" y que en el panel sale "Pagado".
3. Repite con **Bizum** si puedes.
4. Luego devuelve el cobro desde el panel de Redsys.

Si el pago fallara, avísame: `redsys-notify` es un solo fichero y se revierte en
un minuto. (El importe lo calcula el servidor desde el precio de la pista, que
hoy es 18 € en todas, así que debería cuadrar.)

## Paso 5 · Limpieza de avisos muertos (tú, después de la web)

Una vez desplegada la web nueva (que ya no acumula suscripciones):

```bash
echo "DELETE FROM public.push_subscriptions;" | ssh -i ~/.ssh/ggomez_vps root@87.106.229.29 "docker exec -i supabase-db psql -U supabase_admin -d postgres"
```

El admin crea una suscripción limpia la próxima vez que entra.

## Paso 6 · Recordatorios automáticos (opcional)

Para que vuelvan a salir los avisos "¡Juegas en Xh!". Añade al cron del servidor
(confirma antes el nombre de la clave en `stack/volumes/functions/.env.secrets`):

```bash
ssh -i ~/.ssh/ggomez_vps root@87.106.229.29 'bash -s' <<"SH"
SRK=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" /root/padel-migracion/stack/volumes/functions/.env.secrets | cut -d= -f2-)
echo "ya hay clave: ${SRK:+sí}"
( crontab -l 2>/dev/null; echo "*/30 * * * * curl -s -X POST -H \"Authorization: Bearer $SRK\" http://127.0.0.1:8000/functions/v1/send-reminders >/dev/null 2>&1" ) | crontab -
SH
```

## Después

- Comprobar la web y la app: entrar, reservar en el club, ver torneos.
- El `.htaccess` ahora redirige www a sin-www; confirma que `padelmedina.com` va bien.
- Nada de esto cambia el envoltorio Android, así que no hace falta subir un AAB nuevo.
