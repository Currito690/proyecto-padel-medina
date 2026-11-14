-- Número de revisión del config de cada torneo (14/11/2026).
--
-- Un panel con una copia vieja del torneo (una pestaña sin recargar desde
-- antes de un despliegue, o el panel que va dentro de la app de las tiendas)
-- podía guardar el config ENTERO encima de lo bueno: el 13/11 a las 17:00
-- una copia vieja deshizo los cuadros de casi todas las categorías.
--
-- Desde ahora cada guardado del panel sube `config_rev` en uno y solo se
-- aplica si la base de datos sigue en la revisión que esa pantalla conoce.
-- Este paso SOLO añade la columna: no cambia nada de lo que funciona hoy (los
-- paneles que no la conocen siguen guardando igual). La regla que rechaza los
-- guardados sin revisión va en 20261114100100_tournaments_guarda_config.sql y
-- se aplica DESPUÉS de subir la web que ya manda la revisión.

alter table public.tournaments
  add column if not exists config_rev integer not null default 0;

comment on column public.tournaments.config_rev is
  'Revisión del config. El panel la sube en uno en cada guardado (compare-and-swap); el disparador trg_tournaments_guarda_config rechaza los guardados de paneles que no la traen.';

-- La API (PostgREST) tiene que conocer la columna: si no, los guardados del
-- panel nuevo, que la mandan, fallarían con PGRST204. Se puede repetir.
notify pgrst, 'reload schema';
