-- Aviso al club por nueva inscripción (trigger de 20260503100000): importe
-- correcto y llamada autenticada a la edge function.
--
-- Qué cambia (solo la función; el trigger trg_notify_admin_on_new_registration
-- sigue siendo el ÚNICO camino que avisa al club):
--   1) Importe: antes mandaba new.amount_paid, que al insertar es siempre NULL,
--      así que el correo salía sin importe ("⏳ Pendiente · Tarjeta"). Ahora
--      manda la cuota del torneo por pareja (config.registrationFeeAmount × 2),
--      o amount_paid si ya viniera informado (inserción manual del admin).
--      Si el pago no aplica (not_required) o no hay cuota, va NULL como antes.
--   2) Seguridad: send-registration-admin-notify ahora comprueba quién llama.
--      El trigger no tiene sesión de admin, así que manda un secreto
--      compartido en la cabecera x-notify-secret, leído del Vault de Supabase.
--
-- PASOS DE DESPLIEGUE (una vez):
--   a) Genera un valor aleatorio largo y guárdalo en el Vault:
--        select vault.create_secret('<valor>', 'registration_notify_secret');
--   b) Ponlo también como secret de la función y redespliega:
--        npx supabase secrets set REGISTRATION_NOTIFY_SECRET=<valor>
--        npx supabase functions deploy send-registration-admin-notify
--   Mientras la función no tenga REGISTRATION_NOTIFY_SECRET acepta la llamada
--   igualmente (solo avisa en el log), así que el club no se queda sin correos
--   durante la transición. Si el Vault no está disponible o no existe el
--   secreto, el trigger sigue llamando sin la cabecera.

create or replace function public.notify_admin_on_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Endpoint de la edge function en este mismo proyecto.
  function_url text := 'https://iquibawtbpamhaottlbr.supabase.co/functions/v1/send-registration-admin-notify';
  -- Anon key del proyecto: el gateway de edge functions exige un Bearer JWT.
  -- La autorización real la da x-notify-secret (ver arriba).
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxdWliYXd0YnBhbWhhb3R0bGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTYzMjMsImV4cCI6MjA4OTU3MjMyM30.siN7_iEwEJyBd6Ksah6wQ_QtrpTAxKoGudRCxFYX75c';
  tournament_name text;
  fee_txt text;
  fee_total numeric := 0;
  amount_out numeric;
  notify_secret text;
  req_headers jsonb;
  payload jsonb;
begin
  -- Nombre del torneo y cuota por jugador desde tournaments.config.
  select coalesce(name, 'Torneo'), config ->> 'registrationFeeAmount'
    into tournament_name, fee_txt
  from public.tournaments
  where id = new.tournament_id;

  -- Cuota por pareja (2 jugadores), igual que calcula la web. Solo si el
  -- valor es numérico; una config antigua o vacía no rompe el INSERT.
  if fee_txt is not null and fee_txt ~ '^\d+([.]\d+)?$' then
    fee_total := (fee_txt::numeric) * 2;
  end if;

  amount_out := new.amount_paid;
  if amount_out is null
     and coalesce(new.payment_status, 'not_required') <> 'not_required'
     and fee_total > 0 then
    amount_out := fee_total;
  end if;

  payload := jsonb_build_object(
    'tournamentName',     coalesce(tournament_name, 'Torneo'),
    'category',           new.category,
    'player1Name',        new.player1_name,
    'player2Name',        new.player2_name,
    'player1Email',       new.player1_email,
    'player2Email',       new.player2_email,
    'player1Phone',       new.player1_phone,
    'player2Phone',       new.player2_phone,
    'player1ShirtSize',   new.player1_shirt_size,
    'player2ShirtSize',   new.player2_shirt_size,
    'paymentStatus',      new.payment_status,
    'paymentMethod',      new.payment_method,
    'amount',             amount_out,
    'registrationsUrl',   'https://padelmedina.com/admin'
  );

  -- Secreto compartido con la edge function (Vault). Si no está, seguimos
  -- sin cabecera: la función avisa en el log pero no deja al club sin correo.
  begin
    select decrypted_secret into notify_secret
    from vault.decrypted_secrets
    where name = 'registration_notify_secret'
    limit 1;
  exception when others then
    notify_secret := null;
  end;

  req_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || anon_key
  );
  if notify_secret is not null and notify_secret <> '' then
    req_headers := req_headers || jsonb_build_object('x-notify-secret', notify_secret);
  end if;

  -- pg_net es asíncrono: encola la petición y devuelve un id. Si falla la
  -- petición HTTP no rompe el INSERT, solo queda el log en net.http_request_queue.
  perform net.http_post(
    url     := function_url,
    headers := req_headers,
    body    := payload
  );

  return new;
end;
$$;
