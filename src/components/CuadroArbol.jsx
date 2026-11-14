import { useEffect, useMemo, useRef, useState } from 'react';

// Cuadro de eliminatoria ENTERO, en forma de árbol (rondas en columnas, cada
// partido centrado entre los dos que le dan jugadores, con sus líneas), como
// el que se cuelga en el club. Se ajusta al ancho de la pantalla para verlo
// completo de un vistazo y se puede ampliar con los botones o con dos dedos.
//
// Lo usan la página pública del cuadro (los jugadores) y el panel del admin
// ("Ver cuadro completo"). Es solo lectura: pinta `rondas` tal cual se guardan
// en tournaments.config (rounds[cat] o consRounds[cat]).
//
//   <CuadroArbol rondas={rounds[cat]} esCons={false} courtNames={config.courtNames} />

const ANCHO_CARTA = 196;
const ALTO_CARTA = 92;      // cabecera con la hora + dos parejas
const HUECO_Y = 14;         // separación vertical mínima entre partidos de una ronda
const HUECO_X = 44;         // espacio entre columnas (donde van las líneas)
const ALTO_TITULO = 34;     // nombre de la ronda encima de cada columna
const ESCALA_MIN = 0.25;
const ESCALA_MAX = 2.5;

const esReal = (p) => !!p && !p.isBye && !p.isPlaceholder && !p.isPrelimPlaceholder;
// Partidos sin juego real que no se pintan (misma regla que el panel).
const oculto = (m) => {
  const byeYHueco = (a, b) => a?.isBye && b?.isPlaceholder;
  return !!(m && ((m.p1?.isBye && m.p2?.isBye) || byeYHueco(m.p1, m.p2) || byeYHueco(m.p2, m.p1)));
};

const nombreRonda = (idx, rondas) => {
  const total = rondas.length;
  const conPrevia = rondas[0]?.[0]?.isPrelim === true;
  if (conPrevia && idx === 0) return 'Ronda previa';
  const quedan = total - idx;
  if (quedan === 1) return 'Final';
  if (quedan === 2) return 'Semifinales';
  if (quedan === 3) return 'Cuartos de final';
  if (quedan === 4) return 'Octavos de final';
  if (quedan === 5) return 'Dieciseisavos';
  if (quedan === 6) return 'Treintaidosavos';
  return `Ronda ${idx + 1}`;
};

const sets = (score, lado) => String(score || '').trim().split(/\s+/).map((s) => {
  const m = s.replace(/\(.*?\)/g, '').match(/^(\d+)-(\d+)$/);
  return m ? m[lado + 1] : null;
}).filter((x) => x != null);

const horaConPista = (time, courtNames) => {
  if (!time) return '';
  const m = String(time).match(/^(.*) - Pista (\d+)$/);
  if (!m) return time;
  const n = parseInt(m[2], 10);
  const propio = courtNames?.[n] && String(courtNames[n]).trim();
  return `${m[1]} · ${propio || `Pista ${n}`}`;
};

// Geometría: dónde va cada partido (en px sin escalar).
function calcularGeometria(rondas) {
  const conPrevia = rondas[0]?.[0]?.isPrelim === true;
  const principales = conPrevia ? rondas.slice(1) : rondas;
  const n0 = principales[0]?.length || 1;
  const u = (ALTO_CARTA + HUECO_Y) / 2;          // media "ranura" de la primera ronda
  const columnas = [];
  let x = 0;
  const alto = Math.max(1, 2 * n0) * u;
  if (conPrevia) {
    // Cada partido de la previa se pinta a la altura de la plaza (nextSlot)
    // del cuadro principal a la que manda a su ganador.
    const ordenados = rondas[0].map((m, i) => ({ m, i, y: (Number.isFinite(m.nextSlot) ? m.nextSlot + 0.5 : i + 0.5) * u }))
      .sort((a, b) => a.y - b.y);
    let ultimo = -Infinity;
    const cartas = ordenados.map(({ m, i, y }) => {
      const cy = Math.max(y, ultimo + ALTO_CARTA + HUECO_Y);
      ultimo = cy;
      return { m, idxRonda: 0, idx: i, x, y: cy - ALTO_CARTA / 2, cy, destinoSlot: m.nextSlot };
    });
    columnas.push({ idxRonda: 0, titulo: nombreRonda(0, rondas), x, cartas });
    x += ANCHO_CARTA + HUECO_X;
  }
  principales.forEach((ronda, k) => {
    const idxRonda = conPrevia ? k + 1 : k;
    const cartas = ronda.map((m, i) => {
      const cy = (2 * i + 1) * Math.pow(2, k) * u;
      return { m, idxRonda, idx: i, x, y: cy - ALTO_CARTA / 2, cy };
    });
    columnas.push({ idxRonda, titulo: nombreRonda(idxRonda, rondas), x, cartas });
    x += ANCHO_CARTA + HUECO_X;
  });
  const ancho = Math.max(1, x - HUECO_X);
  // Líneas: de cada partido a los dos que le dan jugadores.
  const lineas = [];
  for (let c = 1; c < columnas.length; c++) {
    const col = columnas[c];
    const previa = columnas[c - 1];
    const esDesdePrevia = conPrevia && c === 1;
    col.cartas.forEach((carta) => {
      const fuentes = esDesdePrevia
        ? previa.cartas.filter((p) => Number.isFinite(p.destinoSlot) && Math.floor(p.destinoSlot / 2) === carta.idx)
        : [previa.cartas[carta.idx * 2], previa.cartas[carta.idx * 2 + 1]].filter(Boolean);
      fuentes.forEach((f) => {
        if (oculto(f.m)) return;
        const x1 = f.x + ANCHO_CARTA;
        const x2 = carta.x;
        const xm = x1 + HUECO_X / 2;
        // En la previa, la línea entra por la mitad (arriba/abajo) de la plaza que ocupa.
        const yDestino = esDesdePrevia
          ? carta.cy + (f.destinoSlot % 2 === 0 ? -ALTO_CARTA / 4 : ALTO_CARTA / 4)
          : carta.cy;
        lineas.push(`M ${x1} ${f.cy} H ${xm} V ${yDestino} H ${x2}`);
      });
    });
  }
  return { columnas, lineas, ancho, alto: alto + ALTO_TITULO };
}

function Carta({ m, esCons, courtNames, x, y }) {
  const colorGanador = esCons ? '#D97706' : '#16A34A';
  const fondoGanador = esCons ? '#FFFBEB' : '#F0FDF4';
  const vacio = !m.p1 && !m.p2;
  const conHora = m.time && esReal(m.p1) && esReal(m.p2);
  return (
    <div style={{ position: 'absolute', left: x, top: y + ALTO_TITULO, width: ANCHO_CARTA, height: ALTO_CARTA, boxSizing: 'border-box', backgroundColor: 'white', border: `1.5px ${vacio ? 'dashed' : 'solid'} ${vacio ? '#E2E8F0' : '#CBD5E1'}`, borderRadius: 10, overflow: 'hidden', boxShadow: vacio ? 'none' : '0 1px 3px rgba(15,23,42,0.08)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 22, padding: '0 8px', display: 'flex', alignItems: 'center', backgroundColor: '#F8FAFC', borderBottom: '1px solid #F1F5F9', fontSize: 10, fontWeight: 700, color: conHora ? '#64748B' : '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.02em' }}>
        {conHora ? horaConPista(m.time, courtNames) : (vacio ? 'Por definir' : (esReal(m.p1) && esReal(m.p2) ? 'Horario por definir' : 'Esperando rival'))}
      </div>
      {[m.p1, m.p2].map((p, lado) => {
        const gana = !!m.winner && !!p && m.winner.id === p.id;
        const bye = p?.isBye;
        const hueco = p?.isPlaceholder || p?.isPrelimPlaceholder;
        return (
          <div key={lado} style={{ flex: 1, minHeight: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, backgroundColor: gana ? fondoGanador : 'white', borderBottom: lado === 0 ? '1px solid #F1F5F9' : 'none' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: gana ? 800 : 600, color: gana ? colorGanador : bye || hueco ? '#94A3B8' : '#1E293B', fontStyle: bye || hueco ? 'italic' : 'normal' }}>
              {p ? (bye ? '— bye —' : p.name) : <span style={{ color: '#CBD5E1', fontStyle: 'italic', fontWeight: 500 }}>Por definir</span>}
            </span>
            {m.score && !bye && (
              <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {sets(m.score, lado).map((s, i) => (
                  <span key={i} style={{ fontSize: 10, fontWeight: 800, background: gana ? colorGanador : '#E2E8F0', color: gana ? 'white' : '#475569', borderRadius: 3, padding: '0 4px', minWidth: 14, textAlign: 'center' }}>{s}</span>
                ))}
              </span>
            )}
            {gana && <span style={{ fontSize: 11, flexShrink: 0 }}>🏆</span>}
          </div>
        );
      })}
    </div>
  );
}

const estiloBotonZoom = {
  minWidth: 40, height: 36, padding: '0 10px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: 'white', color: '#0F172A',
  fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// `rellenar`: en vez de una altura máxima, ocupa todo el alto del contenedor
// (que debe ser una columna flex): lo usa el visor a pantalla completa.
export default function CuadroArbol({ rondas, esCons = false, courtNames, altoMax = '70vh', ajustarAlAncho = true, rellenar = false }) {
  const geo = useMemo(() => calcularGeometria(rondas || []), [rondas]);
  const contenedor = useRef(null);
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  // null = ajustado al ancho; número = escala elegida por el usuario
  const [escalaManual, setEscalaManual] = useState(null);
  const punteros = useRef(new Map());
  const pellizco = useRef(null); // { distancia, escala }

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const medir = () => setAnchoDisponible(el.clientWidth);
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    window.addEventListener('resize', medir);
    return () => { ro?.disconnect(); window.removeEventListener('resize', medir); };
  }, []);

  // 26 = los 12 px de margen a cada lado de la caja escalada y un pelín de holgura.
  const escalaAjuste = anchoDisponible > 40 ? Math.min(1, (anchoDisponible - 26) / geo.ancho) : 1;
  const escala = escalaManual ?? (ajustarAlAncho ? escalaAjuste : 1);
  const fijar = (v) => setEscalaManual(Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v)));

  // Pellizco con dos dedos (eventos de puntero; un dedo sigue desplazando).
  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      pellizco.current = { distancia: Math.hypot(a.x - b.x, a.y - b.y), escala };
    }
  };
  const onPointerMove = (e) => {
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2 && pellizco.current) {
      const [a, b] = [...punteros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pellizco.current.distancia > 0) fijar(pellizco.current.escala * (d / pellizco.current.distancia));
    }
  };
  const onPointerUp = (e) => {
    punteros.current.delete(e.pointerId);
    if (punteros.current.size < 2) pellizco.current = null;
  };

  if (!rondas || rondas.length === 0) return null;
  const color = esCons ? '#D97706' : '#1B3A6E';
  const campeon = rondas[rondas.length - 1]?.[0]?.winner;

  return (
    <div style={rellenar ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
          {escalaManual == null ? 'Cuadro entero · ' : ''}{Math.round(escala * 100)}% · amplía con dos dedos o con los botones
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => fijar(escala / 1.25)} style={estiloBotonZoom} aria-label="Reducir">−</button>
          <button type="button" onClick={() => setEscalaManual(null)} style={{ ...estiloBotonZoom, fontSize: 12 }}>Entero</button>
          <button type="button" onClick={() => fijar(1)} style={{ ...estiloBotonZoom, fontSize: 12 }}>100%</button>
          <button type="button" onClick={() => fijar(escala * 1.25)} style={estiloBotonZoom} aria-label="Ampliar">+</button>
        </div>
      </div>
      <div
        ref={contenedor}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ overflow: 'auto', ...(rellenar ? { flex: 1, minHeight: 0 } : { maxHeight: altoMax }), border: '1px solid #E2E8F0', borderRadius: 12, background: '#FAFAFA', touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <div style={{ width: geo.ancho * escala + 24, height: geo.alto * escala + 24 }}>
          <div style={{ position: 'relative', width: geo.ancho, height: geo.alto, transform: `scale(${escala})`, transformOrigin: '0 0', margin: 12 }}>
            {geo.columnas.map((col) => (
              <div key={col.idxRonda} style={{ position: 'absolute', left: col.x, top: 0, width: ANCHO_CARTA, height: ALTO_TITULO - 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: esCons ? '#FFFBEB' : '#EBF0FA', color, border: `1px solid ${esCons ? '#FDE68A' : '#C3D4F5'}`, borderRadius: 8, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {col.titulo}
              </div>
            ))}
            <svg width={geo.ancho} height={geo.alto} style={{ position: 'absolute', left: 0, top: ALTO_TITULO, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
              {geo.lineas.map((d, i) => <path key={i} d={d} fill="none" stroke={esCons ? '#FCD34D' : '#B6C4DE'} strokeWidth="2" />)}
            </svg>
            {geo.columnas.flatMap((col) => col.cartas.filter((c) => !oculto(c.m)).map((c) => (
              <Carta key={c.m.id || `${c.idxRonda}-${c.idx}`} m={c.m} esCons={esCons} courtNames={courtNames} x={c.x} y={c.y} />
            )))}
            {campeon && (
              <div style={{ position: 'absolute', left: geo.ancho - ANCHO_CARTA, top: ALTO_TITULO + geo.columnas[geo.columnas.length - 1].cartas[0].y + ALTO_CARTA + 10, width: ANCHO_CARTA, padding: '8px 10px', boxSizing: 'border-box', background: esCons ? '#FFFBEB' : '#F0FDF4', border: `1.5px solid ${esCons ? '#FDE68A' : '#BBF7D0'}`, borderRadius: 10, textAlign: 'center', fontSize: 12, fontWeight: 900, color: esCons ? '#B45309' : '#15803D' }}>
                🏆 {campeon.name}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
