# Padel Medina en el App Store (iPhone) — guía turnkey

La app de Android es una **TWA**. Para iPhone usamos **Capacitor**, que envuelve la
MISMA web en una app nativa que Apple sí acepta. He dejado el proyecto **listo**;
en tu Mac son 4 pasos + enviar. Lo que NO se puede hacer desde Windows (generar el
proyecto Xcode, compilar y enviar) es lo único que queda para el Mac.

---

## YA HECHO (desde aquí, no tienes que tocarlo)
- **Capacitor 8** instalado con los plugins de iPhone: `app`, `browser`,
  `push-notifications`, `splash-screen`, `status-bar` (en `package.json`).
- **`capacitor.config.json`**: appId `com.padelmedina.app`, nombre "Padel Medina",
  carga la web de `dist/`, splash y push configurados.
- **Arranque nativo** en `src/native/capacitorBootstrap.js` (barra de estado,
  splash, enlaces profundos y registro de push). Se activa SOLO en la app de
  iPhone: en la web y en la app Android no se ejecuta (cero impacto).
- **Iconos/splash fuente** en `resources/` (`icon.png` 1024, `splash.png` 2732).
- Atajos en `package.json`: `npm run ios:sync`, `npm run ios:open`.

---

## EN TU MAC (MacBook Pro M5)

### Requisitos (una vez)
1. **Xcode** desde la App Store del Mac.
2. **CocoaPods**: en Terminal `sudo gem install cocoapods`.
3. **Node.js** (https://nodejs.org) si no lo tienes.
4. Cuenta **Apple Developer** (los 99 €/año que ya pagaste) activa.

### Paso 1 — Traer el proyecto y generar iOS
En la carpeta del proyecto, en la Terminal:
```
npm install
npx @capacitor/assets generate --ios     # iconos y splash a todos los tamaños
npm run build
npx cap add ios                           # crea la carpeta ios/ (solo la 1ª vez)
npm run ios:open                          # compila la web, la mete y abre Xcode
```

### Paso 2 — Xcode: firma e identidad
1. Proyecto **App** → pestaña **Signing & Capabilities**.
2. **Team**: tu cuenta de Apple Developer. **Bundle Identifier**: `com.padelmedina.app`.
3. Marca **Automatically manage signing**.
4. Añade la capacidad **Push Notifications** (botón "+ Capability") — para los avisos.
5. Dale a **▶ Run** con un iPhone conectado (o el simulador) para ver que abre.

### Paso 3 — Los 3 remates (los vemos juntos cuando llegues aquí)
Están andamiados en el código; hay que probarlos en el dispositivo:
1. **Push de Apple (APNs).** El registro ya está; falta crear la **clave APNs** en
   la cuenta de Apple y que el servidor mande los avisos por APNs (hoy la web usa
   web-push, que en iPhone no vale). Es trabajo de servidor aparte.
2. **Vuelta del pago (Redsys).** El enrutado del enlace de vuelta está puesto
   (`appUrlOpen`); hay que verificar el flujo de pago real en el iPhone y, si hace
   falta, abrir Redsys con el navegador dentro de la app.
3. **Enlaces del correo** (confirmar cuenta / recuperar contraseña): mismo
   mecanismo; comprobar que abren la pantalla correcta.

### Paso 4 — App Store Connect (la ficha de Apple)
1. https://appstoreconnect.apple.com → **Mis apps** → **+** → **Nueva app**.
   Nombre "Padel Medina", idioma Español, bundle `com.padelmedina.app`.
2. Rellena: descripción (reaprovecha `android/play-assets/ficha-play.md`),
   capturas de iPhone, categoría **Deportes**, política de privacidad
   `https://padelmedina.com/privacidad`, datos de contacto.
3. **Privacidad de la app** (como el "Data safety" de Google): nombre, correo,
   teléfono, ubicación (fichaje del personal), historial de reservas. Tarjeta: NO
   (va directa a Redsys).
4. **Cuenta de revisor**: `play-review-client@padelmedina.com` (sirve igual) y nota:
   *"Payments are for booking physical padel courts (real-world service) via
   Redsys, the Spanish bank gateway. No digital goods."*

### Paso 5 — Subir y enviar a revisión
1. En Xcode: **Product → Archive** → **Distribute App → App Store Connect → Upload**.
2. En App Store Connect, elige ese build en la versión y **Enviar a revisión**.
3. Apple revisa en **1–3 días** (puede pedir aclaraciones; se contestan y listo).

---

## Por qué Apple NO la rechaza
- No parece "solo una web": icono y splash propios, barra de estado nativa y
  **push nativo** (por eso añadimos la capacidad en el Paso 2).
- Los **pagos** son de un **servicio físico real** (reserva de pista) → Apple los
  permite; no obliga a su pasarela. Se deja claro en la nota al revisor.

## Costes
- 99 €/año Apple Developer (ya pagado). Mac: ya lo tienes. 0 € extra.
