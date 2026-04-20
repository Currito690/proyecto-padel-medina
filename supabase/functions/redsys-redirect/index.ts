import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  // Redsys hace un POST con los parámetros de la transacción.
  // Vercel u otros hostings estáticos devuelven 404/405 a peticiones POST en rutas del frontend.
  // Esta función intercepta el POST y devuelve una redirección GET (303) al frontend.

  const urlParts = req.url.split('?to=');
  let target = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : null;

  if (!target) {
    target = 'https://padelmedina.com/mis-reservas'; // fallback seguro
  }

  return new Response(null, {
    status: 303, // 303 See Other convierte POST en GET
    headers: {
      Location: target,
    },
  });
});
