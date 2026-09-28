# Cómo compilar la app Android de Padel Medina

La app de Android **no es una copia de la web**: es la misma web de `padelmedina.com`
mostrada a pantalla completa, sin barra de navegador, mediante una *Trusted Web
Activity* (la tecnología oficial de Google para publicar una PWA en Play).

Consecuencia práctica: **cada cambio que subes a la web aparece solo en la app**,
sin recompilar ni volver a pasar por la revisión de Google. Solo hay que recompilar
cuando cambia algo del envoltorio: icono, nombre, colores, permisos o versión.

## Lo que hace falta (ya instalado en este equipo)

| Pieza | Ruta |
|---|---|
| JDK 17 | `C:/Users/curri/AndroidBuild/jdk/jdk-17.0.20.1+1` |
| SDK de Android (API 36) | `C:/Users/curri/AndroidBuild/sdk` |
| Clave de firma | `C:/Users/curri/AndroidBuild/claves/padelmedina-upload.jks` |
| Contraseña de la clave | `C:/Users/curri/AndroidBuild/claves/password.txt` |

La clave de firma **no está en el repositorio** y no debe estarlo nunca. Haz una
copia de seguridad de esa carpeta: sin ella no se pueden publicar actualizaciones.

## Compilar

Desde la carpeta `android` del proyecto, en Git Bash:

```bash
export JAVA_HOME="C:/Users/curri/AndroidBuild/jdk/jdk-17.0.20.1+1"
export ANDROID_HOME="C:/Users/curri/AndroidBuild/sdk"
cmd //c "gradlew.bat bundleRelease"
```

Eso genera el paquete sin firmar en:

```
android/app/build/outputs/bundle/release/app-release.aab
```

Y se firma con:

```bash
PW=$(cat "C:/Users/curri/AndroidBuild/claves/password.txt")
"$JAVA_HOME/bin/jarsigner.exe" -digestalg SHA-256 -sigalg SHA256withRSA \
  -keystore "C:/Users/curri/AndroidBuild/claves/padelmedina-upload.jks" \
  -storepass "$PW" -keypass "$PW" \
  app/build/outputs/bundle/release/app-release.aab padelmedina
```

Ese `.aab` firmado es el fichero que se sube a Google Play.

## Publicar una actualización del envoltorio

1. Edita `android/twa-manifest.json` y sube **los dos** números de versión:
   `appVersion` (lo que ve la gente, p. ej. `1.0.1`) y `appVersionCode`
   (un entero que debe ser mayor que el de la versión anterior, p. ej. `2`).
   Google rechaza cualquier subida cuyo `appVersionCode` ya exista.
2. Vuelve a compilar y a firmar.
3. Sube el `.aab` a Play Console en una versión nueva.

## Si cambian los iconos o los colores

Se regeneran los recursos del proyecto Android a partir del `twa-manifest.json`
y del manifiesto web:

```bash
npx @bubblewrap/cli update --directory . --manifest ./twa-manifest.json --skipVersionUpgrade
```

Los iconos se descargan de `https://padelmedina.com/icon-512.png` y
`https://padelmedina.com/icon-512-maskable.png`, así que primero hay que
desplegar la web con los iconos nuevos.

## Verificación del dominio

La app solo se muestra sin barra de navegador si Android confirma que el dominio
y la app son del mismo dueño. Eso lo hace el fichero
`public/.well-known/assetlinks.json` de la web, que contiene las huellas SHA-256
de las claves con las que se firma la app.

Contiene la huella de la clave de subida. **Después de la primera subida a Play
hay que añadir también la huella de la clave que genera Google** (Play Console →
Versiones → Configuración → Firma de aplicaciones). Si falta, la app abre con la
barra del navegador visible.

Para ver la huella de la clave de subida:

```bash
"$JAVA_HOME/bin/keytool.exe" -list -v \
  -keystore "C:/Users/curri/AndroidBuild/claves/padelmedina-upload.jks" \
  -alias padelmedina -storepass "$(cat 'C:/Users/curri/AndroidBuild/claves/password.txt')" | grep SHA256
```
