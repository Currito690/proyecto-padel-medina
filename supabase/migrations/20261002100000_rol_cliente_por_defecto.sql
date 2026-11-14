-- Las altas nuevas son SIEMPRE 'client'. Antes, cualquier correo que CONTUVIERA
-- la palabra "admin" (p. ej. "badminton@..." o "admin.lopez@gmail.com") recibia
-- rol de administrador al registrarse: un agujero de seguridad. Los admin se
-- promocionan a mano con UPDATE profiles SET role='admin' WHERE email='...'.
-- Hay que reaplicar este trigger tras cualquier restauracion de la base de datos.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = 'admin@padelmedina.com' THEN 'admin'
      ELSE 'client'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
