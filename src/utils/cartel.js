// Prepara el cartel de un torneo en el navegador antes de subirlo:
//  - `cartel`: JPEG con el lado mayor a 1600 px como mucho, para la página.
//  - `vistaPrevia`: JPEG de 1200×630 con el cartel entero centrado sobre un
//    fondo difuminado, para la vista previa del enlace (WhatsApp, Facebook,
//    Telegram…). Se mantiene por debajo de ~280 KB porque, si pesa más,
//    WhatsApp enseña solo una miniatura.

const LADO_MAXIMO = 1600;
const PESO_MAXIMO_CARTEL = 900 * 1024;
const PESO_MAXIMO_VISTA_PREVIA = 280 * 1024;

const cargarImagen = (archivo) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
  img.src = url;
});

const aJpeg = (canvas, calidad) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/jpeg', calidad);
});

// JPEG que no supere `maxBytes`: baja la calidad hasta conseguirlo.
const jpegLimitado = async (canvas, maxBytes, calidadInicial) => {
  let calidad = calidadInicial;
  let blob = await aJpeg(canvas, calidad);
  while (blob.size > maxBytes && calidad > 0.4) {
    calidad -= 0.08;
    blob = await aJpeg(canvas, calidad);
  }
  return blob;
};

const lienzo = (ancho, alto) => {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return c;
};

export async function prepararCartel(archivo) {
  if (!archivo || !/^image\//.test(archivo.type)) throw new Error('El cartel tiene que ser una imagen (JPG, PNG o WebP).');
  const img = await cargarImagen(archivo);
  const ancho = img.naturalWidth;
  const alto = img.naturalHeight;
  if (!ancho || !alto) throw new Error('La imagen está vacía');

  // 1) Cartel para la página.
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
  const c1 = lienzo(Math.round(ancho * escala), Math.round(alto * escala));
  const g1 = c1.getContext('2d');
  g1.fillStyle = '#FFFFFF'; // un PNG con transparencia queda sobre blanco
  g1.fillRect(0, 0, c1.width, c1.height);
  g1.drawImage(img, 0, 0, c1.width, c1.height);
  const cartel = await jpegLimitado(c1, PESO_MAXIMO_CARTEL, 0.86);

  // 2) Vista previa 1200×630: fondo = el propio cartel muy reducido y vuelto a
  //    ampliar (difuminado barato que funciona en todos los navegadores),
  //    oscurecido, y encima el cartel entero centrado.
  const c2 = lienzo(1200, 630);
  const g2 = c2.getContext('2d');
  const mini = lienzo(24, 13);
  const gm = mini.getContext('2d');
  const escalaCubrir = Math.max(24 / ancho, 13 / alto);
  const wm = ancho * escalaCubrir;
  const hm = alto * escalaCubrir;
  gm.drawImage(img, (24 - wm) / 2, (13 - hm) / 2, wm, hm);
  g2.imageSmoothingEnabled = true;
  g2.imageSmoothingQuality = 'high';
  g2.drawImage(mini, 0, 0, 1200, 630);
  g2.fillStyle = 'rgba(15, 23, 42, 0.45)';
  g2.fillRect(0, 0, 1200, 630);
  const escalaCaber = Math.min(1200 / ancho, 630 / alto);
  const w2 = Math.round(ancho * escalaCaber);
  const h2 = Math.round(alto * escalaCaber);
  g2.drawImage(img, Math.round((1200 - w2) / 2), Math.round((630 - h2) / 2), w2, h2);
  const vistaPrevia = await jpegLimitado(c2, PESO_MAXIMO_VISTA_PREVIA, 0.82);

  return { cartel, vistaPrevia, ancho: c1.width, alto: c1.height };
}
