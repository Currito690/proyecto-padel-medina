// PDF del cuadro de un torneo DIBUJADO (no una foto de la pantalla), con el
// mismo aspecto que el cuadro de la app: hoja A4 apaisada, letra grande y
// nítida. Antes era una captura del cuadro encogida y, en los cuadros altos,
// salía en vertical con la letra de unos 5 puntos ("no se ve nada").
//
// Si la primera ronda tiene más de 8 partidos, el cuadro se reparte en varias
// hojas: cada una con 8 partidos de la primera ronda y su parte del cuadro, y
// una hoja más con las rondas finales.
//
// rondas: [[partido, …], …] como rounds[cat] / consRounds[cat] del panel.
// opciones:
//   titulo (texto de la cabecera), consolacion (bool, colores naranjas),
//   logo (dataURL o null), textoCampeon ("CAMPEÓN ABSOLUTO"…)
//   nombreRonda(indiceReal) → "Cuartos de Final"…
//   etiqueta(partido) → cabecera de cada partido ("Sáb 14/11 16:00 - Pista 1"…)
//   nombrePareja(pareja) → nombre, '---' (bye) o '' (por decidir)

const MM_POR_PT = 0.3528;
const latin1 = (t) => String(t ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim();
const esReal = (p) => !!p && !p.isBye && !p.isPlaceholder && !p.isPrelimPlaceholder;

// Qué se dibuja en cada hoja: bloques de hasta 8 partidos de una ronda y las
// rondas siguientes hasta que ese bloque se junta en un solo partido.
function planificarHojas(numRondas, partidosPrimera) {
  const hojas = [];
  let r0 = 0;
  let n = partidosPrimera;
  while (n > 8) {
    for (let p = 0; p < n / 8; p++) hojas.push({ r0, m0: p * 8, n: 8, rondas: Math.min(4, numRondas - r0) });
    r0 += 3;
    n = n / 8;
  }
  hojas.push({ r0, m0: 0, n, rondas: numRondas - r0, final: true });
  return hojas;
}

// Colores del cuadro de la app (verde en el principal, naranja en la consolación).
const PALETA = {
  principal: { pastillaFondo: [240, 253, 244], pastillaBorde: [187, 247, 208], pastillaTexto: [22, 163, 74], vacio: [226, 247, 234] },
  consolacion: { pastillaFondo: [255, 251, 235], pastillaBorde: [253, 230, 138], pastillaTexto: [217, 119, 6], vacio: [254, 243, 199] },
};

export function dibujarCuadroPdf(pdf, rondas, opciones) {
  const {
    titulo = '', consolacion = false, logo = null, textoCampeon = 'CAMPEÓN ABSOLUTO',
    nombreRonda = (r) => `Ronda ${r + 1}`, etiqueta = () => '', nombrePareja = (p) => p?.name || '',
  } = opciones || {};
  const col = consolacion ? PALETA.consolacion : PALETA.principal;
  const hayPrevia = !!rondas?.[0]?.[0]?.isPrelim;
  const previa = hayPrevia ? (rondas[0] || []) : [];
  const arbol = (hayPrevia ? rondas.slice(1) : rondas).filter((r) => Array.isArray(r) && r.length);
  if (!arbol.length) return 0;
  const realIdx = (r) => (hayPrevia ? r + 1 : r);
  const hojas = planificarHojas(arbol.length, arbol[0].length);

  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const mx = 8;
  const arribaArea = 33; // debajo del título y de los nombres de ronda
  const abajoArea = H - 7;
  const hueco = 8; // entre columnas

  hojas.forEach((hoja, iHoja) => {
    if (iHoja > 0) pdf.addPage('a4', 'landscape');
    const conPrevia = hayPrevia && hoja.r0 === 0;
    const conCampeon = !!hoja.final;
    const colsCuadro = hoja.rondas + (conPrevia ? 1 : 0);
    const anchoCampeon = conCampeon ? 38 : 0;
    // Anchos: la primera columna de partidos (la que tiene los nombres de
    // todas las parejas) más ancha; ninguna de más de 90 mm (con pocas rondas
    // salían cajas enormes) y lo que sobra se reparte a los lados.
    const primera = conPrevia ? 1 : 0;
    const pesos = Array.from({ length: colsCuadro }, (_, c) => (c === primera && colsCuadro > 2 ? 1.65 : 1));
    const libre = W - 2 * mx - anchoCampeon - (colsCuadro - 1) * hueco - (conCampeon ? hueco : 0);
    const unidad = libre / pesos.reduce((a, b) => a + b, 0);
    const anchos = pesos.map((p) => Math.min(90, unidad * p));
    const anchoTotal = anchos.reduce((a, b) => a + b, 0) + (colsCuadro - 1) * hueco + (conCampeon ? hueco + anchoCampeon : 0);
    const x0 = Math.max(mx, (W - anchoTotal) / 2);
    const xCol = (c) => x0 + anchos.slice(0, c).reduce((a, b) => a + b, 0) + c * hueco; // c = 0 es la previa si la hay
    const anchoCol = (c) => anchos[c];
    const xCampeon = x0 + anchoTotal - anchoCampeon;
    const colDeRonda = (r) => primera + (r - hoja.r0);

    // Partidos de esta hoja por ronda: [{ m (índice en la ronda), partido }]
    const porRonda = [];
    for (let k = 0; k < hoja.rondas; k++) {
      const r = hoja.r0 + k;
      const cuantos = hoja.n / (2 ** k);
      const desde = hoja.m0 / (2 ** k);
      porRonda.push(Array.from({ length: cuantos }, (_, i) => ({ m: desde + i, partido: arbol[r]?.[desde + i] })));
    }

    // ── Medidas y tamaño de letra: el mayor que deja caber todas las tarjetas ──
    const filaH = (abajoArea - arribaArea) / hoja.n;
    const medidas = (pt) => {
      const etqPt = Math.max(6.5, pt - 3);
      return { pt, etqPt, nombreLH: pt * MM_POR_PT * 1.18, etqLH: etqPt * MM_POR_PT * 1.3, pad: Math.max(1.1, pt * 0.13) };
    };
    // Un nombre en una línea a su tamaño; si no cabe, un poco más pequeño; y
    // si aun así no cabe, en dos líneas. Devuelve { lineas, pt }.
    const ajustarNombre = (texto, ancho, pt) => {
      const t = latin1(texto);
      if (!t) return { lineas: [''], pt };
      pdf.setFont('helvetica', 'bold');
      for (const f of [1, 0.92, 0.85, 0.8]) {
        pdf.setFontSize(pt * f);
        if (pdf.getTextWidth(t) <= ancho) return { lineas: [t], pt: pt * f };
      }
      const p2 = pt * 0.85;
      pdf.setFontSize(p2);
      const l = pdf.splitTextToSize(t, ancho);
      const lineas = l.length > 2 ? [l[0], `${String(l[1]).replace(/\s*\S*$/, '')}…`] : l;
      return { lineas, pt: p2 };
    };
    const esBye = (p) => !!p?.isBye;
    const conCabecera = (partido) => !(esBye(partido?.p1) || esBye(partido?.p2));
    const altoLinea = (pt) => pt * MM_POR_PT * 1.15;
    const altoFila = (nom, med) => Math.max(med.nombreLH, nom.lineas.length * altoLinea(nom.pt)) + 2 * med.pad;
    const altoCabecera = (med) => med.etqLH + 1.8;
    const medirCaja = (partido, med, ancho) => {
      const disp = ancho - 2 * med.pad - 1;
      const n1 = ajustarNombre(nombrePareja(partido?.p1), disp, med.pt);
      const n2 = ajustarNombre(nombrePareja(partido?.p2), disp, med.pt);
      const cab = conCabecera(partido) ? altoCabecera(med) : 0;
      return { n1, n2, cab, alto: cab + altoFila(n1, med) + altoFila(n2, med) };
    };
    let med = medidas(13);
    for (const pt of [13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7]) {
      med = medidas(pt);
      const peor = Math.max(...porRonda[0].map(({ partido }) => (partido ? medirCaja(partido, med, anchoCol(primera)).alto : 0)));
      if (peor <= filaH - 1.2) break;
    }

    // ── Cabecera: título y logo ──
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    const pagTxt = hojas.length > 1 ? `  (hoja ${iHoja + 1} de ${hojas.length})` : '';
    const tituloLineas = pdf.splitTextToSize(latin1(titulo) + pagTxt, W - 2 * mx - 50).slice(0, 2);
    pdf.text(tituloLineas, mx, 14);
    if (logo) {
      try {
        const props = pdf.getImageProperties(logo);
        const alto = 15;
        const ancho = alto * (props.width / props.height);
        pdf.addImage(logo, 'PNG', W - mx - ancho, 5, ancho, alto, undefined, 'FAST');
      } catch { /* sin logo */ }
    }

    // ── Nombres de ronda (pastillas verde claro, como en la app) ──
    const pastilla = (texto, x, ancho) => {
      pdf.setFillColor(...col.pastillaFondo);
      pdf.setDrawColor(...col.pastillaBorde);
      pdf.setLineWidth(0.35);
      pdf.roundedRect(x, 24, ancho, 7, 1.8, 1.8, 'FD');
      pdf.setTextColor(...col.pastillaTexto);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.text(latin1(texto).toUpperCase(), x + ancho / 2, 28.7, { align: 'center' });
    };
    if (conPrevia) pastilla(nombreRonda(0), xCol(0), anchoCol(0));
    for (let k = 0; k < hoja.rondas; k++) {
      const c = colDeRonda(hoja.r0 + k);
      pastilla(nombreRonda(realIdx(hoja.r0 + k)), xCol(c), anchoCol(c));
    }

    // ── Posiciones: primera ronda repartida en filas, las demás en medio ──
    const centro = porRonda.map(() => ({}));
    porRonda[0].forEach(({ m }, i) => { centro[0][m] = arribaArea + filaH * (i + 0.5); });
    for (let k = 1; k < porRonda.length; k++) {
      porRonda[k].forEach(({ m }) => { centro[k][m] = (centro[k - 1][2 * m] + centro[k - 1][2 * m + 1]) / 2; });
    }

    // ── Una tarjeta de partido, como en la app ──
    const caja = (partido, x, yc, ancho) => {
      const { n1, n2, cab, alto } = medirCaja(partido, med, ancho);
      const y = yc - alto / 2;
      const r = 2.2;
      // Sombra suave y tarjeta blanca con borde gris claro
      pdf.setFillColor(235, 239, 244);
      pdf.roundedRect(x + 0.5, y + 0.7, ancho, alto, r, r, 'F');
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.35);
      pdf.roundedRect(x, y, ancho, alto, r, r, 'FD');
      let yy = y;
      if (cab) {
        // Cabecera gris claro con la hora y la pista (o "ESPERANDO RIVAL"…)
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x + 0.2, y + 0.2, ancho - 0.4, cab, r - 0.2, r - 0.2, 'F');
        pdf.rect(x + 0.2, y + cab - r, ancho - 0.4, r, 'F');
        pdf.setDrawColor(226, 232, 240);
        pdf.line(x, y + cab, x + ancho, y + cab);
        const tenue = !partido?.time;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(med.etqPt);
        if (tenue) pdf.setTextColor(160, 171, 186); else pdf.setTextColor(71, 85, 105);
        const resultado = partido?.score ? latin1(partido.score) : '';
        const anchoRes = resultado ? pdf.getTextWidth(resultado) + 2 : 0;
        const etq = pdf.splitTextToSize(latin1(etiqueta(partido)).toUpperCase() || ' ', ancho - 2 * med.pad - anchoRes)[0];
        pdf.text(etq, x + med.pad + 0.4, y + cab - 1.15);
        if (resultado) {
          pdf.setTextColor(15, 23, 42);
          pdf.text(resultado, x + ancho - med.pad, y + cab - 1.15, { align: 'right' });
        }
        yy = y + cab;
      }
      // Las dos parejas
      [[partido?.p1, n1], [partido?.p2, n2]].forEach(([p, nom], i) => {
        const hF = altoFila(nom, med);
        const ganadora = !!(partido?.winner && esReal(p) && String(partido.winner.id) === String(p.id));
        const vacia = !latin1(nombrePareja(p));
        const fondo = ganadora ? [220, 252, 231] : (vacia ? col.vacio : null);
        if (fondo) {
          pdf.setFillColor(...fondo);
          if (i === 1) {
            // Las esquinas de abajo de la tarjeta son redondas
            pdf.roundedRect(x + 0.2, yy, ancho - 0.4, hF - 0.2, r - 0.2, r - 0.2, 'F');
            pdf.rect(x + 0.2, yy, ancho - 0.4, Math.min(r, hF - 0.2), 'F');
          } else if (!cab) {
            pdf.roundedRect(x + 0.2, yy + 0.2, ancho - 0.4, hF - 0.2, r - 0.2, r - 0.2, 'F');
            pdf.rect(x + 0.2, yy + hF - r, ancho - 0.4, r, 'F');
          } else {
            pdf.rect(x + 0.2, yy, ancho - 0.4, hF, 'F');
          }
        }
        if (!vacia) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(nom.pt);
          if (ganadora) pdf.setTextColor(21, 128, 61);
          else if (esBye(p)) pdf.setTextColor(100, 116, 139);
          else pdf.setTextColor(15, 23, 42);
          const lh = altoLinea(nom.pt);
          const altoTexto = nom.lineas.length * lh;
          const yTexto = yy + (hF - altoTexto) / 2; // centrado en su fila
          nom.lineas.forEach((l, j) => pdf.text(l, x + med.pad + 0.4, yTexto + lh * (j + 0.78)));
        }
        yy += hF;
        if (i === 0) {
          pdf.setDrawColor(226, 232, 240);
          pdf.setLineWidth(0.3);
          pdf.line(x + 0.2, yy, x + ancho - 0.2, yy);
        }
      });
      return { y, alto };
    };

    // ── Líneas suaves entre rondas ──
    const linea = (x1, y1, x2, y2) => {
      const xm = (x1 + x2) / 2;
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.4);
      pdf.line(x1, y1, xm, y1);
      pdf.line(xm, y1, xm, y2);
      pdf.line(xm, y2, x2, y2);
    };
    for (let k = 0; k < porRonda.length - 1; k++) {
      const cA = colDeRonda(hoja.r0 + k);
      const xa = xCol(cA) + anchoCol(cA);
      const xb = xCol(colDeRonda(hoja.r0 + k + 1));
      porRonda[k].forEach(({ m, partido }) => {
        if (!partido || (partido.p1?.isBye && partido.p2?.isBye)) return;
        linea(xa, centro[k][m], xb, centro[k + 1][Math.floor(m / 2)]);
      });
    }

    // ── Tarjetas ──
    porRonda.forEach((lista, k) => {
      const c = colDeRonda(hoja.r0 + k);
      lista.forEach(({ m, partido }) => {
        if (!partido || (partido.p1?.isBye && partido.p2?.isBye)) return;
        caja(partido, xCol(c), centro[k][m], anchoCol(c));
      });
    });

    // ── Ronda previa (a la izquierda, junto al hueco al que da pareja) ──
    if (conPrevia) {
      previa.forEach((pm) => {
        if (!Number.isFinite(pm?.nextSlot)) return;
        const t = Math.floor(pm.nextSlot / 2);
        if (centro[0][t] == null) return;
        const yObj = centro[0][t] + (pm.nextSlot % 2 === 0 ? -1 : 1) * Math.min(filaH / 4, 6);
        caja(pm, xCol(0), yObj, anchoCol(0));
        linea(xCol(0) + anchoCol(0), yObj, xCol(1), yObj);
      });
    }

    // ── Campeón ──
    if (conCampeon) {
      const kFin = porRonda.length - 1;
      const fin = porRonda[kFin]?.[0];
      const yc = fin ? centro[kFin][fin.m] : (arribaArea + abajoArea) / 2;
      const x = xCampeon;
      const ganador = fin?.partido?.winner;
      const nombre = latin1(ganador?.name || 'TBD');
      const ptC = Math.max(10, med.pt);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(ptC);
      const l = pdf.splitTextToSize(nombre, anchoCampeon - 5).slice(0, 2);
      const lhC = altoLinea(ptC);
      const altoBox = Math.max(16, l.length * lhC + 9);
      // Rótulo encima ("CAMPEÓN ABSOLUTO")
      pdf.setTextColor(217, 119, 6);
      pdf.setFontSize(9.5);
      pdf.text(latin1(textoCampeon), x + anchoCampeon / 2, yc - altoBox / 2 - 3, { align: 'center' });
      // Caja crema con borde dorado
      pdf.setFillColor(255, 251, 235);
      pdf.setDrawColor(245, 158, 11);
      pdf.setLineWidth(0.7);
      pdf.roundedRect(x, yc - altoBox / 2, anchoCampeon, altoBox, 2.5, 2.5, 'FD');
      pdf.setFontSize(ptC);
      if (ganador) pdf.setTextColor(21, 128, 61); else pdf.setTextColor(180, 83, 9);
      l.forEach((t, j) => pdf.text(t, x + anchoCampeon / 2, yc - (l.length - 1) * lhC / 2 + j * lhC + 1.3, { align: 'center' }));
      const cF = colDeRonda(hoja.r0 + kFin);
      linea(xCol(cF) + anchoCol(cF), yc, x, yc);
    }

    // ── Pie ──
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text('padelmedina.com', mx, H - 3);
  });
  return hojas.length;
}
