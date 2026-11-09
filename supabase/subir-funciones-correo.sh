#!/usr/bin/env bash
# Sube al servidor las funciones de correo nuevas (SMTP del Plesk con Resend de
# reserva) y el guion configurar-correo-plesk.sh. Se lanza desde el PC, en Git Bash,
# en la carpeta del proyecto:
#   bash supabase/subir-funciones-correo.sh
# Mientras no se lance configurar-correo-plesk.sh activar, todo sigue saliendo por Resend,
# como hasta ahora. Guarda antes una copia de las funciones del servidor.
set -euo pipefail
cd "$(dirname "$0")"
LLAVE=~/.ssh/ggomez_vps
SRV=root@87.106.229.29
F=/root/padel-migracion/stack/volumes/functions
FECHA=$(date +%Y%m%d-%H%M%S)
FUNCIONES="send-booking-email send-tournament-confirmation send-bracket-published send-registration-admin-notify"

ssh -i $LLAVE $SRV "cd $F && tar czf /root/padel-migracion/funciones-antes-smtp-$FECHA.tgz _shared $FUNCIONES"
echo "Copia en el servidor: /root/padel-migracion/funciones-antes-smtp-$FECHA.tgz"

scp -q -i $LLAVE functions/_shared/correo.ts functions/_shared/smtp.ts $SRV:$F/_shared/
for f in $FUNCIONES; do scp -q -i $LLAVE functions/$f/index.ts $SRV:$F/$f/index.ts; done
scp -q -i $LLAVE configurar-correo-plesk.sh $SRV:/root/padel-migracion/
echo "Código subido."

ssh -i $LLAVE $SRV 'cd /root/padel-migracion/stack
S=$(docker inspect -f "{{index .Config.Labels \"com.docker.compose.service\"}}" supabase-edge-functions)
docker compose up -d --force-recreate --no-deps "$S" >/dev/null 2>&1
for i in $(seq 1 30); do [ "$(docker inspect -f "{{.State.Health.Status}}" supabase-edge-functions)" = healthy ] && break; sleep 2; done
echo "Contenedor de funciones: $(docker inspect -f "{{.State.Health.Status}}" supabase-edge-functions)"
KONG=$(grep "^KONG_HTTP_PORT=" .env | cut -d= -f2 | tr -d "\047\"")
K=$(grep "^SERVICE_ROLE_KEY=" .env | cut -d= -f2- | tr -d "\047\"")
# Con el cuerpo vacío cada función contesta 400 sin mandar nada: así se ve que el código nuevo arranca.
for f in send-booking-email send-tournament-confirmation send-bracket-published send-registration-admin-notify; do
  c=$(curl -sS --max-time 30 -o /tmp/r.txt -w "%{http_code}" -X POST "http://$KONG/functions/v1/$f" -H "Authorization: Bearer $K" -H "apikey: $K" -H "Content-Type: application/json" -d "{}")
  echo "$f -> $c $(head -c 120 /tmp/r.txt)"
done
rm -f /tmp/r.txt
docker logs --since 2m supabase-edge-functions 2>&1 | grep -iE "error|exception" | grep -v "Missing authorization" | tail -5 || true'
echo "Si las cuatro dan 400 (y no 500 ni «worker boot error»), el código nuevo está bien en el servidor."
