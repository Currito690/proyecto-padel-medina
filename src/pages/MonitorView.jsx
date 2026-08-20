import { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/notify';

const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// ── Helpers del informe mensual del monitor ──────────────────────────────────
const MESES_M = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmtHorasM = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};
const slotIntervalM = (ymd, slotStr) => {
  const [a, b] = slotStr.split(' - ');
  return [new Date(`${ymd}T${a}:00`).getTime(), new Date(`${ymd}T${b}:00`).getTime()];
};
const mergeIntsM = (ints) => {
  const s = [...ints].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
};
const overlapM = (a1, a2, ints) =>
  ints.reduce((s, [b1, b2]) => s + Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)), 0);
const mondayOf = (ymd) => {
  const dt = new Date(ymd + 'T12:00:00');
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const ddmm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

// Vista de SOLO LECTURA para el rol 'monitor' (lolo). Muestra el día separado
// POR PISTAS (2 columnas), con cada franja ocupada coloreada según su tipo:
// reservada (rojo), bloqueada (ámbar) o entreno (azul).

const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatLong(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${d} de ${MONTHS[m - 1]}`;
}

// Mismos colores que el horario del admin: azul = pagada con tarjeta/bizum,
// rojo = pago en club / manual, gris = bloqueada, morado = entreno.
const TIPO = {
  reservaOnline: { label: 'Reservada', emoji: '💳', bg: '#EFF6FF', border: '#93C5FD', color: '#2563EB' },
  reserva: { label: 'Reservada', emoji: '🎾', bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626' },
  bloqueo: { label: 'Bloqueada', emoji: '🔒', bg: '#F1F5F9', border: '#CBD5E1', color: '#64748B' },
  entreno: { label: 'Entreno', emoji: '🏋️', bg: '#FAF5FF', border: '#D8B4FE', color: '#9333EA' },
};

const LEYENDA = [
  { label: 'Tarjeta / Bizum', t: TIPO.reservaOnline },
  { label: 'Club / Manual', t: TIPO.reserva },
  { label: 'Bloqueada', t: TIPO.bloqueo },
  { label: 'Entreno', t: TIPO.entreno },
];

// Cómo se pagó la reserva (mismas etiquetas que en el panel del admin)
const METODO = {
  tarjeta: '💳 Tarjeta',
  bizum: '📱 Bizum',
  club: '🏪 Pago en club',
  gratis: '🎁 Gratis',
  manual: '✍️ Manual',
};

export default function MonitorView() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [courts, setCourts] = useState([]); // [{id,name,slots:[{time,tipo,note}]}]
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const [bk, bl, ct] = await Promise.all([
        supabase.from('bookings').select('court_id, time_slot, observaciones, status, user_id, metodo_pago, created_at').eq('date', d),
        supabase.from('blocked_slots').select('court_id, time_slot, tipo, entreno_grupo').eq('date', d),
        supabase.from('courts').select('id, name'),
      ]);

      // Nombres de quienes reservaron (para mostrárselos al monitor).
      const userIds = [...new Set((bk.data || []).map((b) => b.user_id).filter(Boolean))];
      let nameById = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', userIds);
        nameById = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
      }

      const byCourt = {};
      (ct.data || []).forEach((c) => { byCourt[c.id] = { id: c.id, name: c.name, slots: [] }; });
      const ensure = (cid) => byCourt[cid] || (byCourt[cid] = { id: cid, name: 'Pista', slots: [] });
      (bk.data || []).forEach((b) => {
        if (b.status === 'cancelled') return;
        // Holds 'pendiente_pago' solo cuentan 15 min (jugador pagando en el banco)
        if (b.status === 'pendiente_pago' && (Date.now() - new Date(b.created_at).getTime()) > 15 * 60 * 1000) return;
        const who = b.status === 'pendiente_pago' ? '⏳ Pago en curso' : (b.observaciones || nameById[b.user_id] || '');
        ensure(b.court_id).slots.push({ time: b.time_slot, tipo: 'reserva', note: who, metodo: b.metodo_pago });
      });
      (bl.data || []).forEach((s) => {
        const GRUPO = { individual: 'Individual', grupo2: 'Grupo 2', grupo3: 'Grupo 3', grupo4: 'Grupo 4' };
        ensure(s.court_id).slots.push({
          time: s.time_slot,
          tipo: s.tipo === 'entreno' ? 'entreno' : 'bloqueo',
          note: s.tipo === 'entreno' ? (GRUPO[s.entreno_grupo] || '') : '',
          grupo: s.entreno_grupo || null,
        });
      });
      const list = Object.values(byCourt).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
      list.forEach((c) => c.slots.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
      setCourts(list);
    } catch {
      setCourts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // ── Fichaje (control horario del trabajador) ────────────────────────────
  // La HORA la pone el servidor (default now() en BD); aquí solo se captura
  // la ubicación GPS del dispositivo al fichar.
  const [fichajes, setFichajes] = useState([]); // los de HOY
  const [fichando, setFichando] = useState(false);

  // Desde cuándo cuentan los fichajes "de hoy": medianoche LOCAL en ISO (el
  // literal "T00:00:00" a secas lo interpreta Postgres como UTC y se comería
  // los de 00:00-02:00 españolas), PERO nunca menos de 12h atrás — así una
  // salida pasada la medianoche (entrada 23:00 → salida 00:30) sigue viendo
  // su entrada y el turno se puede cerrar.
  const desdeFichajes = () => {
    const medianoche = new Date(`${toYMD(new Date())}T00:00:00`).getTime();
    return new Date(Math.min(medianoche, Date.now() - 12 * 3600 * 1000)).toISOString();
  };

  const retryFichajesRef = useRef(null);
  const loadFichajes = useCallback(async (reintento = false) => {
    if (!user?.id) return;
    clearTimeout(retryFichajesRef.current); // una carga nueva anula el reintento pendiente
    const consulta = (cols) => supabase
      .from('fichajes')
      .select(cols)
      .eq('user_id', user.id)
      .gte('fichado_at', desdeFichajes())
      .order('fichado_at', { ascending: true });
    let { data, error } = await consulta('id, tipo, fichado_at, lat, lng, manual, hora_original');
    // BD sin migrar: reintentar quitando SOLO la columna cuya migración falte
    // (nunca ante un fallo de red: cargaría turnos manuales como fichajes
    // reales y cambiaría el botón).
    if (error && /hora_original/i.test(error.message || '')) ({ data, error } = await consulta('id, tipo, fichado_at, lat, lng, manual'));
    if (error && /manual/i.test(error.message || '')) ({ data, error } = await consulta('id, tipo, fichado_at, lat, lng'));
    if (error) {
      // Red inestable (datos móviles): un único reintento a los 4s para que
      // el botón de entrada/salida no se quede con un estado viejo
      if (!reintento) setTimeout(() => loadFichajes(true), 4000);
      return;
    }
    setFichajes(data || []);
  }, [user?.id]);
  useEffect(() => {
    loadFichajes();
    const ref = retryFichajesRef;
    return () => clearTimeout(ref.current); // sin reintentos huérfanos al salir
  }, [loadFichajes]);

  // El estado del botón sale SOLO de los fichajes REALES del trabajador: un
  // turno manual que apunte el admin (aunque sea de hoy) no debe cambiarle el
  // botón de entrada/salida ni el "trabajando desde…".
  const fichajesReales = fichajes.filter(f => !f.manual);
  const ultimoFichaje = fichajesReales[fichajesReales.length - 1];
  const trabajando = ultimoFichaje?.tipo === 'entrada';

  // El fichaje NO es un simple botón: el trabajador debe FIRMAR. El botón abre
  // el panel de firma y solo al confirmar la firma se registra (con GPS+hora).
  const [firmando, setFirmando] = useState(false); // tipo pendiente: 'entrada'|'salida'|null

  // ── Permiso de ubicación: si el navegador lo tiene BLOQUEADO, los fichajes
  // salen sin 📍 y nadie sabía por qué. Aquí se comprueba y se avisa claro.
  // Además, al abrir la vista se pide una posición una vez: así el aviso de
  // permiso del navegador sale en un momento tranquilo (no en mitad de la
  // firma) y el sistema deja caché de posición caliente para el fichaje.
  const [gpsPermiso, setGpsPermiso] = useState(null); // 'granted'|'denied'|'prompt'|null
  useEffect(() => {
    let st = null, cancelado = false;
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((s) => {
          if (cancelado) return;
          st = s;
          setGpsPermiso(s.state);
          s.onchange = () => setGpsPermiso(s.state);
        })
        .catch(() => {});
    }
    if (navigator.geolocation) {
      try {
        navigator.geolocation.getCurrentPosition(() => {}, () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
      } catch { /* sin geolocalización */ }
    }
    return () => { cancelado = true; if (st) st.onchange = null; };
  }, []);

  // Con el móvil QUIETO en interior, el navegador a veces no contesta a la
  // petición de GPS (ni éxito ni error, ignorando su propio timeout): el chip
  // GPS no emite posición nueva hasta que el móvil se mueve. Es lo que pasaba
  // al fichar la 2ª vez (la 1ª valía la caché reciente): lolo tenía que
  // ALEJARSE para que el fichaje saliera. Remedio en dos partes:
  //  1) Nada más abrir el panel de firma se empieza a escuchar la posición
  //     (watchPosition): mientras lolo firma, el GPS va cogiendo señal.
  //  2) Al confirmar se usa lo ya captado; si no hay nada se pide de nuevo,
  //     pero con un TOPE DURO de 12s que resuelve SIEMPRE (con lo que haya o
  //     sin ubicación). El botón nunca se queda colgado en «Fichando…».
  const posRef = useRef(null);     // mejor posición captada mientras firma
  const watchIdRef = useRef(null);

  useEffect(() => {
    const parar = () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    if (!firmando || !navigator.geolocation) { parar(); return undefined; }
    posRef.current = null; // posición NUEVA para este fichaje (no la de la vez anterior)
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision_m: pos.coords.accuracy };
          // Quedarse con la lectura más precisa recibida
          if (!posRef.current || (p.precision_m ?? 9999) <= (posRef.current.precision_m ?? 9999)) posRef.current = p;
        },
        () => {},
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
      );
    } catch { /* sin geolocalización: se ofrecerá fichar sin 📍 */ }
    return parar;
  }, [firmando]);

  const getPosicion = () => new Promise((resolve) => {
    if (posRef.current) { resolve(posRef.current); return; } // captada mientras firmaba
    if (!navigator.geolocation) { resolve(null); return; }
    let done = false, tope = null;
    const finish = (p) => {
      if (done) return;
      done = true;
      clearTimeout(tope);
      resolve(p || posRef.current); // lo pedido o, si no, lo que cayera del watch
    };
    // Tope DURO fuera del API: si el navegador no responde, a los 12s se sigue
    tope = setTimeout(() => finish(null), 12000);
    // Dos intentos: GPS fino y, si falla, ubicación aproximada por wifi/antenas;
    // se acepta caché de unos minutos (el club no se mueve y es lo que evita
    // esperar un fix nuevo imposible con el móvil quieto).
    const opciones = [
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 120000 },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    ];
    const intenta = (i) => {
      // try/catch: en algún WebView getCurrentPosition revienta en síncrono y
      // sin esto la promesa quedaría rechazada pese al tope de 12s
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision_m: pos.coords.accuracy }),
          () => (i + 1 < opciones.length ? intenta(i + 1) : finish(null)),
          opciones[i]
        );
      } catch { finish(null); }
    };
    intenta(0);
  });

  // Petición CON TOPE de tiempo: con datos móviles "zombis" (el móvil enseña
  // cobertura pero la conexión está muerta) una petición sin tope se queda
  // colgada minutos y el panel clavado en «Fichando…».
  const conTope = async (build, ms) => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    try { return await build(ctrl.signal); }
    finally { clearTimeout(tid); }
  };

  const registrarFichaje = async (firmaDataUrl) => {
    if (fichando) return;
    if (navigator.onLine === false) {
      toast('Sin conexión a internet: activa el wifi o los datos y vuelve a intentarlo', 'error');
      return;
    }
    setFichando(true);
    // try/finally: pase lo que pase el botón vuelve a estar usable (sin esto
    // un error inesperado dejaba el panel clavado en «Fichando…» para siempre)
    try {
      const tipo = trabajando ? 'salida' : 'entrada';

      // La ubicación NUNCA bloquea el fichaje: si no hay señal (interior sin
      // wifi, GPS frío al salir del turno…) se ficha igualmente sin 📍 y se
      // le avisa. Antes aquí salía un diálogo y lolo lo veía como un error.
      const pos = await getPosicion();

      // Estado FRESCO del servidor justo antes de fichar: con red inestable
      // la lista en pantalla puede estar vieja, y fichar a ciegas duplicaría
      // la entrada (o metería una salida de un turno ya cerrado). Solo cuenta
      // el último fichaje REAL (los turnos manuales del admin no pintan nada
      // aquí) y con la misma ventana horaria que la lista (cubre madrugada).
      const consultaUlt = (cols, conFiltroManual, signal) => {
        let q = supabase
          .from('fichajes')
          .select(cols)
          .eq('user_id', user.id)
          .gte('fichado_at', desdeFichajes());
        if (conFiltroManual) q = q.eq('manual', false);
        return q.order('fichado_at', { ascending: false }).limit(1).abortSignal(signal);
      };
      let ultimoReal = null;
      try {
        let { data, error } = await conTope((s) => consultaUlt('tipo', true, s), 10000);
        // BD sin migrar (sin columna manual): todos los fichajes son reales
        if (error && /manual/i.test(error.message || '')) ({ data, error } = await conTope((s) => consultaUlt('tipo', false, s), 10000));
        if (error) throw error;
        ultimoReal = (data || [])[0] || null;
      } catch {
        toast('No hay conexión estable con el servidor (¿poca cobertura de datos?). Vuelve a intentarlo en unos segundos', 'error');
        return;
      }
      const tipoFresco = ultimoReal?.tipo === 'entrada' ? 'salida' : 'entrada';
      if (tipoFresco !== tipo) {
        // La pantalla iba atrasada (p. ej. el fichaje anterior SÍ llegó
        // aunque su respuesta se perdiera): actualizar y NO duplicar.
        toast(tipo === 'entrada'
          ? 'Ya tenías la entrada fichada (la lista no estaba al día). Se ha actualizado: revisa tus fichajes'
          : 'Tu turno ya estaba cerrado (la lista no estaba al día). Se ha actualizado: revisa tus fichajes', 'error');
        loadFichajes();
        setFirmando(false);
        return;
      }

      let insErr = null;
      try {
        const { error } = await conTope((s) => supabase.from('fichajes').insert({
          user_id: user.id,
          tipo,
          firma: firmaDataUrl,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          precision_m: pos?.precision_m ?? null,
        }).abortSignal(s), 20000);
        insErr = error;
      } catch (e) {
        insErr = e;
      }
      if (insErr) {
        const cortada = insErr?.name === 'AbortError' || /abort/i.test(insErr?.message || '');
        if (cortada) {
          // El fichaje puede haber llegado aunque la respuesta se perdiera:
          // se CIERRA el panel (si quedara abierto, la lista actualizada le
          // cambiaría el sentido al botón de confirmar) y se recarga la
          // lista SIN esperar (la conexión acaba de demostrar que se cuelga).
          toast('La conexión no responde y el fichaje puede haber salido o no. Comprueba la lista y, si no aparece, vuelve a fichar', 'error');
          setFirmando(false);
        } else {
          toast('No se pudo fichar: ' + (insErr.message || insErr), 'error');
        }
        loadFichajes();
      } else {
        const sinGps = pos ? '' : ' (sin ubicación: no había señal GPS)';
        toast(tipo === 'entrada' ? `🟢 Entrada fichada${sinGps}. ¡Buen turno!` : `🔴 Salida fichada${sinGps}. ¡Hasta la próxima!`, 'success');
        setFirmando(false);
        loadFichajes();
      }
    } finally {
      setFichando(false);
    }
  };

  // ── Confirmación de clases: personas, PRECIO de esa clase y cómo pagó
  // cada alumno (tarjeta / bizum / en mano). Lo que confirme lolo manda sobre
  // lo planificado (tabla clases_monitor; el horario sigue siendo solo
  // lectura para él).
  const [clasesConf, setClasesConf] = useState({}); // "courtId|time" -> { personas, precio, pagos }
  const [confGuardando, setConfGuardando] = useState(null);
  const [precioEdits, setPrecioEdits] = useState({}); // "courtId|time" -> texto en edición

  const GRUPO_PERSONAS = { individual: 1, grupo2: 2, grupo3: 3, grupo4: 4 };
  // Precio efectivo de una clase: el suyo propio o, si no tiene, mi tarifa
  // según el nº de personas
  const KEY_TARIFA = { 1: 'individual', 2: 'grupo2', 3: 'grupo3', 4: 'grupo4' };

  // Al cambiar de día rápido pueden llegar respuestas fuera de orden: solo
  // vale la del día que sigue en pantalla (si no, se mostrarían — y GUARDARÍAN
  // al fusionar — precios y pagos de otro día).
  const dateRef = useRef(date);
  useEffect(() => { dateRef.current = date; }, [date]);

  const loadClasesConf = useCallback(async (d) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('clases_monitor')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', d);
    if (dateRef.current !== d) return; // respuesta de un día que ya no se ve
    const m = {};
    (data || []).forEach(c => {
      m[`${c.court_id}|${c.time_slot}`] = {
        personas: c.personas,
        precio: c.precio != null ? Number(c.precio) : null,
        pagos: Array.isArray(c.pagos) ? c.pagos : [],
      };
    });
    setClasesConf(m);
    setPrecioEdits({});
  }, [user?.id]);
  useEffect(() => { loadClasesConf(date); }, [date, loadClasesConf]);

  // Guarda la clase FUSIONANDO lo que ya hay (personas, precio y pagos van
  // juntos en la misma fila; cada botón solo cambia su parte)
  const upsertClase = async (e, patch, okMsg) => {
    const key = `${e.courtId}|${e.time}`;
    const cur = clasesConf[key] || {};
    const personas = patch.personas ?? cur.personas ?? GRUPO_PERSONAS[e.grupo] ?? 1;
    let pagos = [...(patch.pagos ?? cur.pagos ?? [])].slice(0, personas);
    while (pagos.length < personas) pagos.push(null);
    const precio = patch.precio !== undefined ? patch.precio : (cur.precio ?? null);
    setConfGuardando(key);
    let { error } = await supabase.from('clases_monitor').upsert(
      { user_id: user.id, date, time_slot: e.time, court_id: e.courtId, personas, precio, pagos, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date,time_slot,court_id' }
    );
    // BD sin migrar (sin columnas precio/pagos): guardar al menos las personas
    if (error && /precio|pagos/i.test(error.message || '')) {
      toast('Falta aplicar la migración clases_monitor_pagos en Supabase (precio y pagos aún no se guardan)', 'error');
      ({ error } = await supabase.from('clases_monitor').upsert(
        { user_id: user.id, date, time_slot: e.time, court_id: e.courtId, personas, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date,time_slot,court_id' }
      ));
    }
    setConfGuardando(null);
    if (error) { toast('No se pudo guardar: ' + error.message, 'error'); return false; }
    setClasesConf(prev => ({ ...prev, [key]: { personas, precio, pagos } }));
    if (okMsg) toast(okMsg, 'success');
    return true;
  };

  // Si hay un precio a medio editar, se guarda EN EL MISMO viaje que las
  // personas o el pago (así, tocar "3" con el precio recién escrito no pierde
  // ni el click ni el precio).
  const precioPendiente = (key) => {
    const txt = precioEdits[key];
    if (txt === undefined) return {};
    const n = Number(String(txt).replace(',', '.').trim());
    return isFinite(n) && n >= 0 ? { precio: n } : {};
  };
  const limpiarEdicionPrecio = (key) =>
    setPrecioEdits(prev => { const cp = { ...prev }; delete cp[key]; return cp; });

  const confirmarClase = async (e, personas) => {
    const key = `${e.courtId}|${e.time}`;
    const extra = precioPendiente(key);
    const ok = await upsertClase(e, { personas, ...extra }, `Clase de ${e.time} guardada: ${personas} ${personas === 1 ? 'persona' : 'personas'} ✓`);
    if (ok && extra.precio !== undefined) limpiarEdicionPrecio(key);
    return ok;
  };

  const tarifaDe = (n) => {
    const v = Number(String(misTarifas[KEY_TARIFA[n]] ?? '0').replace(',', '.'));
    return isFinite(v) && v >= 0 ? v : 0;
  };

  const guardarPrecio = async (e) => {
    const key = `${e.courtId}|${e.time}`;
    const txt = precioEdits[key];
    if (txt === undefined) return;
    const cur = clasesConf[key];
    // El precio solo se toca en clases YA confirmadas: si no, guardar crearía
    // la fila y la clase contaría como confirmada (e ingresada) sin serlo.
    if (cur?.personas == null) { toast('Confirma primero cuántas personas tuvo la clase (botones 1-4)', 'error'); limpiarEdicionPrecio(key); return; }
    const n = Number(String(txt).replace(',', '.').trim());
    if (!isFinite(n) || n < 0) { toast('Precio no válido (ej: 15 o 12,50)', 'error'); return; }
    if (n === (cur.precio ?? tarifaDe(cur.personas))) { limpiarEdicionPrecio(key); return; } // sin cambios
    const ok = await upsertClase(e, { precio: n }, `Precio de la clase de ${e.time}: ${n.toFixed(2).replace('.', ',')} € ✓`);
    if (ok) limpiarEdicionPrecio(key);
  };

  // Cómo pagó el alumno idx: volver a pulsar el mismo botón = desmarcar.
  // Solo en clases confirmadas (ver guardarPrecio).
  const marcarPago = async (e, idx, metodo) => {
    const key = `${e.courtId}|${e.time}`;
    const cur = clasesConf[key];
    if (cur?.personas == null) { toast('Confirma primero cuántas personas tuvo la clase (botones 1-4)', 'error'); return; }
    const pagos = [...(cur.pagos || [])].slice(0, cur.personas);
    while (pagos.length < cur.personas) pagos.push(null);
    pagos[idx] = pagos[idx] === metodo ? null : metodo;
    const extra = precioPendiente(key);
    const ok = await upsertClase(e, { pagos, ...extra });
    if (ok && extra.precio !== undefined) limpiarEdicionPrecio(key);
    return ok;
  };

  // Entrenos del día visible (para la tarjeta de clases)
  const entrenosDelDia = courts.flatMap(c =>
    c.slots.filter(s => s.tipo === 'entreno').map(s => ({ courtId: c.id, courtName: c.name, time: s.time, grupo: s.grupo }))
  ).sort((a, b) => a.time.localeCompare(b.time));

  // ── Mis tarifas de clase: las fija el PROPIO monitor (tabla monitor_tarifas) ──
  const [misTarifas, setMisTarifas] = useState({ individual: '0', grupo2: '0', grupo3: '0', grupo4: '0' });
  const [tarifasAbiertas, setTarifasAbiertas] = useState(false);
  const [tarifasGuardando, setTarifasGuardando] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('monitor_tarifas').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setMisTarifas({
          individual: String(data.tarifa_individual ?? 0).replace('.', ','),
          grupo2: String(data.tarifa_grupo2 ?? 0).replace('.', ','),
          grupo3: String(data.tarifa_grupo3 ?? 0).replace('.', ','),
          grupo4: String(data.tarifa_grupo4 ?? 0).replace('.', ','),
        });
      });
  }, [user?.id]);

  const guardarMisTarifas = async () => {
    const parse = (v) => { const n = Number(String(v).replace(',', '.').trim()); return isFinite(n) && n >= 0 ? n : null; };
    const vals = {
      individual: parse(misTarifas.individual), grupo2: parse(misTarifas.grupo2),
      grupo3: parse(misTarifas.grupo3), grupo4: parse(misTarifas.grupo4),
    };
    if (Object.values(vals).some(v => v === null)) { toast('Tarifa no válida (ej: 12,50)', 'error'); return; }
    setTarifasGuardando(true);
    const { error } = await supabase.from('monitor_tarifas').upsert({
      user_id: user.id,
      tarifa_individual: vals.individual, tarifa_grupo2: vals.grupo2,
      tarifa_grupo3: vals.grupo3, tarifa_grupo4: vals.grupo4,
      updated_at: new Date().toISOString(),
    });
    setTarifasGuardando(false);
    if (error) toast('Error al guardar: ' + error.message, 'error');
    else toast('Tus tarifas se han guardado ✓', 'success');
  };

  // ── Mi informe del mes (PDF): totales por SEMANA + total del mes, con
  // desglose de horas de clases vs horas de club. Sueldo = hora FIJA × todas
  // las horas. Los precios de las clases van APARTE (sección propia).
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const generarInforme = async () => {
    if (generandoPdf) return;
    setGenerandoPdf(true);
    try {
      const base = new Date(date + 'T12:00:00');
      const yy = base.getFullYear(), mm = base.getMonth();
      const primer = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
      const ultimo = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(new Date(yy, mm + 1, 0).getDate()).padStart(2, '0')}`;
      // Mes en hora LOCAL por los dos lados (con "T00:00:00" a secas, Postgres
      // lo lee en UTC y las 00:00-02:00 del día 1 no caerían en ningún mes)
      const consultaMes = (cols) => supabase.from('fichajes').select(cols).eq('user_id', user.id)
        .gte('fichado_at', new Date(yy, mm, 1).toISOString()).lt('fichado_at', new Date(yy, mm + 1, 1).toISOString())
        .order('fichado_at', { ascending: true });
      let [fRes, eRes] = await Promise.all([
        consultaMes('tipo, fichado_at, manual'),
        supabase.from('blocked_slots').select('date, time_slot').eq('tipo', 'entreno')
          .gte('date', primer).lte('date', ultimo),
      ]);
      // BD sin migrar (sin turnos manuales): cargar sin esa columna. Solo si
      // el error es por la columna (un fallo de red mezclaría los turnos
      // manuales con los fichajes reales al emparejar).
      if (fRes.error && /manual/i.test(fRes.error.message || '')) fRes = await consultaMes('tipo, fichado_at');
      if (fRes.error) { toast('No se pudieron cargar tus fichajes, inténtalo de nuevo', 'error'); return; }

      // Entrenos por día (unión de intervalos: para separar horas de clase)
      const porDia = {};
      (eRes.data || []).forEach(e => {
        (porDia[e.date] = porDia[e.date] || []).push(slotIntervalM(e.date, e.time_slot));
      });
      for (const d of Object.keys(porDia)) porDia[d] = mergeIntsM(porDia[d]);

      // Jornadas → acumular por semana y total (SOLO HORAS). Los turnos
      // MANUALES del admin se emparejan APARTE de los fichajes firmados: así
      // un turno añadido a mano nunca desordena las entradas/salidas reales.
      const sem = {}; // lunesYmd -> { ms, msClase, msClub }
      const tot = { ms: 0, msClase: 0, msClub: 0 };
      const acumula = (rows) => {
        let abierto = null;
        rows.forEach(f => {
          if (f.tipo === 'entrada') { abierto = f; return; }
          if (!abierto) return;
          const ini = new Date(abierto.fichado_at).getTime();
          const fin = new Date(f.fichado_at).getTime();
          const fecha = toYMD(new Date(abierto.fichado_at));
          abierto = null;
          const ms = fin - ini;
          const msClase = porDia[fecha] ? overlapM(ini, fin, porDia[fecha]) : 0;
          const wk = mondayOf(fecha);
          if (!sem[wk]) sem[wk] = { ms: 0, msClase: 0, msClub: 0 };
          sem[wk].ms += ms; sem[wk].msClase += msClase; sem[wk].msClub += Math.max(0, ms - msClase);
          tot.ms += ms; tot.msClase += msClase; tot.msClub += Math.max(0, ms - msClase);
        });
      };
      const filas = fRes.data || [];
      acumula(filas.filter(f => !f.manual));
      acumula(filas.filter(f => f.manual));

      if (tot.ms === 0) { toast('No hay jornadas cerradas este mes', 'error'); return; }

      // ── PDF (solo horas, sin dinero) ──
      const doc = new jsPDF();
      const NAVY = [27, 58, 110], GREEN = [22, 163, 74], INK = [15, 23, 42], MUTED = [100, 116, 139];

      // Cabecera de marca
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, 210, 34, 'F');
      doc.setFillColor(...GREEN);
      doc.rect(0, 34, 210, 1.6, 'F');
      doc.setTextColor(255);
      doc.setFontSize(9); doc.setFont(undefined, 'bold');
      doc.text('PADEL MEDINA · CONTROL HORARIO', 14, 13);
      doc.setFontSize(19);
      doc.text(`Informe de horas — ${MESES_M[mm]} ${yy}`, 14, 24);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9.5); doc.setTextColor(200, 215, 235);
      doc.text(`${user?.name || 'Monitor'}`, 14, 30);

      // Cajas de resumen (3): total, clases, club
      const cajas = [
        { titulo: 'TOTAL DEL MES', valor: fmtHorasM(tot.ms), fill: [240, 253, 244], borde: [187, 247, 208], color: [22, 101, 52] },
        { titulo: 'HORAS COMO MONITOR', valor: fmtHorasM(tot.msClase), fill: [250, 245, 255], borde: [216, 180, 254], color: [126, 34, 206] },
        { titulo: 'HORAS EN EL CLUB', valor: fmtHorasM(tot.msClub), fill: [248, 250, 252], borde: [226, 232, 240], color: [51, 65, 85] },
      ];
      let cx = 14;
      cajas.forEach(c => {
        doc.setFillColor(...c.fill);
        doc.setDrawColor(...c.borde);
        doc.roundedRect(cx, 42, 58, 22, 2.5, 2.5, 'FD');
        doc.setFontSize(6.8); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
        doc.text(c.titulo, cx + 4, 49);
        doc.setFontSize(15); doc.setTextColor(...c.color);
        doc.text(c.valor, cx + 4, 59);
        cx += 61;
      });

      // Tabla por semanas
      let py = 78;
      doc.setFillColor(...NAVY);
      doc.roundedRect(14, py - 5.5, 182, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
      doc.text('SEMANA', 18, py);
      doc.text('HORAS TOTALES', 106, py, { align: 'right' });
      doc.text('CLASES', 146, py, { align: 'right' });
      doc.text('CLUB', 188, py, { align: 'right' });
      py += 9;
      const semanas = Object.keys(sem).sort();
      semanas.forEach((wk, i) => {
        const finSem = new Date(wk + 'T12:00:00'); finSem.setDate(finSem.getDate() + 6);
        const finYmd = `${finSem.getFullYear()}-${String(finSem.getMonth() + 1).padStart(2, '0')}-${String(finSem.getDate()).padStart(2, '0')}`;
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, py - 5, 182, 7.5, 'F');
        }
        doc.setFont(undefined, 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
        doc.text(`Semana del ${ddmm(wk)} al ${ddmm(finYmd)}`, 18, py);
        doc.text(fmtHorasM(sem[wk].ms), 106, py, { align: 'right' });
        doc.setFont(undefined, 'normal'); doc.setTextColor(126, 34, 206);
        doc.text(fmtHorasM(sem[wk].msClase), 146, py, { align: 'right' });
        doc.setTextColor(...MUTED);
        doc.text(fmtHorasM(sem[wk].msClub), 188, py, { align: 'right' });
        py += 7.5;
      });
      // Fila TOTAL
      doc.setFillColor(220, 252, 231);
      doc.roundedRect(14, py - 5, 182, 8.5, 1.5, 1.5, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.setTextColor(22, 101, 52);
      doc.text('TOTAL DEL MES', 18, py + 0.5);
      doc.text(fmtHorasM(tot.ms), 106, py + 0.5, { align: 'right' });
      doc.text(fmtHorasM(tot.msClase), 146, py + 0.5, { align: 'right' });
      doc.text(fmtHorasM(tot.msClub), 188, py + 0.5, { align: 'right' });

      // Pie
      doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
      doc.text('Horas según fichajes firmados, con hora de servidor y ubicación GPS.', 14, 285);
      doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} · Padel Medina`, 14, 290);
      doc.save(`mis-horas-${MESES_M[mm].toLowerCase()}-${yy}.pdf`);
      toast('Informe descargado 📄', 'success');
    } catch (e) {
      console.error(e);
      toast('No se pudo generar el informe', 'error');
    } finally {
      setGenerandoPdf(false);
    }
  };

  // ¿Está AHORA dentro de una clase? (para que se vea que el fichaje cae en clase)
  const enClaseAhora = (() => {
    if (!trabajando || date !== toYMD(new Date())) return false;
    const ahora = new Date();
    const hm = ahora.getHours() * 60 + ahora.getMinutes();
    const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return entrenosDelDia.some(e => {
      const [a, b] = e.time.split(' - ');
      return hm >= toM(a) && hm < toM(b);
    });
  })();

  // Cambio de día a MEDIANOCHE: si lolo estaba mirando "hoy", saltar al día nuevo.
  useEffect(() => {
    let prevToday = toYMD(new Date());
    const id = setInterval(() => {
      const t = toYMD(new Date());
      if (t !== prevToday) {
        const old = prevToday;
        prevToday = t;
        setDate(d => (d === old ? t : d));
      }
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const shiftDay = (delta) => {
    const [y, m, d] = date.split('-').map(Number);
    setDate(toYMD(new Date(y, m - 1, d + delta)));
  };

  const isToday = date === toYMD(new Date());
  const totalOcupadas = courts.reduce((n, c) => n + c.slots.length, 0);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#EEF2F7 0%,#F8FAFC 240px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .agenda-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
        @media (min-width: 760px) { .agenda-grid { grid-template-columns: repeat(3, 1fr); } }
        .court-card { background:#fff; border:1px solid #E8EDF3; border-radius:1rem; padding:0.75rem 0.7rem 0.8rem; box-shadow:0 1px 3px rgba(15,23,42,0.05); }
        .slot { border-radius:0.6rem; padding:0.45rem 0.55rem; margin-top:0.4rem; }
        .slot-time { font-weight:800; font-size:0.82rem; color:#0F172A; letter-spacing:-0.01em; line-height:1.15; }
        .slot-tag { font-size:0.68rem; font-weight:800; margin-top:2px; display:inline-flex; align-items:center; gap:3px; }
        .nav-arrow { width:38px; height:38px; border-radius:0.7rem; border:1px solid #E2E8F0; background:#fff; color:#1B3A6E; font-size:1.3rem; font-weight:800; cursor:pointer; line-height:1; flex-shrink:0; }
        .nav-arrow:active { background:#F1F5F9; }
      `}</style>

      {/* Cabecera */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E8EDF3', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/logo.png" alt="Padel Medina" style={{ height: 30 }} />
          <span style={{ fontWeight: 800, color: '#1B3A6E', fontSize: '1.02rem' }}>Agenda</span>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: '0.6rem', padding: '0.45rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
          Salir
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '1rem 0.9rem 2.5rem', boxSizing: 'border-box' }}>
        <p style={{ margin: '0 0 0.85rem', color: '#64748B', fontSize: '0.85rem' }}>
          Hola <strong style={{ color: '#0F172A' }}>{user?.name || 'monitor'}</strong>, pistas ocupadas del día por reservas, bloqueos y entrenos.
        </p>

        {/* ── Fichaje / control horario ── */}
        <div style={{ background: 'white', border: `1.5px solid ${trabajando ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: '0.95rem', padding: '0.9rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>🕐 Control horario</div>
              <div style={{ fontSize: '0.78rem', color: trabajando ? '#15803D' : '#64748B', fontWeight: 700, marginTop: 2 }}>
                {trabajando ? `Trabajando desde las ${horaDe(ultimoFichaje.fichado_at)}` : 'Turno sin iniciar'}
                {enClaseAhora && <span style={{ color: '#7E22CE' }}> · 🎾 ahora en clase</span>}
              </div>
              {gpsPermiso === 'denied' && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', fontWeight: 700, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.6rem', padding: '0.45rem 0.65rem', maxWidth: 420 }}>
                  ⚠️ El navegador tiene <strong>bloqueada la ubicación</strong> para esta web: tus fichajes
                  salen sin 📍. Actívala en los ajustes del navegador (Permisos → Ubicación) y ten la
                  ubicación del móvil encendida. Aun así puedes fichar con normalidad.
                </div>
              )}
            </div>
            <button onClick={() => setFirmando(true)} disabled={fichando} style={{
              padding: '0.7rem 1.2rem', borderRadius: '0.7rem', border: 'none', cursor: fichando ? 'wait' : 'pointer',
              background: trabajando ? '#DC2626' : '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.88rem',
              fontFamily: 'inherit', opacity: fichando ? 0.7 : 1, boxShadow: trabajando ? '0 4px 14px rgba(220,38,38,0.3)' : '0 4px 14px rgba(22,163,74,0.3)',
            }}>
              {trabajando ? '🔴 Firmar salida' : '🟢 Firmar entrada'}
            </button>
          </div>
          {fichajes.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
              {fichajes.map(f => {
                const st = { fontSize: '0.7rem', fontWeight: 800, color: f.tipo === 'entrada' ? '#15803D' : '#B91C1C', background: f.tipo === 'entrada' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${f.tipo === 'entrada' ? '#BBF7D0' : '#FECACA'}`, borderRadius: 999, padding: '0.22rem 0.6rem' };
                const texto = `${f.tipo === 'entrada' ? '🟢 Entrada' : '🔴 Salida'} ${horaDe(f.fichado_at)}${f.hora_original ? ' ✏️' : ''}`;
                const titulo = f.hora_original ? `Hora corregida por el club (la original era ${horaDe(f.hora_original)})` : undefined;
                // Con ubicación: el chip abre el punto exacto en Google Maps
                return f.lat != null ? (
                  <a key={f.id} href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noopener noreferrer" title={titulo} style={{ ...st, textDecoration: 'none', cursor: 'pointer' }}>
                    {texto} · 📍 mapa
                  </a>
                ) : f.manual ? (
                  <span key={f.id} style={st} title={titulo}>{texto} · ✍️ club</span>
                ) : (
                  <span key={f.id} style={st} title={titulo}>{texto} · sin 📍</span>
                );
              })}
            </div>
          )}
          <button onClick={generarInforme} disabled={generandoPdf} style={{ marginTop: '0.7rem', width: '100%', padding: '0.6rem', borderRadius: '0.65rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#334155', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', opacity: generandoPdf ? 0.6 : 1 }}>
            {generandoPdf ? 'Generando…' : '📄 Mi informe del mes (horas por semana y clases)'}
          </button>
        </div>

        {/* ── Mis tarifas de clase (las pone el propio monitor; van aparte del sueldo) ── */}
        <div style={{ background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.95rem', padding: '0.75rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <button onClick={() => setTarifasAbiertas(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>💶 Mis precios de clase</span>
            <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 700 }}>{tarifasAbiertas ? '▲ cerrar' : '▼ editar'}</span>
          </button>
          {tarifasAbiertas && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {[['individual', '🎾 Individual'], ['grupo2', '👥 Grupo 2'], ['grupo3', '👥 Grupo 3'], ['grupo4', '👥 Grupo 4']].map(([k, label]) => (
                  <label key={k} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>
                    {label}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <input value={misTarifas[k]} onChange={e => setMisTarifas(prev => ({ ...prev, [k]: e.target.value }))} inputMode="decimal"
                        style={{ width: 70, padding: '0.5rem 0.6rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontSize: '0.88rem', fontWeight: 700 }} />
                      <span style={{ color: '#64748B', fontWeight: 700, fontSize: '0.75rem' }}>€/clase</span>
                    </div>
                  </label>
                ))}
                <button onClick={guardarMisTarifas} disabled={tarifasGuardando}
                  style={{ padding: '0.55rem 1rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', opacity: tarifasGuardando ? 0.7 : 1, fontFamily: 'inherit' }}>
                  {tarifasGuardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: '#94A3B8' }}>
                Precio de <strong>cada clase completa</strong> según el grupo. Van aparte de tu sueldo.
              </p>
            </div>
          )}
        </div>

        {/* ── Clases del día: lolo confirma cuántas personas tuvo cada entreno ── */}
        {entrenosDelDia.length > 0 && (
          <div style={{ background: 'white', border: '1.5px solid #D8B4FE', borderRadius: '0.95rem', padding: '0.9rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
            <div style={{ fontWeight: 800, color: '#7E22CE', fontSize: '0.9rem' }}>🎾 Clases del día</div>
            <p style={{ margin: '0.2rem 0 0.7rem', fontSize: '0.74rem', color: '#64748B' }}>
              Al terminar: marca cuántas personas tuvo la clase, ajusta el precio si hace falta y apunta cómo pagó cada alumno.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {entrenosDelDia.map(e => {
                const key = `${e.courtId}|${e.time}`;
                const conf = clasesConf[key];
                const confirmado = conf?.personas ?? null;           // lo que marcó lolo
                const planificado = GRUPO_PERSONAS[e.grupo] || null; // lo que puso el admin
                const activo = confirmado ?? null;
                const personasEf = confirmado ?? planificado ?? 1;
                const precioEf = conf?.precio ?? tarifaDe(personasEf);
                const precioTxt = precioEdits[key] !== undefined ? precioEdits[key] : String(precioEf).replace('.', ',');
                const pagos = conf?.pagos || [];
                return (
                  <div key={key} style={{ border: '1px solid #F1F5F9', borderRadius: '0.7rem', padding: '0.55rem 0.7rem', background: confirmado ? '#FAF5FF' : '#FFFFFF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.82rem' }}>{e.time} · {e.courtName}</span>
                          {/* Precio de ESTA clase (editable al confirmarla; por defecto tu tarifa del grupo) */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <input
                              value={precioTxt}
                              inputMode="decimal"
                              disabled={confirmado == null}
                              title={confirmado == null ? 'Confirma primero las personas (1-4)' : 'Precio de esta clase'}
                              onChange={ev => { const v = ev.target.value; setPrecioEdits(prev => ({ ...prev, [key]: v })); }}
                              onBlur={() => { if (precioEdits[key] !== undefined) guardarPrecio(e); }}
                              onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
                              style={{ width: 56, padding: '0.32rem 0.4rem', borderRadius: '0.5rem', border: `1.5px solid ${precioEdits[key] !== undefined ? '#9333EA' : '#E2E8F0'}`, fontSize: '0.8rem', fontWeight: 800, textAlign: 'right', fontFamily: 'inherit', color: '#0F172A', opacity: confirmado == null ? 0.55 : 1 }}
                            />
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#7E22CE' }}>€</span>
                          </span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: confirmado ? '#7E22CE' : '#94A3B8', fontWeight: 700, marginTop: 2 }}>
                          {confirmado
                            ? `✓ Confirmada: ${confirmado} ${confirmado === 1 ? 'persona' : 'personas'}`
                            : planificado ? `Prevista: ${planificado} pers. — confirma al terminar` : 'Sin confirmar'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {[1, 2, 3, 4].map(n => (
                          <button key={n} disabled={confGuardando === key}
                            onPointerDown={ev => ev.preventDefault()}
                            onClick={() => confirmarClase(e, n)}
                            style={{
                              width: 38, height: 38, borderRadius: '0.6rem', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit',
                              border: `1.5px solid ${activo === n ? '#9333EA' : '#E2E8F0'}`,
                              background: activo === n ? '#9333EA' : 'white',
                              color: activo === n ? 'white' : '#475569',
                              opacity: confGuardando === key ? 0.6 : 1,
                            }}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Cómo pagó cada alumno (uno por persona; al confirmar la clase) */}
                    <div style={{ marginTop: '0.55rem', paddingTop: '0.55rem', borderTop: '1px dashed #E9D5FF', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {confirmado == null ? (
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>
                          💶 Confirma las personas (1-4) y podrás apuntar el precio y cómo pagó cada alumno.
                        </span>
                      ) : (
                        Array.from({ length: personasEf }).map((_, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', minWidth: 62 }}>👤 Alumno {i + 1}</span>
                            {[['tarjeta', '💳 Tarjeta'], ['bizum', '📱 Bizum'], ['mano', '💶 En mano']].map(([mk, ml]) => (
                              <button key={mk} disabled={confGuardando === key}
                                onPointerDown={ev => ev.preventDefault()}
                                onClick={() => marcarPago(e, i, mk)}
                                style={{
                                  padding: '0.32rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                                  border: `1.5px solid ${pagos[i] === mk ? '#9333EA' : '#E2E8F0'}`,
                                  background: pagos[i] === mk ? '#9333EA' : 'white',
                                  color: pagos[i] === mk ? 'white' : '#64748B',
                                  opacity: confGuardando === key ? 0.6 : 1,
                                }}>
                                {ml}
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selector de día */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#fff', border: '1px solid #E8EDF3', borderRadius: '0.95rem', padding: '0.55rem 0.7rem', marginBottom: '0.8rem', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <button onClick={() => shiftDay(-1)} aria-label="Día anterior" className="nav-arrow">‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.98rem', textTransform: 'capitalize' }}>
              {formatLong(date)} {isToday && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#15803D', background: '#DCFCE7', padding: '0.1rem 0.4rem', borderRadius: 999, verticalAlign: 'middle', marginLeft: 4 }}>HOY</span>}
            </div>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ border: 'none', background: 'transparent', color: '#94A3B8', fontSize: '0.72rem', fontFamily: 'inherit', textAlign: 'center', marginTop: 2 }} />
          </div>
          <button onClick={() => shiftDay(1)} aria-label="Día siguiente" className="nav-arrow">›</button>
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {LEYENDA.map(({ label, t }) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: '0.28rem 0.6rem', borderRadius: 999 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color, display: 'inline-block' }} /> {label}
            </span>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem 0' }}>Cargando…</p>
        ) : totalOcupadas === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748B', background: '#fff', border: '1px dashed #CBD5E1', borderRadius: '1rem', padding: '2.5rem 1rem' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '0.4rem' }}>✅</div>
            <p style={{ margin: 0, fontWeight: 800, color: '#0F172A' }}>Todas las pistas libres</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>No hay reservas ni bloqueos este día.</p>
          </div>
        ) : (
          <div className="agenda-grid">
            {courts.map((c) => (
              <div key={c.id} className="court-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                  <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>{c.name}</span>
                  {c.slots.length > 0 && (
                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748B', background: '#F1F5F9', borderRadius: 999, padding: '0.1rem 0.45rem' }}>{c.slots.length}</span>
                  )}
                </div>

                {c.slots.length === 0 ? (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.6rem', padding: '0.5rem 0.55rem' }}>
                    🟢 Libre
                  </div>
                ) : (
                  c.slots.map((s, i) => {
                    const m = (s.tipo === 'reserva' && (s.metodo === 'tarjeta' || s.metodo === 'bizum'))
                      ? TIPO.reservaOnline
                      : (TIPO[s.tipo] || TIPO.bloqueo);
                    return (
                      <div key={i} className="slot" style={{ background: m.bg, border: `1px solid ${m.border}`, borderLeft: `3px solid ${m.color}` }}>
                        <div className="slot-time">{s.time}</div>
                        <div className="slot-tag" style={{ color: m.color }}>{m.emoji} {m.label}</div>
                        {s.note && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2, fontWeight: 600 }}>{s.tipo === 'reserva' ? '👤 ' : ''}{s.note}</div>}
                        {s.tipo === 'reserva' && METODO[s.metodo] && (
                          <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2, fontWeight: 700 }}>{METODO[s.metodo]}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {firmando && (
        <SignaturePad
          tipo={trabajando ? 'salida' : 'entrada'}
          saving={fichando}
          onCancel={() => setFirmando(false)}
          onConfirm={registrarFichaje}
        />
      )}
    </div>
  );
}

// ── Panel de firma: el trabajador dibuja su firma con el dedo/ratón ──────────
function SignaturePad({ tipo, saving, onCancel, onConfirm }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Ajustar resolución al tamaño real (nitidez en móvil)
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A';
  }, []);

  const posFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = posFromEvent(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = posFromEvent(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const confirm = () => {
    if (!hasInk) { toast('Dibuja tu firma antes de continuar', 'error'); return; }
    // Fondo blanco (el canvas es transparente) para que la firma se vea en el email/panel
    const canvas = canvasRef.current;
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const octx = out.getContext('2d');
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    onConfirm(out.toDataURL('image/png'));
  };

  const esEntrada = tipo === 'entrada';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: 440, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.1rem', fontWeight: 800, color: esEntrada ? '#15803D' : '#B91C1C' }}>
          {esEntrada ? '🟢 Firmar ENTRADA' : '🔴 Firmar SALIDA'}
        </h3>
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: '#64748B' }}>
          Firma en el recuadro para confirmar tu {esEntrada ? 'entrada' : 'salida'}. Se registrará con la hora (y tu ubicación si hay señal).
        </p>
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{ width: '100%', height: 190, border: '2px dashed #CBD5E1', borderRadius: '0.75rem', background: '#F8FAFC', touchAction: 'none', display: 'block', cursor: 'crosshair' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <button onClick={clear} disabled={saving} style={{ background: 'none', border: 'none', color: '#64748B', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', padding: '0.4rem' }}>↺ Borrar</button>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Firma con el dedo o el ratón</span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem' }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '0.8rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving} style={{ flex: 2, padding: '0.8rem', borderRadius: '0.7rem', border: 'none', background: esEntrada ? '#16A34A' : '#DC2626', color: 'white', fontWeight: 800, fontSize: '0.9rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Fichando…' : 'Confirmar fichaje'}
          </button>
        </div>
      </div>
    </div>
  );
}
