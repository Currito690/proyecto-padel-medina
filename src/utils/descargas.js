import { Capacitor } from '@capacitor/core';

// Descargas que funcionan también dentro de la app (Capacitor). El WebView de
// iPhone y Android ignora el atributo `download` de un enlace, así que allí el
// archivo se escribe en la caché de la app y se abre la hoja de compartir del
// sistema (Guardar imagen, Archivos, WhatsApp…). En la web, descarga normal.

const dataUrlABlob = (dataUrl) => {
  const [cabecera, datos = ''] = String(dataUrl).split(',');
  const tipo = (cabecera.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream';
  if (/;base64/i.test(cabecera)) {
    const bin = atob(datos);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: tipo });
  }
  return new Blob([decodeURIComponent(datos)], { type: tipo });
};

const blobABase64 = (blob) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result).split(',')[1] || '');
  lector.onerror = () => reject(lector.error || new Error('No se pudo leer el archivo'));
  lector.readAsDataURL(blob);
});

const nombreSeguro = (nombre) => String(nombre || 'archivo').replace(/[\\/:*?"<>|]+/g, '_');

const descargaWeb = (blob, nombre) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revocar más tarde: en Safari/iPhone y Firefox revocar de inmediato puede
  // cancelar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// Guarda o comparte un Blob con el nombre dado. Devuelve true si se hizo algo
// (también si el usuario cerró la hoja de compartir sin elegir nada).
export async function descargarBlob(blob, nombre) {
  const archivo = nombreSeguro(nombre);
  if (Capacitor.isNativePlatform()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const escrito = await Filesystem.writeFile({ path: archivo, data: await blobABase64(blob), directory: Directory.Cache });
      await Share.share({ title: archivo, files: [escrito.uri] });
      return true;
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/cancel/i.test(msg)) return true;
      console.warn('No se pudo compartir desde la app; se intenta la descarga normal:', msg);
    }
  }
  descargaWeb(blob, archivo);
  return true;
}

export const descargarDataUrl = (dataUrl, nombre) => descargarBlob(dataUrlABlob(dataUrl), nombre);

export const descargarTexto = (texto, nombre, tipo = 'text/csv;charset=utf-8') =>
  descargarBlob(new Blob([texto], { type: tipo }), nombre);
