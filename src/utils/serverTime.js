// Sincronización con la hora del servidor.
// La idea: el reloj del dispositivo puede ir mal (cambiado a mano, deriva,
// zona horaria rara). Para las comprobaciones críticas (plazo de inscripción,
// orden cronológico, etc.) queremos saber "qué hora es de verdad", no qué
// dice el reloj del navegador.
//
// Fuente: la cabecera HTTP `Date` de una respuesta de Supabase. Toda
// respuesta HTTP incluye la fecha del servidor en formato RFC 7231. Hacemos
// una petición HEAD ligera al montar la app y calculamos el offset
// (servidor − cliente) compensando la mitad del round-trip.

import { useState, useEffect } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Offset en ms: serverNow() = Date.now() + offset
let offset = 0;
let synced = false;
const listeners = new Set();

export const syncServerTime = async () => {
  try {
    const t0 = Date.now();
    // /auth/v1/health responde 200 (el raíz de /rest/v1/ devolvía 401 y
    // ensuciaba la consola en cada carga; solo necesitamos la cabecera Date).
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: ANON_KEY },
    });
    const t1 = Date.now();
    const serverDateStr = res.headers.get('Date');
    if (!serverDateStr) return;
    const serverMs = new Date(serverDateStr).getTime();
    if (!Number.isFinite(serverMs)) return;
    // Compensamos la latencia: asumimos que la respuesta se generó en el
    // punto medio del round-trip.
    const clientMid = (t0 + t1) / 2;
    offset = serverMs - clientMid;
    synced = true;
    listeners.forEach(fn => { try { fn(); } catch (_) { /* ignore */ } });
  } catch (e) {
    // Si falla la sincronización seguimos con offset=0 (reloj del cliente).
    console.warn('syncServerTime failed:', e?.message || e);
  }
};

// Re-sincroniza cada 30 min (suficiente para corregir derivas; el reloj
// del cliente no va a saltar minutos en ese tiempo salvo manipulación
// manual, en cuyo caso la próxima sync lo corregirá).
let syncInterval = null;
export const startServerTimeSync = () => {
  if (syncInterval) return;
  syncServerTime();
  syncInterval = setInterval(syncServerTime, 30 * 60 * 1000);
};

// Hora oficial actual (Date). Usa offset del servidor si está sincronizado;
// si no, cae al reloj del cliente.
export const serverNow = () => new Date(Date.now() + offset);
export const serverNowMs = () => Date.now() + offset;
export const isServerTimeSynced = () => synced;

// Fecha de HOY en formato YYYY-MM-DD usando la hora LOCAL (nunca toISOString,
// que es UTC: en España, de 00:00 a 02:00 devolvería el día ANTERIOR y la app
// "no se enteraría" de que ya cambió el día).
export const serverToday = () => {
  const d = serverNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Hook React: re-renderiza periódicamente con la hora oficial.
// refreshMs por defecto 30s — suficiente para un reloj visible al admin.
export const useServerTime = (refreshMs = 30000) => {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const tick = () => setNow(serverNow());
    const id = setInterval(tick, refreshMs);
    listeners.add(tick);
    return () => {
      clearInterval(id);
      listeners.delete(tick);
    };
  }, [refreshMs]);
  return now;
};

// Formato corto para mostrar al admin: "mié 06/05 14:32"
export const formatNowShort = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]} ${dd}/${mm} · ${hh}:${mi}`;
};
