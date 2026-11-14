-- "Dar de baja" a un jugador solo se aplicaba en la pantalla: la API seguia
-- aceptando sus reservas. Este trigger rechaza en la base de datos cualquier
-- reserva creada por un usuario marcado como banned, salvo que la cree un admin
-- (el admin puede seguir reservando para quien sea).

CREATE OR REPLACE FUNCTION public.bookings_rechaza_baneados()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Los admin pueden crear reservas para cualquiera.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND banned IS TRUE
  ) THEN
    RAISE EXCEPTION 'Tu cuenta esta dada de baja y no puede hacer reservas. Contacta con el club.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bookings_rechaza_baneados ON public.bookings;
CREATE TRIGGER trg_bookings_rechaza_baneados
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_rechaza_baneados();
