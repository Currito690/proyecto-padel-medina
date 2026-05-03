-- Trigger automático que llama a la edge function `send-registration-admin-notify`
-- cada vez que se inserta una nueva inscripción. De esta forma el aviso al
-- club por correo no depende del navegador del jugador (que puede cerrar la
-- pestaña, redirigir al TPV, etc.). Lo dispara directamente Postgres vía pg_net.

create extension if not exists pg_net with schema extensions;

-- Función que construye el payload y hace el POST a la edge function.
-- IMPORTANTE: la URL y la apikey son del proyecto y no varían — pg_net no
-- soporta secrets/env vars, así que van inline.
create or replace function public.notify_admin_on_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Endpoint de la edge function en este mismo proyecto.
  function_url text := 'https://iquibawtbpamhaottlbr.supabase.co/functions/v1/send-registration-admin-notify';
  -- Anon key del proyecto. Las edge functions exigen un Bearer token.
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxdWliYXd0YnBhbWhhb3R0bGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTYzMjMsImV4cCI6MjA4OTU3MjMyM30.siN7_iEwEJyBd6Ksah6wQ_QtrpTAxKoGudRCxFYX75c';
  tournament_name text;
  payload jsonb;
begin
  -- Cogemos el nombre del torneo de la tabla tournaments para que el correo
  -- al admin diga "Nueva inscripción - Torneo Verano 2026" en lugar de un id.
  select coalesce(name, 'Torneo') into tournament_name
  from public.tournaments
  where id = new.tournament_id;

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
    'amount',             new.amount_paid,
    'registrationsUrl',   'https://padelmedina.com/admin'
  );

  -- pg_net es asíncrono: encola la petición y devuelve un id. Si falla la
  -- petición HTTP no rompe el INSERT, solo queda el log en net.http_request_queue.
  perform net.http_post(
    url     := function_url,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || anon_key
    ),
    body    := payload
  );

  return new;
end;
$$;

-- Trigger AFTER INSERT: solo dispara cuando la fila ya está commiteada.
drop trigger if exists trg_notify_admin_on_new_registration on public.tournament_registrations;
create trigger trg_notify_admin_on_new_registration
after insert on public.tournament_registrations
for each row execute function public.notify_admin_on_new_registration();
