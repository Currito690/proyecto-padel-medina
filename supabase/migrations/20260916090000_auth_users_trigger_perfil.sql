-- 2026-09-16: el trigger que crea el perfil al registrarse vive en auth.users y
-- no vino en el volcado del cloud al Plesk (la función public.handle_new_user sí).
-- Sin él, los usuarios nuevos existen en auth.users pero no en public.profiles:
-- en el panel salen como "Cliente" y no aparecen en la lista de usuarios.
-- Este script es idempotente: recrea el trigger y rellena los perfiles que falten.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, name, role, created_at)
SELECT u.id, u.email,
       COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
       CASE WHEN u.email ILIKE '%admin%' THEN 'admin' ELSE 'client' END,
       u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
