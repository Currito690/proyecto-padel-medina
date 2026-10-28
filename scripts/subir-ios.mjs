// Archiva la app de iPhone y la sube a App Store Connect sin pasar por los menús
// de Xcode (Product > Archive > Distribute App). Se lanza en el Mac con:
//     npm run ios:subir
// (que antes hace el build de la web, `cap sync ios` y scripts/preparar-ios.mjs).
//
// - Firma automática con la cuenta de Apple que ya tiene Xcode (equipo 76STNXGZTF).
// - El número de build es la fecha y hora (AAAAMMDDHHMM): cada subida lleva uno
//   nuevo y Apple no la rechaza por repetido.
// - LA VERSIÓN VISIBLE ES LA MISMA QUE EN ANDROID (28/10/2026): se lee de
//   android-app/app/build.gradle (versionName), así las dos tiendas van a la par
//   y la versión solo se sube en un sitio. «No puede estar una app más
//   desactualizada que otra» (Francisco).
// - El archivo queda en ~/Library/Developer/Xcode/Archives, así que también se ve
//   en Xcode > Window > Organizer.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EQUIPO = '76STNXGZTF';
const RAIZ = process.cwd();
const PROYECTO = path.join(RAIZ, 'ios', 'App', 'App.xcodeproj');

if (process.platform !== 'darwin') {
  console.error('subir-ios: esto solo funciona en el Mac (necesita Xcode).');
  process.exit(1);
}
if (!fs.existsSync(PROYECTO)) {
  console.error('subir-ios: no encuentro ios/App/App.xcodeproj. Lanza antes `npm run ios:sync`.');
  process.exit(1);
}

const gradle = fs.readFileSync(path.join(RAIZ, 'android-app', 'app', 'build.gradle'), 'utf8');
const version = (gradle.match(/versionName "([^"]+)"/) || [])[1];
if (!version) {
  console.error('subir-ios: no encuentro versionName en android-app/app/build.gradle.');
  process.exit(1);
}
const ahora = new Date();
const dos = (n) => String(n).padStart(2, '0');
const dia = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
const build = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;

const carpetaArchivos = path.join(os.homedir(), 'Library', 'Developer', 'Xcode', 'Archives', dia);
fs.mkdirSync(carpetaArchivos, { recursive: true });
const archivo = path.join(carpetaArchivos, `Padel Medina ${build}.xcarchive`);
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'padel-subida-'));
const opciones = path.join(temporal, 'ExportOptions.plist');

fs.writeFileSync(opciones, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>upload</string>
	<key>teamID</key>
	<string>${EQUIPO}</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>uploadSymbols</key>
	<true/>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
</dict>
</plist>
`);

const xcodebuild = (args) => execFileSync('xcodebuild', args, { stdio: 'inherit' });

try {
  console.log(`\n▶ 1/2 Archivando la app (versión ${version}, build ${build}). Tarda unos minutos…\n`);
  xcodebuild([
    '-project', PROYECTO,
    '-scheme', 'App',
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-archivePath', archivo,
    '-allowProvisioningUpdates',
    '-quiet',
    'archive',
    `CURRENT_PROJECT_VERSION=${build}`,
    `MARKETING_VERSION=${version}`,
    `DEVELOPMENT_TEAM=${EQUIPO}`,
  ]);

  console.log('\n▶ 2/2 Subiendo a App Store Connect…\n');
  xcodebuild([
    '-exportArchive',
    '-archivePath', archivo,
    '-exportOptionsPlist', opciones,
    '-exportPath', path.join(temporal, 'export'),
    '-allowProvisioningUpdates',
  ]);

  console.log(`\n✓ Subida hecha: versión ${version}, build ${build}.`);
  console.log('  En 10-30 minutos aparece en App Store Connect > TestFlight; después se elige en la página de la versión.\n');
} catch {
  console.error('\n✗ Algo ha fallado. Mira las líneas de "error:" de arriba (y mándale una captura a quien te ayude).');
  console.error(`  El archivo, si llegó a crearse, está en: ${archivo}\n`);
  process.exit(1);
} finally {
  fs.rmSync(temporal, { recursive: true, force: true });
}
