#!/usr/bin/env bash
# Correo de padelmedina.com en el Plesk (en lugar de Resend), en dos fases.
# Se ejecuta EN EL SERVIDOR, con terminal (pide contraseñas sin enseñarlas):
#
#   ssh -t -i ~/.ssh/ggomez_vps root@87.106.229.29 bash /root/padel-migracion/configurar-correo-plesk.sh preparar
#     1. Activa el correo de padelmedina.com en el Plesk y la firma DKIM.
#     2. Crea el buzón que envía (reservas@padelmedina.com) con la contraseña que escribas.
#     3. Opcional: info@padelmedina.com como reenvío a padelmedina@hotmail.com
#        (es la dirección de "responder" de los correos de la app).
#     4. Comprueba que el buzón puede iniciar sesión en el servidor de correo.
#     5. Escribe los registros DNS que hay que poner en IONOS.
#
#   (cambiar los DNS en IONOS y esperar a que se vean: este guion lo comprueba)
#
#   ssh -t -i ~/.ssh/ggomez_vps root@87.106.229.29 bash /root/padel-migracion/configurar-correo-plesk.sh activar
#     6. Comprueba que el MX y el SPF ya apuntan al Plesk.
#     7. Pone el SMTP del Plesk en las funciones (CORREO_SMTP_*) y en las cuentas
#        (SMTP_*), con copia de seguridad, y recrea los dos contenedores.
#        RESEND_API_KEY se queda de reserva: si el Plesk falla, sale por Resend.
#     8. Manda un correo de reserva de prueba y uno de "recuperar contraseña".
#
# Para volver atrás en "activar": restaurar las copias .bak.<fecha> de .env y de
# volumes/functions/.env.secrets y recrear los contenedores de funciones y cuentas.
set -euo pipefail

DOMINIO=padelmedina.com
IP=87.106.229.29
# Nombre del servidor de correo del Plesk: su certificado es válido para este nombre.
SMTP_HOST=mail.ggomezstudio.es
SMTP_PUERTO=465
STACK=/root/padel-migracion/stack
# Buzón creado con contraseña aleatoria (BUZON=... y CLAVE=..., permisos 600).
FICHERO=/root/padel-migracion/.correo-$DOMINIO

preguntar_buzon() {
  read -r -p "Buzón que envía [reservas@$DOMINIO]: " BUZON
  BUZON=${BUZON:-reservas@$DOMINIO}
  [[ "$BUZON" == *"@$DOMINIO" ]] || { echo "Tiene que ser @$DOMINIO"; exit 1; }
}

preguntar_clave() {
  read -r -s -p "$1" CLAVE; echo
  [ -n "$CLAVE" ] || { echo "Contraseña vacía"; exit 1; }
  case "$CLAVE" in *"'"*|*$'\n'*) echo "La contraseña no puede llevar comillas simples (')."; exit 1;; esac
}

# ¿El servidor de correo acepta este usuario y contraseña? (no manda nada)
probar_login() {
  local auth resp
  auth=$(printf '\0%s\0%s' "$BUZON" "$CLAVE" | base64 -w0)
  resp=$( { printf 'EHLO padelmedina.com\r\n'; sleep 2; printf 'AUTH PLAIN %s\r\n' "$auth"; sleep 3; printf 'QUIT\r\n'; } \
    | timeout 20 openssl s_client -quiet -connect "$SMTP_HOST:$SMTP_PUERTO" -servername "$SMTP_HOST" 2>/dev/null \
    | grep -E '^(235|535|5[0-9][0-9]) ' || true)
  grep -q '^235' <<<"$resp" || { echo "El servidor de correo NO acepta $BUZON: ${resp:-sin respuesta}"; return 1; }
  echo "OK: $BUZON inicia sesión en $SMTP_HOST."
}

preparar() {
  echo "== 1. Correo y DKIM de $DOMINIO en el Plesk"
  plesk bin domain --update "$DOMINIO" -mail_service true >/dev/null
  plesk bin domain_pref --update "$DOMINIO" -sign_outgoing_mail true >/dev/null
  (plesk bin domain --info "$DOMINIO" | grep 'Mail service:') || true

  echo "== 2. Buzón"
  preguntar_buzon
  if plesk bin mail --info "$BUZON" >/dev/null 2>&1; then
    echo "$BUZON ya existe: no se cambia su contraseña."
    preguntar_clave "Contraseña ACTUAL de $BUZON (para comprobarla): "
  else
    preguntar_clave "Contraseña nueva para $BUZON (no se ve al escribir): "
    read -r -s -p "Repítela: " CLAVE2; echo
    [ "$CLAVE" = "$CLAVE2" ] || { echo "No coinciden"; exit 1; }
    unset CLAVE2
    # PSA_PASSWORD: la contraseña no aparece en la línea de órdenes (ps).
    PSA_PASSWORD="$CLAVE" plesk bin mail --create "$BUZON" -mailbox true -passwd '' >/dev/null
    echo "Creado $BUZON."
  fi

  echo "== 3. info@$DOMINIO"
  if plesk bin mail --info "info@$DOMINIO" >/dev/null 2>&1; then
    echo "info@$DOMINIO ya existe: no se toca."
  else
    read -r -p "¿Crear info@$DOMINIO como reenvío a padelmedina@hotmail.com? [S/n]: " R
    if [[ ! "$R" =~ ^[nN] ]]; then
      plesk bin mail --create "info@$DOMINIO" -mailbox false -forwarding true \
        -forwarding-addresses add:padelmedina@hotmail.com >/dev/null
      echo "info@$DOMINIO reenvía a padelmedina@hotmail.com."
    fi
  fi

  echo "== 4. Inicio de sesión"
  probar_login
  unset CLAVE

  echo "== 5. DNS para IONOS (Dominios > padelmedina.com > DNS)"
  local clave_dkim=/etc/domainkeys/$DOMINIO/default p=""
  for _ in $(seq 1 15); do [ -s "$clave_dkim" ] && break; sleep 2; done
  if [ -s "$clave_dkim" ]; then
    p=$(openssl rsa -in "$clave_dkim" -pubout 2>/dev/null | grep -v '^-----' | tr -d '\n')
  fi
  cat <<EOF

  BORRAR:
    MX    @   mx00.ionos.es
    MX    @   mx01.ionos.es
    (Si IONOS no deja borrarlos, en la configuración DNS del dominio hay que
     elegir "Otro proveedor de correo" / desactivar el correo de IONOS.)

  AÑADIR / CAMBIAR:
    MX    @                    $SMTP_HOST            prioridad 10
    TXT   @                    v=spf1 ip4:$IP mx ~all
          (sustituye al que hay, "v=spf1 include:_spf-eu.ionos.com ~all":
           solo puede haber UN registro SPF)
    TXT   default._domainkey   v=DKIM1; k=rsa; p=${p:-<NO SE ENCONTRÓ LA CLAVE: mirar en Plesk > Correo > Configuración > DKIM>}

  DEJAR COMO ESTÁ: el A de la web, los TXT de google-site-verification, _dmarc
  y los registros de send.$DOMINIO / resend._domainkey (son de Resend, la reserva).

  Cuando estén puestos (tarda de minutos a un par de horas), lanza la fase "activar".
EOF
}

activar() {
  cd "$STACK"
  echo "== 6. ¿Se ven ya los DNS nuevos?"
  local mx spf dkim
  mx=$(dig +short @1.1.1.1 MX "$DOMINIO" | awk '{print $2}' | sed 's/\.$//' | sort | tr '\n' ' ')
  spf=$(dig +short @1.1.1.1 TXT "$DOMINIO" | grep -i 'v=spf1' || true)
  dkim=$(dig +short @1.1.1.1 TXT "default._domainkey.$DOMINIO" | head -c 40 || true)
  echo "MX:   $mx"; echo "SPF:  $spf"; echo "DKIM: ${dkim:-(no está)}"
  if [[ "$mx" != *"$SMTP_HOST"* || "$spf" != *"$IP"* ]]; then
    echo "Todavía no: el MX tiene que ser $SMTP_HOST y el SPF tiene que llevar $IP."
    [ -t 0 ] || exit 1
    read -r -p "¿Seguir de todas formas? (los correos podrían ir a spam) [s/N]: " R
    [[ "$R" =~ ^[sS] ]] || exit 1
  fi

  echo "== 7. Configuración de la app"
  # Si el buzón se creó con contraseña aleatoria, está en $FICHERO (solo root)
  # y no se pregunta nada. Correo de prueba: segundo argumento o se pregunta.
  if [ -s "$FICHERO" ]; then
    # shellcheck disable=SC1090
    . "$FICHERO"
    echo "Buzón $BUZON (contraseña en $FICHERO)."
  else
    preguntar_buzon
    preguntar_clave "Contraseña de $BUZON: "
  fi
  probar_login
  PRUEBA=${2:-}
  [ -n "$PRUEBA" ] || [ ! -t 0 ] || read -r -p "Correo para la prueba (de una cuenta de la app, p. ej. el tuyo): " PRUEBA

  local env=.env secretos=volumes/functions/.env.secrets fecha
  fecha=$(date +%Y%m%d-%H%M%S)
  cp -p "$env" "$env.bak.$fecha"
  cp -p "$secretos" "$secretos.bak.$fecha"
  echo "Copias: $env.bak.$fecha y $secretos.bak.$fecha"

  # Cambia (o añade) CLAVE='valor' sin sed (la contraseña puede llevar / & \ ...).
  poner() {
    local fichero=$1 k=$2 v=$3 tmp
    tmp=$(mktemp)
    grep -v "^$k=" "$fichero" > "$tmp" || true
    printf "%s='%s'\n" "$k" "$v" >> "$tmp"
    cat "$tmp" > "$fichero"   # conserva dueño y permisos
    rm -f "$tmp"
  }
  poner "$secretos" CORREO_SMTP_HOST "$SMTP_HOST"
  poner "$secretos" CORREO_SMTP_PUERTO "$SMTP_PUERTO"
  poner "$secretos" CORREO_SMTP_USUARIO "$BUZON"
  poner "$secretos" CORREO_SMTP_CLAVE "$CLAVE"
  poner "$secretos" CORREO_REMITENTE "Padel Medina <$BUZON>"
  poner "$env" SMTP_HOST "$SMTP_HOST"
  poner "$env" SMTP_PORT "$SMTP_PUERTO"
  poner "$env" SMTP_USER "$BUZON"
  poner "$env" SMTP_PASS "$CLAVE"
  poner "$env" SMTP_ADMIN_EMAIL "$BUZON"

  local funciones cuentas e1=? e2=? l1 l2
  funciones=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' supabase-edge-functions)
  cuentas=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' supabase-auth)
  docker compose up -d --force-recreate --no-deps "$funciones" "$cuentas"
  for _ in $(seq 1 30); do
    e1=$(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions 2>/dev/null || echo ?)
    e2=$(docker inspect -f '{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo ?)
    [ "$e1" = healthy ] && [ "$e2" = healthy ] && break
    sleep 2
  done
  echo "Funciones: $e1 · Cuentas: $e2"
  # La contraseña llegó entera a los dos contenedores (se compara la longitud).
  l1=$(docker exec supabase-edge-functions sh -c 'printf %s "$CORREO_SMTP_CLAVE" | wc -c')
  l2=$(docker exec supabase-auth sh -c 'printf %s "$GOTRUE_SMTP_PASS" | wc -c')
  echo "Contraseña en funciones: $([ "$l1" = "${#CLAVE}" ] && echo bien || echo "MAL ($l1 de ${#CLAVE})") · en cuentas: $([ "$l2" = "${#CLAVE}" ] && echo bien || echo "MAL ($l2 de ${#CLAVE})")"
  unset CLAVE

  [ -n "$PRUEBA" ] || { echo "Sin correo de prueba: listo."; return; }
  echo "== 8. Pruebas"
  local kong servicio anon
  kong=$(grep '^KONG_HTTP_PORT=' "$env" | cut -d= -f2 | tr -d "\047\"")
  servicio=$(grep '^SERVICE_ROLE_KEY=' "$env" | cut -d= -f2- | tr -d "\047\"")
  anon=$(grep '^ANON_KEY=' "$env" | cut -d= -f2- | tr -d "\047\"")
  sleep 3
  echo "Correo de reserva (send-booking-email):"
  curl -sS --max-time 40 -X POST "http://$kong/functions/v1/send-booking-email" \
    -H "Authorization: Bearer $servicio" -H "apikey: $servicio" -H 'Content-Type: application/json' \
    -d "{\"type\":\"confirmation\",\"email\":\"$PRUEBA\",\"userName\":\"Prueba Plesk\",\"courtName\":\"Pista de prueba\",\"date\":\"$(date +%F)\",\"timeSlot\":\"10:00 - 11:30\"}"
  echo
  docker logs --since 2m supabase-edge-functions 2>&1 | grep -E 'Email \(|Correo por|Resend' | tail -3
  echo "Correo de recuperar contraseña (cuentas):"
  curl -sS --max-time 40 -o /dev/null -w "respuesta %{http_code}\n" -X POST "http://$kong/auth/v1/recover" \
    -H "apikey: $anon" -H 'Content-Type: application/json' -d "{\"email\":\"$PRUEBA\"}"
  sleep 3
  docker logs --since 2m supabase-auth 2>&1 | grep -iE 'mail|smtp' | grep -iE 'error|fail' | tail -3 || true
  echo "Mira la bandeja de $PRUEBA (y el spam): tienen que llegar los dos, desde $BUZON."
  echo "El log de la prueba de reserva debe decir 'via smtp'. Si dice 'via resend', el Plesk falló y salió por la reserva."
}

case "${1:-}" in
  preparar) preparar ;;
  activar) activar "$@" ;;
  *) echo "Uso: $0 preparar | activar"; exit 1 ;;
esac
