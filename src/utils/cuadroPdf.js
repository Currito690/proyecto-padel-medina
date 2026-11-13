// PDF del cuadro de un torneo DIBUJADO (no una foto de la pantalla): hoja A4
// apaisada, letra grande y nítida, nombres largos en dos líneas. Antes era una
// captura del cuadro encogida para caber en un A4 vertical y la letra salía de
// unos 5 puntos ("no se ve nada").
//
// Si la primera ronda tiene más de 8 partidos, el cuadro se reparte en varias
// hojas: cada una con 8 partidos de la primera ronda y su parte del cuadro, y
// una hoja más con las rondas finales.
//
// rondas: [[partido, …], …] como rounds[cat] / consRounds[cat] del panel.
// opciones:
//   titulo, subtitulo (texto), colorPrincipal ([r,g,b]), logo (dataURL o null)
//   nombreRonda(indiceReal) → "Cuartos de Final"…
//   etiqueta(partido) → texto de la cabecera de cada partido (hora y pista…)
//   nombrePareja(lado) → texto de una pareja o hueco (BYE, por decidir…)

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

export function dibujarCuadroPdf(pdf, rondas, opciones) {
  const {
    titulo = '', subtitulo = '', colorPrincipal = [22, 163, 74], logo = null,
    nombreRonda = (r) => `Ronda ${r + 1}`, etiqueta = () => '', nombrePareja = (p) => p?.name || '',
  } = opciones || {};
  const hayPrevia = !!rondas?.[0]?.[0]?.isPrelim;
  const previa = hayPrevia ? (rondas[0] || []) : [];
  const arbol = (hayPrevia ? rondas.slice(1) : rondas).filter((r) => Array.isArray(r) && r.length);
  if (!arbol.length) return 0;
  const realIdx = (r) => (hayPrevia ? r + 1 : r);
  const hojas = planificarHojas(arbol.length, arbol[0].length);

  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const mx = 8;
  const arribaArea = 30; // debajo del título y de los nombres de ronda
  const abajoArea = H - 9;
  const hueco = 7; // entre columnas (para las líneas)

  hojas.forEach((hoja, iHoja) => {
    if (iHoja > 0) pdf.addPage('a4', 'landscape');
    const conPrevia = hayPrevia && hoja.r0 === 0;
    const conCampeon = !!hoja.final;
    const colsCuadro = hoja.rondas + (conPrevia ? 1 : 0);
    const anchoCampeon = conCampeon ? 40 : 0;
    // Columnas tan anchas como quepan, pero no más de 85 mm (con pocas rondas
    // salían cajas enormes); lo que sobra se reparte a los lados.
    const colW = Math.min(85, (W - 2 * mx - anchoCampeon - (colsCuadro - 1) * hueco - (conCampeon ? hueco : 0)) / colsCuadro);
    const anchoTotal = colsCuadro * colW + (colsCuadro - 1) * hueco + (conCampeon ? hueco + anchoCampeon : 0);
    const x0 = Math.max(mx, (W - anchoTotal) / 2);
    const xCol = (c) => x0 + c * (colW + hueco); // c = 0 es la previa si la hay
    const xCampeon = x0 + anchoTotal - anchoCampeon;
    const colDeRonda = (r) => (conPrevia ? 1 : 0) + (r - hoja.r0);

    // Partidos de esta hoja por ronda: [{ m (índice en la ronda), partido }]
    const porRonda = [];
    for (let k = 0; k < hoja.rondas; k++) {
      const r = hoja.r0 + k;
      const cuantos = hoja.n / (2 ** k);
      const desde = hoja.m0 / (2 ** k);
      porRonda.push(Array.from({ length: cuantos }, (_, i) => ({ m: desde + i, partido: arbol[r]?.[desde + i] })));
    }

    // Tamaño de letra: el mayor que deja caber todas las cajas de la primera
    // ronda de la hoja (con los nombres partidos en dos líneas si hace falta).
    const filaH = (abajoArea - arribaArea) / hoja.n;
    const medidas = (pt) => {
      const nombreLH = pt * MM_POR_PT * 1.18;
      const etqPt = Math.max(6.5, pt - 2.5);
      const etqLH = etqPt * MM_POR_PT * 1.25;
      return { pt, etqPt, nombreLH, etqLH };
    };
    const lineasDe = (texto, ancho, pt) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(pt);
      const l = pdf.splitTextToSize(latin1(texto) || ' ', ancho);
      return l.length > 2 ? [l[0], `${l[1].replace(/\s*\S*$/, '')}…`] : l;
    };
    const altoCaja = (partido, med, ancho) => {
      const l1 = lineasDe(nombrePareja(partido?.p1, partido, 'p1'), ancho - 4, med.pt).length;
      const l2 = lineasDe(nombrePareja(partido?.p2, partido, 'p2'), ancho - 4, med.pt).length;
      return med.etqLH + 1.6 + (l1 + l2) * med.nombreLH + 3.2;
    };
    let med = medidas(12);
    for (const pt of [12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7]) {
      med = medidas(pt);
      const anchoPrimera = colW;
      const peor = Math.max(...porRonda[0].map(({ partido }) => (partido ? altoCaja(partido, med, anchoPrimera) : 0)));
      if (peor <= filaH - 1.2) break;
    }

    // ── Cabecera ──
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(latin1(titulo), mx, 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
    pdf.setTextColor(71, 85, 105);
    const pagTxt = hojas.length > 1 ? `  ·  Hoja ${iHoja + 1} de ${hojas.length}` : '';
    pdf.text(latin1(subtitulo) + pagTxt, mx, 18.5);
    if (logo) {
      try {
        const props = pdf.getImageProperties(logo);
        const alto = 13;
        const ancho = alto * (props.width / props.height);
        pdf.addImage(logo, 'PNG', W - mx - ancho, 5, ancho, alto, undefined, 'FAST');
      } catch { /* sin logo */ }
    }

    // ── Nombres de ronda ──
    const pastilla = (texto, x, ancho) => {
      pdf.setFillColor(colorPrincipal[0], colorPrincipal[1], colorPrincipal[2]);
      pdf.roundedRect(x, 22, ancho, 6, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(latin1(texto).toUpperCase(), x + ancho / 2, 26.1, { align: 'center' });
    };
    if (conPrevia) pastilla(nombreRonda(0), xCol(0), colW);
    for (let k = 0; k < hoja.rondas; k++) pastilla(nombreRonda(realIdx(hoja.r0 + k)), xCol(colDeRonda(hoja.r0 + k)), colW);
    if (conCampeon) pastilla('Campeón', xCampeon, anchoCampeon);

    // ── Posiciones: primera ronda repartida en filas, las demás en medio ──
    const centro = porRonda.map(() => ({}));
    porRonda[0].forEach(({ m }, i) => { centro[0][m] = arribaArea + filaH * (i + 0.5); });
    for (let k = 1; k < porRonda.length; k++) {
      porRonda[k].forEach(({ m }) => { centro[k][m] = (centro[k - 1][2 * m] + centro[k - 1][2 * m + 1]) / 2; });
    }

    // ── Una caja de partido ──
    const caja = (partido, x, yc, ancho, idxReal) => {
      const n1 = lineasDe(nombrePareja(partido?.p1, partido, 'p1'), ancho - 4, med.pt);
      const n2 = lineasDe(nombrePareja(partido?.p2, partido, 'p2'), ancho - 4, med.pt);
      const alto = med.etqLH + 1.6 + (n1.length + n2.length) * med.nombreLH + 3.2;
      const y = yc - alto / 2;
      pdf.setDrawColor(100, 116, 139);
      pdf.setLineWidth(0.3);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, y, ancho, alto, 1.4, 1.4, 'FD');
      // Cabecera: hora y pista (o "Esperando rival"…), y el resultado si lo hay
      const etqH = med.etqLH + 1.6;
      pdf.setFillColor(241, 245, 249);
      pdf.rect(x + 0.2, y + 0.2, ancho - 0.4, etqH - 0.2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(med.etqPt);
      pdf.setTextColor(51, 65, 85);
      const resultado = partido?.score ? latin1(partido.score) : '';
      const anchoRes = resultado ? pdf.getTextWidth(resultado) + 2 : 0;
      const etq = pdf.splitTextToSize(latin1(etiqueta(partido, idxReal)) || ' ', ancho - 3.5 - anchoRes)[0];
      pdf.text(etq, x + 1.8, y + etqH - 1.15);
      if (resultado) pdf.text(resultado, x + ancho - 1.8, y + etqH - 1.15, { align: 'right' });
      pdf.setDrawColor(203, 213, 225);
      pdf.line(x, y + etqH, x + ancho, y + etqH);
      // Parejas
      let yy = y + etqH + 0.9;
      [[partido?.p1, n1], [partido?.p2, n2]].forEach(([p, lineas], i) => {
        const ganadora = !!(partido?.winner && esReal(p) && String(partido.winner.id) === String(p.id));
        const altoPareja = lineas.length * med.nombreLH + 0.7;
        if (ganadora) {
          pdf.setFillColor(220, 252, 231);
          pdf.rect(x + 0.2, yy - 0.5, ancho - 0.4, altoPareja + 0.4, 'F');
        }
        const hueca = !esReal(p);
        pdf.setFont('helvetica', hueca ? 'italic' : 'bold');
        pdf.setFontSize(med.pt);
        if (ganadora) pdf.setTextColor(21, 128, 61);
        else if (hueca) pdf.setTextColor(148, 163, 184);
        else pdf.setTextColor(15, 23, 42);
        lineas.forEach((l, j) => pdf.text(l, x + 2, yy + med.nombreLH * (j + 0.78)));
        yy += altoPareja;
        if (i === 0) {
          pdf.setDrawColor(226, 232, 240);
          pdf.line(x + 1, yy + 0.2, x + ancho - 1, yy + 0.2);
          yy += 0.9;
        }
      });
      return { y, alto };
    };

    // ── Líneas entre rondas ──
    pdf.setLineWidth(0.35);
    const linea = (x1, y1, x2, y2) => {
      const xm = (x1 + x2) / 2;
      pdf.setDrawColor(148, 163, 184);
      pdf.line(x1, y1, xm, y1);
      pdf.line(xm, y1, xm, y2);
      pdf.line(xm, y2, x2, y2);
    };
    for (let k = 0; k < porRonda.length - 1; k++) {
      const xa = xCol(colDeRonda(hoja.r0 + k)) + colW;
      const xb = xCol(colDeRonda(hoja.r0 + k + 1));
      porRonda[k].forEach(({ m, partido }) => {
        if (!partido || (partido.p1?.isBye && partido.p2?.isBye)) return;
        linea(xa, centro[k][m], xb, centro[k + 1][Math.floor(m / 2)]);
      });
    }

    // ── Cajas ──
    porRonda.forEach((lista, k) => {
      const r = hoja.r0 + k;
      lista.forEach(({ m, partido }) => {
        if (!partido || (partido.p1?.isBye && partido.p2?.isBye)) return;
        caja(partido, xCol(colDeRonda(r)), centro[k][m], colW, realIdx(r));
      });
    });

    // ── Ronda previa (va a la izquierda, junto al hueco al que da pareja) ──
    if (conPrevia) {
      previa.forEach((pm) => {
        if (!Number.isFinite(pm?.nextSlot)) return;
        const t = Math.floor(pm.nextSlot / 2);
        if (centro[0][t] == null) return;
        const yObj = centro[0][t] + (pm.nextSlot % 2 === 0 ? -1 : 1) * Math.min(filaH / 4, 6);
        caja(pm, xCol(0), yObj, colW, 0);
        linea(xCol(0) + colW, yObj, xCol(1), yObj);
      });
    }

    // ── Campeón ──
    if (conCampeon) {
      const ultima = porRonda[porRonda.length - 1];
      const fin = ultima?.[0];
      const yc = fin ? centro[porRonda.length - 1][fin.m] : (arribaArea + abajoArea) / 2;
      const x = xCampeon;
      const ganador = fin?.partido?.winner;
      pdf.setDrawColor(colorPrincipal[0], colorPrincipal[1], colorPrincipal[2]);
      pdf.setLineWidth(0.6);
      pdf.setFillColor(255, 251, 235);
      pdf.roundedRect(x, yc - 9, anchoCampeon, 18, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(med.pt);
      pdf.setTextColor(ganador ? 21 : 148, ganador ? 128 : 163, ganador ? 61 : 184);
      const l = pdf.splitTextToSize(latin1(ganador?.name || 'Por decidir'), anchoCampeon - 4).slice(0, 2);
      l.forEach((t, j) => pdf.text(t, x + anchoCampeon / 2, yc - (l.length - 1) * med.nombreLH / 2 + j * med.nombreLH + 1.2, { align: 'center' }));
      const xf = xCol(colDeRonda(hoja.r0 + porRonda.length - 1)) + colW;
      pdf.setLineWidth(0.35);
      linea(xf, yc, x, yc);
    }

    // ── Pie ──
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text('padelmedina.com', mx, H - 4);
  });
  return hojas.length;
}
