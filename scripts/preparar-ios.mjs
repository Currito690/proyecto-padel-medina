// Deja el proyecto de iPhone (carpeta ios/, que solo existe en el Mac y no va a
// git) listo para los avisos push y para "Continuar con Google", sin tener que
// tocar Xcode a mano. Lo lanzan `npm run ios:sync` y `npm run ios:open` después
// de `cap sync ios`. Se puede ejecutar las veces que haga falta: si algo ya está
// puesto, no lo vuelve a poner.
//
// 1. AppDelegate.swift: los dos métodos que pasan a Capacitor el token de
//    avisos de Apple (sin ellos el iPhone nunca recibe avisos).
// 2. Capacidades "Push Notifications" (aps-environment) y "Sign in with Apple"
//    en el .entitlements.
// 3. Info.plist: el esquema de URL de Google (com.googleusercontent.apps.…),
//    sacado del ID de cliente de src/utils/googleNativo.js.
// 4. Solo iPhone (TARGETED_DEVICE_FAMILY = 1): Apple no pide capturas de iPad.
// 5. Info.plist para la App Store: sin cifrado propio (no pregunta en cada
//    subida), textos de permisos en español, idioma principal español y solo
//    en vertical.
// 6. Manifiesto de privacidad (PrivacyInfo.xcprivacy) dentro de la app: sin él
//    Apple rechaza la subida (ITMS-91053).
// 7. Icono: avisa si es el de Capacitor por defecto o si tiene transparencia
//    (canal alfa), que Apple rechaza. No toca imágenes: solo dice qué hacer.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const RAIZ = process.cwd();
const IOS_APP = path.join(RAIZ, 'ios', 'App');
const APP_DIR = path.join(IOS_APP, 'App');
const PBXPROJ = path.join(IOS_APP, 'App.xcodeproj', 'project.pbxproj');

const ok = (m) => console.log(`  ✓ ${m}`);
const hecho = (m) => console.log(`  + ${m}`);
const aviso = (m) => console.warn(`  ! ${m}`);

if (!fs.existsSync(APP_DIR)) {
  console.log('preparar-ios: no hay carpeta ios/App/App (esto solo hace falta en el Mac).');
  process.exit(0);
}
console.log('preparar-ios: revisando el proyecto de iPhone…');

// ── 1. AppDelegate.swift ─────────────────────────────────────────────────────
function prepararAppDelegate() {
  const fichero = path.join(APP_DIR, 'AppDelegate.swift');
  if (!fs.existsSync(fichero)) return aviso('No encuentro AppDelegate.swift: añade los métodos de push a mano.');
  let src = fs.readFileSync(fichero, 'utf8');
  if (src.includes('capacitorDidRegisterForRemoteNotifications')) return ok('AppDelegate ya pasa el token de avisos a Capacitor');

  const fin = src.lastIndexOf('}');
  if (fin < 0 || src.slice(fin + 1).trim() !== '') {
    return aviso('AppDelegate.swift tiene un formato inesperado: añade los métodos de push a mano.');
  }
  const bloque = [
    '',
    '    // Avisos push: Capacitor necesita que le pasemos el token de Apple',
    '    // (lo añade scripts/preparar-ios.mjs).',
    '    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {',
    '        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)',
    '    }',
    '',
    '    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {',
    '        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)',
    '    }',
    '',
  ].join('\n');
  src = src.slice(0, fin).trimEnd() + '\n' + bloque + '}\n';
  if (!/^import Capacitor\b/m.test(src)) src = src.replace(/^import UIKit.*$/m, (l) => `${l}\nimport Capacitor`);
  fs.writeFileSync(fichero, src);
  hecho('AppDelegate: añadidos los métodos de avisos push');
}

// ── 2. Capacidad Push Notifications (aps-environment) ────────────────────────
function prepararEntitlements() {
  if (!fs.existsSync(PBXPROJ)) return aviso('No encuentro project.pbxproj: añade la capacidad Push Notifications en Xcode.');
  let pbx = fs.readFileSync(PBXPROJ, 'utf8');

  // ¿Qué .entitlements usa ya el target? (lo creó Xcode al añadir Sign in with Apple)
  const usado = pbx.match(/CODE_SIGN_ENTITLEMENTS = "?([^";]+)"?;/);
  let rel = usado ? usado[1].trim() : 'App/App.entitlements';
  const fichero = path.join(IOS_APP, rel);

  if (!fs.existsSync(fichero)) {
    fs.writeFileSync(fichero, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n'));
    hecho(`creado ${rel}`);
  }

  // Que el target App apunte a ese fichero en Debug y en Release (sus bloques
  // de ajustes son los que usan App/Info.plist).
  if (!usado) {
    let n = 0;
    pbx = pbx.replace(/buildSettings = \{([^}]*?)\};/gs, (bloque, dentro) => {
      if (!dentro.includes('INFOPLIST_FILE = App/Info.plist;') || dentro.includes('CODE_SIGN_ENTITLEMENTS')) return bloque;
      n++;
      return bloque.replace('buildSettings = {', `buildSettings = {\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = ${rel};`);
    });
    if (n > 0) {
      fs.writeFileSync(PBXPROJ, pbx);
      hecho(`el target App usa ${rel} (${n} configuraciones)`);
    } else {
      aviso('No he podido enlazar el .entitlements: añade la capacidad Push Notifications en Xcode.');
    }
  }

  let ent = fs.readFileSync(fichero, 'utf8');
  const faltan = [];
  // "development" es lo correcto en el proyecto: al subir a la App Store, Xcode
  // lo cambia solo a "production".
  if (ent.includes('<key>aps-environment</key>')) ok('capacidad Push Notifications ya activada');
  else faltan.push(['Push Notifications (aps-environment)', '\t<key>aps-environment</key>\n\t<string>development</string>\n']);
  // Sin esta capacidad "Continuar con Apple" falla (error 1000) y Apple rechaza
  // la app. En el Mac ya la puso Xcode; esto cubre un ios/ regenerado.
  if (ent.includes('<key>com.apple.developer.applesignin</key>')) ok('capacidad Sign in with Apple ya activada');
  else faltan.push(['Sign in with Apple', '\t<key>com.apple.developer.applesignin</key>\n\t<array>\n\t\t<string>Default</string>\n\t</array>\n']);
  if (faltan.length === 0) return;

  const cierre = ent.lastIndexOf('</dict>');
  if (cierre < 0) return aviso(`${rel} tiene un formato inesperado: añade en Xcode > Signing & Capabilities: ${faltan.map((f) => f[0]).join(' y ')}.`);
  ent = ent.slice(0, cierre) + faltan.map((f) => f[1]).join('') + ent.slice(cierre);
  fs.writeFileSync(fichero, ent);
  hecho(`${faltan.length > 1 ? 'capacidades' : 'capacidad'} ${faltan.map((f) => f[0]).join(' y ')} ${faltan.length > 1 ? 'activadas' : 'activada'}`);
}

// ── 3. Esquema de URL de Google en Info.plist ────────────────────────────────
function prepararGoogle() {
  const cfg = path.join(RAIZ, 'src', 'utils', 'googleNativo.js');
  const m = fs.existsSync(cfg) && fs.readFileSync(cfg, 'utf8').match(/GOOGLE_IOS_CLIENT_ID\s*=\s*'([^']+)\.apps\.googleusercontent\.com'/);
  if (!m) return ok('sin ID de Google para iPhone: no hace falta esquema');
  const esquema = `com.googleusercontent.apps.${m[1]}`;

  const fichero = path.join(APP_DIR, 'Info.plist');
  if (!fs.existsSync(fichero)) return aviso(`No encuentro Info.plist: añade en Xcode > Info > URL Types el esquema ${esquema}`);
  let plist = fs.readFileSync(fichero, 'utf8');
  if (plist.includes(`<string>${esquema}</string>`)) return ok('esquema de URL de Google ya puesto');

  const tipo = [
    '\t\t<dict>',
    '\t\t\t<key>CFBundleTypeRole</key>',
    '\t\t\t<string>Editor</string>',
    '\t\t\t<key>CFBundleURLName</key>',
    '\t\t\t<string>google</string>',
    '\t\t\t<key>CFBundleURLSchemes</key>',
    '\t\t\t<array>',
    `\t\t\t\t<string>${esquema}</string>`,
    '\t\t\t</array>',
    '\t\t</dict>',
  ].join('\n');

  const lista = plist.match(/<key>CFBundleURLTypes<\/key>\s*<array>/);
  if (lista) {
    const pos = lista.index + lista[0].length;
    plist = plist.slice(0, pos) + '\n' + tipo + plist.slice(pos);
  } else {
    const cierre = plist.lastIndexOf('</dict>');
    if (cierre < 0) return aviso(`Info.plist tiene un formato inesperado: añade el esquema ${esquema} en Xcode.`);
    plist = plist.slice(0, cierre) + '\t<key>CFBundleURLTypes</key>\n\t<array>\n' + tipo + '\n\t</array>\n' + plist.slice(cierre);
  }
  fs.writeFileSync(fichero, plist);
  hecho('esquema de URL de Google añadido a Info.plist');
}

// ── 4. Solo iPhone ───────────────────────────────────────────────────────────
// La plantilla de Capacitor sale para iPhone y iPad ("1,2"). Con "1" Apple no
// exige capturas de iPad para la ficha de la App Store.
function prepararSoloIphone() {
  const aMano = 'en Xcode > App > General > Supported Destinations, deja solo iPhone.';
  if (!fs.existsSync(PBXPROJ)) return aviso(`No encuentro project.pbxproj: ${aMano}`);
  let pbx = fs.readFileSync(PBXPROJ, 'utf8');
  let bloques = 0;
  let cambios = 0;
  pbx = pbx.replace(/buildSettings = \{([^}]*?)\};/gs, (bloque, dentro) => {
    if (!dentro.includes('INFOPLIST_FILE = App/Info.plist;')) return bloque;
    bloques++;
    const actual = dentro.match(/TARGETED_DEVICE_FAMILY = "?([^";]*)"?;/);
    if (actual && actual[1].trim() === '1') return bloque;
    cambios++;
    if (actual) return bloque.replace(actual[0], 'TARGETED_DEVICE_FAMILY = 1;');
    return bloque.replace(/(\n[\t ]*)\};$/, '\n\t\t\t\tTARGETED_DEVICE_FAMILY = 1;$1};');
  });
  if (bloques === 0) return aviso(`No encuentro los ajustes del target App: ${aMano}`);
  if (cambios === 0) return ok('la app es solo para iPhone (sin iPad)');
  fs.writeFileSync(PBXPROJ, pbx);
  hecho(`la app queda solo para iPhone: Apple no pedirá capturas de iPad (${cambios} configuraciones)`);
}

// ── 5. Info.plist para la App Store ──────────────────────────────────────────
// Textos que iOS enseña al pedir cada permiso. Sin ellos iOS no da el permiso
// (con la cámara, la app se cierra) y Apple la rechaza. Solo los permisos que
// la web usa de verdad (micrófono, contactos o calendario no hacen falta):
// ubicación (fichaje del monitor, MonitorView) y cámara/fotos (subir el cartel
// de un evento, EventsManager; el selector de iPhone ofrece "Hacer foto").
const PERMISOS = [
  ['NSLocationWhenInUseUsageDescription', 'ubicación',
    'Padel Medina usa tu ubicación solo para fichar la entrada y salida del monitor en el club.'],
  ['NSCameraUsageDescription', 'cámara',
    'Padel Medina usa la cámara solo si eliges hacer una foto para subirla, por ejemplo el cartel de un evento.'],
  ['NSPhotoLibraryUsageDescription', 'fotos',
    'Padel Medina accede a tus fotos solo para subir la imagen que elijas, por ejemplo el cartel de un evento.'],
];

const xml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function prepararInfoPlist() {
  const fichero = path.join(APP_DIR, 'Info.plist');
  if (!fs.existsSync(fichero)) return aviso('No encuentro Info.plist: añade en Xcode > Info los textos de permisos y ITSAppUsesNonExemptEncryption = NO.');
  let plist = fs.readFileSync(fichero, 'utf8');
  const antes = plist;
  if (plist.lastIndexOf('</dict>') < 0) return aviso('Info.plist tiene un formato inesperado: añade en Xcode > Info los textos de permisos y ITSAppUsesNonExemptEncryption = NO.');
  const tiene = (clave) => plist.includes(`<key>${clave}</key>`);
  const poner = (clave, valor) => {
    const cierre = plist.lastIndexOf('</dict>');
    plist = plist.slice(0, cierre) + `\t<key>${clave}</key>\n\t${valor}\n` + plist.slice(cierre);
  };

  // Cifrado: la app solo usa HTTPS normal (exento), así que App Store Connect
  // no tiene que preguntar por el cumplimiento de exportación en cada subida.
  if (!tiene('ITSAppUsesNonExemptEncryption')) {
    poner('ITSAppUsesNonExemptEncryption', '<false/>');
    hecho('Info.plist: la app declara que no usa cifrado propio (no preguntará al subir)');
  } else if (/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/.test(plist)) {
    ok('cifrado ya declarado (ITSAppUsesNonExemptEncryption = NO)');
  } else {
    aviso('Info.plist dice que la app usa cifrado propio (ITSAppUsesNonExemptEncryption): la app solo usa HTTPS; ponlo a NO en Xcode > Info.');
  }

  // Permisos (solo si faltan: si ya hay un texto, se respeta).
  const nuevos = [];
  for (const [clave, nombre, texto] of PERMISOS) {
    if (tiene(clave)) continue;
    poner(clave, `<string>${xml(texto)}</string>`);
    nuevos.push(nombre);
  }
  if (nuevos.length) hecho(`Info.plist: textos de permiso en español (${nuevos.join(', ')})`);
  else ok(`textos de permiso ya puestos (${PERMISOS.map((p) => p[1]).join(', ')})`);

  // Solo en vertical en el iPhone, como la web instalada (public/manifest.json
  // dice "portrait"): en horizontal la barra de abajo no respeta la muesca.
  // Solo se cambia la lista que trae la plantilla; si alguien la tocó, se
  // respeta. La de iPad (~ipad) no se toca.
  const VERTICAL = 'UIInterfaceOrientationPortrait';
  const orient = plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const valores = orient ? [...orient[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]) : [];
  const dePlantilla = [VERTICAL, 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
  if (!orient) {
    poner('UISupportedInterfaceOrientations', `<array>\n\t\t<string>${VERTICAL}</string>\n\t</array>`);
    hecho('Info.plist: la app va solo en vertical en el iPhone');
  } else if (valores.length === 1 && valores[0] === VERTICAL) {
    ok('la app va solo en vertical en el iPhone');
  } else if (valores.length === dePlantilla.length && dePlantilla.every((v) => valores.includes(v))) {
    plist = plist.replace(orient[0], orient[0].replace(orient[1], `\n\t\t<string>${VERTICAL}</string>\n\t`));
    hecho('Info.plist: la app va solo en vertical en el iPhone (sin horizontal)');
  } else {
    aviso(`Info.plist tiene orientaciones a mano (${valores.join(', ')}): para dejar solo vertical, en Xcode > App > General > Device Orientation marca solo Portrait.`);
  }

  // Idioma principal: con "en" y sin traducciones, iOS enseña en inglés los
  // botones de los avisos de permisos y del selector de fotos, y la App Store
  // anuncia la app en inglés. La app solo está en español.
  const region = plist.match(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>([^<]*)<\/string>/);
  if (!region) {
    poner('CFBundleDevelopmentRegion', '<string>es</string>');
    hecho('Info.plist: idioma principal español');
  } else if (region[1] === 'es') {
    ok('idioma principal español');
  } else if (region[1] === 'en' || region[1] === '$(DEVELOPMENT_LANGUAGE)') {
    plist = plist.replace(region[0], region[0].replace(`<string>${region[1]}</string>`, '<string>es</string>'));
    hecho('Info.plist: idioma principal español (avisos del sistema y ficha en español)');
  } else {
    aviso(`Info.plist tiene como idioma principal "${region[1]}": ponlo a "es" en Xcode > Info > Localization native development region.`);
  }

  if (plist !== antes) fs.writeFileSync(fichero, plist);
}

// ── 6. Manifiesto de privacidad (PrivacyInfo.xcprivacy) ──────────────────────
// Los plugins de Apple y de Google guardan datos en UserDefaults, una de las API
// que Apple obliga a justificar: sin este fichero en la app, App Store Connect
// rechaza la subida (ITMS-91053 "Missing API declaration"). CA92.1 = datos que
// solo lee la propia app. Sin rastreo.
const PRIVACIDAD = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">',
  '<dict>',
  '\t<key>NSPrivacyTracking</key>',
  '\t<false/>',
  '\t<key>NSPrivacyTrackingDomains</key>',
  '\t<array/>',
  '\t<key>NSPrivacyCollectedDataTypes</key>',
  '\t<array/>',
  '\t<key>NSPrivacyAccessedAPITypes</key>',
  '\t<array>',
  '\t\t<dict>',
  '\t\t\t<key>NSPrivacyAccessedAPIType</key>',
  '\t\t\t<string>NSPrivacyAccessedAPICategoryUserDefaults</string>',
  '\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>',
  '\t\t\t<array>',
  '\t\t\t\t<string>CA92.1</string>',
  '\t\t\t</array>',
  '\t\t</dict>',
  '\t</array>',
  '</dict>',
  '</plist>',
  '',
].join('\n');

function prepararPrivacidad() {
  const nombre = 'PrivacyInfo.xcprivacy';
  const aMano = `en Xcode arrastra ios/App/App/${nombre} a la carpeta App (con "Target: App" marcado).`;
  const fichero = path.join(APP_DIR, nombre);
  if (!fs.existsSync(fichero)) {
    fs.writeFileSync(fichero, PRIVACIDAD);
    hecho(`creado App/${nombre} (manifiesto de privacidad: UserDefaults, sin rastreo)`);
  } else if (!fs.readFileSync(fichero, 'utf8').includes('NSPrivacyAccessedAPICategoryUserDefaults')) {
    aviso(`App/${nombre} no declara UserDefaults: añade en Xcode "Privacy Accessed API Types" > User Defaults con el motivo CA92.1.`);
  }

  if (!fs.existsSync(PBXPROJ)) return aviso(`No encuentro project.pbxproj: ${aMano}`);
  let pbx = fs.readFileSync(PBXPROJ, 'utf8');
  if (pbx.includes(`${nombre} in Resources`)) return ok('manifiesto de privacidad incluido en la app');
  if (pbx.includes(nombre)) return aviso(`${nombre} está en el proyecto pero no se copia a la app: en Xcode, selecciónalo y marca "Target Membership: App".`);

  // IDs fijos (24 hex, como los de Xcode) para que la segunda pasada no cambie nada.
  const id = (t) => crypto.createHash('sha256').update(`padelmedina-${t}`).digest('hex').slice(0, 24).toUpperCase();
  const ref = id('privacyinfo-ref');
  const build = id('privacyinfo-build');
  if (pbx.includes(ref) || pbx.includes(build)) return aviso(`No he podido añadir ${nombre} al proyecto: ${aMano}`);

  // Cada punto de inserción tiene que aparecer una sola vez; si no, mejor a mano.
  const grupoApp = /\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \(\n(?=[^)]*\);\s*path = App;)/g;
  const recursos = /isa = PBXResourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(\n/g;
  const puntos = [
    [/\/\* End PBXBuildFile section \*\//g, (m) => `\t\t${build} /* ${nombre} in Resources */ = {isa = PBXBuildFile; fileRef = ${ref} /* ${nombre} */; };\n${m}`],
    [/\/\* End PBXFileReference section \*\//g, (m) => `\t\t${ref} /* ${nombre} */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = ${nombre}; sourceTree = "<group>"; };\n${m}`],
    [grupoApp, (m) => `${m}\t\t\t\t${ref} /* ${nombre} */,\n`],
    [recursos, (m) => `${m}\t\t\t\t${build} /* ${nombre} in Resources */,\n`],
  ];
  for (const [re, nuevo] of puntos) {
    if ((pbx.match(re) || []).length !== 1) return aviso(`El proyecto tiene un formato inesperado: ${aMano}`);
    pbx = pbx.replace(re, nuevo);
  }
  fs.writeFileSync(PBXPROJ, pbx);
  hecho(`${nombre} añadido a la app (Apple no rechazará la subida por ITMS-91053)`);
}

// ── 7. Icono de la App Store ─────────────────────────────────────────────────
// Huella (SHA-256) del icono por defecto de Capacitor (AppIcon-512@2x.png de la
// plantilla). Además se leen las plantillas instaladas en node_modules por si
// una versión nueva de Capacitor lo cambia.
const ICONO_CAPACITOR = '29e4777e319de3ee5a52c3a8004ec19d0568414004257e36d7c94a077d71c93b';
const huella = (datos) => crypto.createHash('sha256').update(datos).digest('hex');

function huellasIconoCapacitor() {
  const huellas = new Set([ICONO_CAPACITOR]);
  const dir = path.join(RAIZ, 'node_modules', '@capacitor', 'cli', 'assets');
  for (const nombre of ['ios-spm-template.tar.gz', 'ios-pods-template.tar.gz']) {
    try {
      const tar = zlib.gunzipSync(fs.readFileSync(path.join(dir, nombre)));
      for (let p = 0; p + 512 <= tar.length;) {
        const ruta = tar.toString('utf8', p, p + 100).replace(/\0[\s\S]*$/, '');
        if (!ruta) break;
        const tam = parseInt(tar.toString('ascii', p + 124, p + 136).replace(/\0[\s\S]*$/, '').trim() || '0', 8);
        if (/AppIcon\.appiconset\/[^/]+\.png$/.test(ruta) && !ruta.includes('/._')) {
          huellas.add(huella(tar.subarray(p + 512, p + 512 + tam)));
        }
        p += 512 + Math.ceil(tam / 512) * 512;
      }
    } catch { /* sin plantilla a mano: basta con la huella conocida */ }
  }
  return huellas;
}

// Lee la cabecera de un PNG: tamaño y si tiene canal alfa (RGBA, gris+alfa o
// un bloque tRNS de transparencia). null si no es un PNG normal.
function infoPng(fichero) {
  const b = fs.readFileSync(fichero);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  let alfa = b[25] === 4 || b[25] === 6;
  for (let p = 8; !alfa && p + 8 <= b.length;) {
    const tipo = b.toString('latin1', p + 4, p + 8);
    if (tipo === 'tRNS') alfa = true;
    if (tipo === 'IDAT' || tipo === 'IEND') break;
    p += 12 + b.readUInt32BE(p);
  }
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), alfa, huella: huella(b) };
}

function revisarIcono() {
  const set = path.join(APP_DIR, 'Assets.xcassets', 'AppIcon.appiconset');
  const relSet = path.relative(RAIZ, set).split(path.sep).join('/');
  const tienda = path.join(RAIZ, 'resources', 'icon-appstore-1024.png');
  const infoTienda = fs.existsSync(tienda) ? infoPng(tienda) : null;
  const tiendaVale = infoTienda && infoTienda.ancho === 1024 && infoTienda.alto === 1024 && !infoTienda.alfa;
  const fuente = path.join(RAIZ, 'resources', 'icon.png');
  const fuenteAlfa = fs.existsSync(fuente) && infoPng(fuente)?.alfa;

  let imagenes = [];
  try {
    imagenes = JSON.parse(fs.readFileSync(path.join(set, 'Contents.json'), 'utf8')).images || [];
  } catch { /* sin Contents.json: cuenta como que no hay icono */ }
  const grandes = imagenes.filter((i) => i.size === '1024x1024' && i.filename);

  const problemas = [];
  if (grandes.length === 0) problemas.push('no hay icono de 1024x1024 en Assets > AppIcon');
  const deCapacitor = huellasIconoCapacitor();
  for (const { filename } of grandes) {
    const f = path.join(set, filename);
    const info = fs.existsSync(f) ? infoPng(f) : null;
    if (!info) problemas.push(`falta ${filename} o no es un PNG normal`);
    else if (deCapacitor.has(info.huella)) problemas.push('es el icono de Capacitor por defecto, no el de Padel Medina');
    else if (info.alfa) problemas.push(`${filename} tiene canal alfa (transparencia) y Apple lo rechaza al subir la app`);
    else if (info.ancho !== 1024 || info.alto !== 1024) problemas.push(`${filename} mide ${info.ancho}x${info.alto} y tiene que medir 1024x1024`);
  }
  if (problemas.length === 0) return ok('icono de la App Store propio, de 1024x1024 y sin transparencia');

  for (const p of problemas) aviso(`Icono: ${p}.`);
  const destino = grandes[0]?.filename || 'AppIcon-512@2x.png';
  if (tiendaVale) {
    aviso(`Icono: cópialo con  cp resources/icon-appstore-1024.png ${relSet}/${destino}  (o arrastra ese PNG en Xcode > App > Assets > AppIcon).`);
  } else {
    aviso('Icono: pon en Xcode > App > Assets > AppIcon un PNG de 1024x1024 sin transparencia (en Vista Previa: Archivo > Exportar, PNG, desmarca "Alfa").');
  }
  if (fuenteAlfa) {
    aviso('resources/icon.png tiene canal alfa: no lo uses para el icono de iPhone (tampoco con @capacitor/assets); usa resources/icon-appstore-1024.png.');
  }
}

for (const paso of [prepararAppDelegate, prepararEntitlements, prepararGoogle, prepararSoloIphone, prepararInfoPlist, prepararPrivacidad, revisarIcono]) {
  try {
    paso();
  } catch (e) {
    aviso(`${paso.name}: ${e.message}`);
  }
}
console.log('preparar-ios: listo.');
