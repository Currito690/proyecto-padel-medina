// Deja el proyecto de iPhone (carpeta ios/, que solo existe en el Mac y no va a
// git) listo para los avisos push y para "Continuar con Google", sin tener que
// tocar Xcode a mano. Lo lanzan `npm run ios:sync` y `npm run ios:open` después
// de `cap sync ios`. Se puede ejecutar las veces que haga falta: si algo ya está
// puesto, no lo vuelve a poner.
//
// 1. AppDelegate.swift: los dos métodos que pasan a Capacitor el token de
//    avisos de Apple (sin ellos el iPhone nunca recibe avisos).
// 2. Capacidad "Push Notifications": aps-environment en el .entitlements.
// 3. Info.plist: el esquema de URL de Google (com.googleusercontent.apps.…),
//    sacado del ID de cliente de src/utils/googleNativo.js.
import fs from 'node:fs';
import path from 'node:path';

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
  if (ent.includes('<key>aps-environment</key>')) return ok('capacidad Push Notifications ya activada');
  const cierre = ent.lastIndexOf('</dict>');
  if (cierre < 0) return aviso(`${rel} tiene un formato inesperado: añade Push Notifications en Xcode.`);
  // "development" es lo correcto en el proyecto: al subir a la App Store, Xcode
  // lo cambia solo a "production".
  ent = ent.slice(0, cierre) + '\t<key>aps-environment</key>\n\t<string>development</string>\n' + ent.slice(cierre);
  fs.writeFileSync(fichero, ent);
  hecho('capacidad Push Notifications activada (aps-environment)');
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

for (const paso of [prepararAppDelegate, prepararEntitlements, prepararGoogle]) {
  try {
    paso();
  } catch (e) {
    aviso(`${paso.name}: ${e.message}`);
  }
}
console.log('preparar-ios: listo.');
