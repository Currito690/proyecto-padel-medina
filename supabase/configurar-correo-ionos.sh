#!/usr/bin/env bash
# Pasa los correos de Padel Medina de Resend al correo de IONOS.
#
# Se ejecuta EN EL SERVIDOR (Plesk), con terminal, porque pide la contraseña del
# buzón sin enseñarla ni dejarla en el historial:
#   scp -i ~/.ssh/ggomez_vps supabase/configurar-correo-ionos.sh root@87.106.229.29:/root/padel-migracion/
#   ssh -t -i ~/.ssh/ggomez_vps root@87.106.229.29 bash /root/padel-migracion/configurar-correo-ionos.sh
#
# Qué hace:
#  1. Copia de seguridad de .env (cuentas) y volumes/functions/.env.secrets (funciones).
#  2. Correos de la app (reservas, torneos): CORREO_SMTP_* en .env.secrets.
#     RESEND_API_KEY se queda como reserva: si IONOS falla, el correo sale por Resend.
#  3. Correos de las cuentas (confirmar registro, recuperar contraseña): SMTP_* en .env.
#  4. Recrea los contenedores de funciones y de cuentas (unos segundos).
#  5. Prueba: manda un correo de reserva de prueba y uno de "recuperar contraseña"
#     a la dirección que se indique (tiene que ser de una cuenta que exista).
# Para volver atrás: restaurar las copias .bak.<fecha> y recrear los dos contenedores.
set -euo pipefail
cd /root/padel-migracion/stack
ENV=.env
SECRETOS=volumes/functions/.env.secrets
FECHA=$(date +%Y%m%d-%H%M%S)

read -r -p "Buzón de IONOS que envía [reservas@padelmedina.com]: " BUZON
BUZON=${BUZON:-reservas@padelmedina.com}
[[ "$BUZON" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "Buzón no válido"; exit 1; }
read -r -s -p "Contraseña de $BUZON (no se ve al escribir): " CLAVE; echo
read -r -s -p "Repítela: " CLAVE2; echo
[ "$CLAVE" = "$CLAVE2" ] || { echo "No coinciden"; exit 1; }
[ -n "$CLAVE" ] || { echo "Contraseña vacía"; exit 1; }
case "$CLAVE" in *"'"*|*$'\n'*) echo "La contraseña no puede llevar comillas simples (') para este guion. Cámbiala en IONOS."; exit 1;; esac
read -r -p "Correo para la prueba (de una cuenta de la app, p. ej. el tuyo): " PRUEBA

# Comprobación previa: ¿IONOS acepta ese usuario y contraseña? (sin mandar nada)
echo "Comprobando el usuario y la contraseña en smtp.ionos.es..."
AUTH=$(printf '\0%s\0%s' "$BUZON" "$CLAVE" | base64 -w0)
RESP=$( { printf 'EHLO padelmedina.com\r\n'; sleep 2; printf 'AUTH PLAIN %s\r\n' "$AUTH"; sleep 3; printf 'QUIT\r\n'; } \
  | timeout 20 openssl s_client -quiet -connect smtp.ionos.es:465 -servername smtp.ionos.es 2>/dev/null | grep -E '^(235|535|5[0-9][0-9]) ' || true)
unset AUTH
if ! grep -q '^235' <<<"$RESP"; then
  echo "IONOS NO acepta el usuario o la contraseña: ${RESP:-sin respuesta}"
  echo "No se ha cambiado nada."
  exit 1
fi
echo "OK: IONOS acepta el buzón."

cp -p "$ENV" "$ENV.bak.$FECHA"
cp -p "$SECRETOS" "$SECRETOS.bak.$FECHA"
echo "Copias: $ENV.bak.$FECHA y $SECRETOS.bak.$FECHA"

# Cambia (o añade) CLAVE='valor' en un fichero, sin sed (la contraseña puede llevar / & \ ...).
poner() {
  local fichero=$1 k=$2 v=$3 tmp
  tmp=$(mktemp)
  grep -v "^$k=" "$fichero" > "$tmp" || true
  printf "%s='%s'\n" "$k" "$v" >> "$tmp"
  cat "$tmp" > "$fichero"   # conserva dueño y permisos
  rm -f "$tmp"
}

poner "$SECRETOS" CORREO_SMTP_HOST smtp.ionos.es
poner "$SECRETOS" CORREO_SMTP_PUERTO 465
poner "$SECRETOS" CORREO_SMTP_USUARIO "$BUZON"
poner "$SECRETOS" CORREO_SMTP_CLAVE "$CLAVE"
poner "$SECRETOS" CORREO_REMITENTE "Padel Medina <$BUZON>"

poner "$ENV" SMTP_HOST smtp.ionos.es
poner "$ENV" SMTP_PORT 465
poner "$ENV" SMTP_USER "$BUZON"
poner "$ENV" SMTP_PASS "$CLAVE"
poner "$ENV" SMTP_ADMIN_EMAIL "$BUZON"

FUNCIONES=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' supabase-edge-functions)
CUENTAS=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' supabase-auth)
docker compose up -d --force-recreate --no-deps "$FUNCIONES" "$CUENTAS"
for i in $(seq 1 30); do
  E1=$(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions 2>/dev/null || echo ?)
  E2=$(docker inspect -f '{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo ?)
  [ "$E1" = healthy ] && [ "$E2" = healthy ] && break
  sleep 2
done
echo "Funciones: $E1 · Cuentas: $E2"

# La contraseña llegó entera a los dos contenedores (se compara la longitud, no el valor).
L1=$(docker exec supabase-edge-functions sh -c 'printf %s "$CORREO_SMTP_CLAVE" | wc -c')
L2=$(docker exec supabase-auth sh -c 'printf %s "$GOTRUE_SMTP_PASS" | wc -c')
echo "Contraseña en funciones: $([ "$L1" = "${#CLAVE}" ] && echo bien || echo "MAL ($L1 de ${#CLAVE})") · en cuentas: $([ "$L2" = "${#CLAVE}" ] && echo bien || echo "MAL ($L2 de ${#CLAVE})")"
unset CLAVE CLAVE2

[ -z "$PRUEBA" ] && { echo "Sin correo de prueba: listo."; exit 0; }
KONG=$(grep '^KONG_HTTP_PORT=' "$ENV" | cut -d= -f2 | tr -d "'\"")
SERVICIO=$(grep '^SERVICE_ROLE_KEY=' "$ENV" | cut -d= -f2- | tr -d "'\"")
ANON=$(grep '^ANON_KEY=' "$ENV" | cut -d= -f2- | tr -d "'\"")
sleep 3
echo "Prueba 1: correo de reserva (función send-booking-email)..."
curl -sS -X POST "http://$KONG/functions/v1/send-booking-email" \
  -H "Authorization: Bearer $SERVICIO" -H "apikey: $SERVICIO" -H 'Content-Type: application/json' \
  -d "{\"type\":\"confirmation\",\"email\":\"$PRUEBA\",\"userName\":\"Prueba IONOS\",\"courtName\":\"Pista de prueba\",\"date\":\"$(date +%F)\",\"timeSlot\":\"10:00 - 11:30\"}"
echo
docker logs --since 1m supabase-edge-functions 2>&1 | grep -E 'Email \(|IONOS|Resend' | tail -3
echo "Prueba 2: correo de recuperar contraseña (cuentas)..."
curl -sS -o /dev/null -w "respuesta %{http_code}\n" -X POST "http://$KONG/auth/v1/recover" \
  -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"email\":\"$PRUEBA\"}"
sleep 3
docker logs --since 1m supabase-auth 2>&1 | grep -iE 'mail|smtp' | grep -iE 'error|fail|sent' | tail -3 || true
echo "Mira la bandeja de $PRUEBA (y el spam): deben llegar los dos correos desde $BUZON."
echo "En la prueba 1, el log debe decir 'via smtp'. Si dice 'via resend', IONOS falló y salió por la reserva."
