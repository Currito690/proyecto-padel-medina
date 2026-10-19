// Compila y firma la app de Android (Capacitor, carpeta android-app/) en este PC:
//     npm run android:compilar
//
// 1. Build de la web (vite) y `cap sync android` (copia la web dentro de la app).
// 2. Gradle: .aab para Google Play y .apk para probar en el móvil o el emulador.
// 3. Copia los dos a C:/Users/curri/AndroidBuild/apps-para-las-tiendas/.
//
// Usa el Java 21 y el SDK de Android de C:/Users/curri/AndroidBuild, y firma con
// la MISMA clave de subida que la app anterior (claves/padelmedina-upload.jks).
// La contraseña se lee de claves/password.txt y solo pasa por variables de
// entorno: nunca se escribe en el proyecto ni va a git.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'C:/Users/curri/AndroidBuild';
const RAIZ = process.cwd();
const ANDROID = path.join(RAIZ, 'android-app');
const SALIDA = `${BUILD}/apps-para-las-tiendas`;

const jdk = fs.readdirSync(`${BUILD}/jdk`).find((d) => d.startsWith('jdk-21'));
if (!jdk) {
  console.error('compilar-android: falta Java 21 en C:/Users/curri/AndroidBuild/jdk (descárgalo de adoptium.net).');
  process.exit(1);
}
const clave = `${BUILD}/claves/padelmedina-upload.jks`;
const ficheroPass = `${BUILD}/claves/password.txt`;
if (!fs.existsSync(clave) || !fs.existsSync(ficheroPass)) {
  console.error('compilar-android: no encuentro la clave de firma en C:/Users/curri/AndroidBuild/claves.');
  process.exit(1);
}

const env = {
  ...process.env,
  JAVA_HOME: `${BUILD}/jdk/${jdk}`,
  ANDROID_HOME: `${BUILD}/sdk`,
  ANDROID_SDK_ROOT: `${BUILD}/sdk`,
  PM_KEYSTORE: clave,
  PM_KEYSTORE_PASSWORD: fs.readFileSync(ficheroPass, 'utf8').trim(),
};
env.PATH = `${env.JAVA_HOME}/bin${path.delimiter}${env.PATH}`;

// Gradle necesita saber dónde está el SDK (local.properties no va a git).
fs.writeFileSync(path.join(ANDROID, 'local.properties'), `sdk.dir=${`${BUILD}/sdk`.replace(/:/g, '\\:')}\n`);

const correr = (cmd, cwd = RAIZ) => execSync(cmd, { cwd, env, stdio: 'inherit' });

console.log('\n▶ 1/3 Web y sincronización con Android…');
correr('npm run build');
correr('npx cap sync android');
// Las copias comprimidas (.gz/.br) son para el servidor web; dentro de la app
// sobran y Android las toma por recursos duplicados (X.js y X.js.gz).
const quitarComprimidos = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) quitarComprimidos(p);
    else if (/\.(gz|br)$/.test(f.name)) fs.rmSync(p);
  }
};
quitarComprimidos(path.join(ANDROID, 'app', 'src', 'main', 'assets', 'public'));

console.log('\n▶ 2/3 Compilando y firmando (Gradle)…');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
// Ruta completa: cmd.exe no busca gradlew.bat en la carpeta de trabajo.
correr(`"${path.join(ANDROID, gradlew)}" --no-daemon bundleRelease assembleRelease`, ANDROID);

console.log('\n▶ 3/3 Copiando los paquetes…');
const gradle = fs.readFileSync(path.join(ANDROID, 'app', 'build.gradle'), 'utf8');
const versionName = (gradle.match(/versionName "([^"]+)"/) || [])[1] || 'x';
const versionCode = (gradle.match(/versionCode (\d+)/) || [])[1] || 'x';
fs.mkdirSync(SALIDA, { recursive: true });
const nombre = `padelmedina-${versionName}-${versionCode}`;
const aab = path.join(ANDROID, 'app/build/outputs/bundle/release/app-release.aab');
const apk = path.join(ANDROID, 'app/build/outputs/apk/release/app-release.apk');
fs.copyFileSync(aab, `${SALIDA}/${nombre}.aab`);
fs.copyFileSync(apk, `${SALIDA}/${nombre}.apk`);
console.log(`\n✓ Listo: ${SALIDA}/${nombre}.aab (Google Play) y ${nombre}.apk (para probar).\n`);
