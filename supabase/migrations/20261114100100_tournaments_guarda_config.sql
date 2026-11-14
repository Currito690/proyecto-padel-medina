-- Un panel antiguo o con una copia vieja ya no puede pisar el torneo (14/11/2026).
--
-- Requisitos: 20261114100000_tournaments_config_rev.sql aplicada y la web que
-- manda `config_rev` ya subida (si no, el panel de la web tampoco podría
-- guardar). Orden: columna → web → esta regla.
--
-- Regla, para las peticiones de la app (rol 'authenticated' o 'anon'):
--   si el guardado cambia el config (o la revisión), tiene que traer
--   exactamente la revisión siguiente a la que hay. El panel nuevo lo hace
--   siempre; el panel antiguo (pestañas sin recargar, la app de las tiendas
--   hasta que se actualice) no manda revisión, así que no puede cambiar el
--   config: le sale un error y el torneo queda intacto.
--   Los cambios que no tocan el config (nombre, estado) siguen igual.
-- Las escrituras del servidor (SQL a mano desde psql, funciones con la clave
-- de servicio) no se frenan: si cambian el config sin subir la revisión, se
-- sube aquí, para que los paneles abiertos se enteren del cambio.
--
-- Deshacer al momento si diera problemas:
--   drop trigger if exists trg_tournaments_guarda_config on public.tournaments;

create or replace function public.tournaments_guarda_config()
returns trigger
language plpgsql
as $$
declare
  rol text := coalesce(auth.role(), '');
begin
  if rol in ('authenticated', 'anon') then
    if new.config is distinct from old.config
       or new.config_rev is distinct from old.config_rev then
      if new.config_rev is distinct from old.config_rev + 1 then
        raise exception using
          errcode = 'P0001',
          message = 'PANEL_DESACTUALIZADO',
          detail = 'El torneo ha cambiado desde que se abrió esta pantalla, o el panel es de una versión antigua.',
          hint = 'Recarga la página (o pulsa «Cargar lo último») y repite el cambio.';
      end if;
    end if;
  elsif new.config is distinct from old.config
        and new.config_rev is not distinct from old.config_rev then
    new.config_rev := old.config_rev + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tournaments_guarda_config on public.tournaments;
create trigger trg_tournaments_guarda_config
  before update on public.tournaments
  for each row execute function public.tournaments_guarda_config();
