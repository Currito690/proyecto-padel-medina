"""
Aplica a la carpeta android/ los cambios propios que Bubblewrap pisa cada vez que
regenera el proyecto (bubblewrap update). Es idempotente: se puede ejecutar las
veces que haga falta.

    python parchear.py

Lo que hace:
  1. LauncherActivity.java: fuerza Chrome como navegador de la app si esta
     instalado (en muchos Samsung el predeterminado es Samsung Internet y ahi
     la app no funciona igual).
  2. AndroidManifest.xml: declara los permisos de ubicacion y registra la
     pantalla nativa UbicacionActivity con su direccion padelmedina://ubicacion.
  3. Copia extra/UbicacionActivity.java al arbol de fuentes de la app.
"""
import io
import os
import shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
JAVA = os.path.join(AQUI, 'app', 'src', 'main', 'java', 'com', 'padelmedina', 'app')
MANIFIESTO = os.path.join(AQUI, 'app', 'src', 'main', 'AndroidManifest.xml')


def leer(p):
    return io.open(p, encoding='utf-8').read()


def escribir(p, s):
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


def parchear_launcher():
    p = os.path.join(JAVA, 'LauncherActivity.java')
    s = leer(p)
    if 'createTwaLauncher' in s:
        print('LauncherActivity: ya parcheado')
        return
    s = s.replace('import android.content.pm.ActivityInfo;',
                  'import android.content.pm.ActivityInfo;\n'
                  'import android.content.pm.ApplicationInfo;\n'
                  'import android.content.pm.PackageManager;\n'
                  '\n'
                  'import com.google.androidbrowserhelper.trusted.TwaLauncher;')
    s = s.replace('    @Override\n    protected Uri getLaunchingUrl() {',
                  '''    // Navegador que ejecuta la app por dentro.
    //
    // Por defecto Android elige el navegador PREDETERMINADO del movil. En muchos
    // Samsung es Samsung Internet, que solo tiene soporte basico para estas apps.
    // Se fija Chrome cuando esta instalado y activo; si no, decide el sistema.
    private static final String CHROME = "com.android.chrome";

    @Override
    protected TwaLauncher createTwaLauncher() {
        return new TwaLauncher(this, hayChrome() ? CHROME : null);
    }

    private boolean hayChrome() {
        try {
            ApplicationInfo info = getPackageManager().getApplicationInfo(CHROME, 0);
            return info.enabled;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @Override
    protected Uri getLaunchingUrl() {''')
    if 'createTwaLauncher' not in s:
        raise SystemExit('No se ha podido parchear LauncherActivity.java: ha cambiado la plantilla')
    escribir(p, s)
    print('LauncherActivity: Chrome forzado')


def parchear_manifiesto():
    s = leer(MANIFIESTO)
    cambiado = False
    if 'ACCESS_FINE_LOCATION' not in s:
        s = s.replace('<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>',
                      '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n'
                      '        <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n'
                      '        <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>')
        if 'ACCESS_FINE_LOCATION' not in s:
            raise SystemExit('No encuentro el permiso POST_NOTIFICATIONS para colgar los de ubicacion')
        cambiado = True
    if 'UbicacionActivity' not in s:
        actividad = '''
        <!-- Pantalla nativa que coge la ubicacion y se la devuelve a la web -->
        <activity android:name=".UbicacionActivity"
            android:exported="true"
            android:excludeFromRecents="true"
            android:noHistory="true"
            android:theme="@android:style/Theme.Material.Light.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="padelmedina" android:host="ubicacion" />
            </intent-filter>
        </activity>

    </application>'''
        if '</application>' not in s:
            raise SystemExit('No encuentro </application> en el manifiesto')
        s = s.replace('</application>', actividad, 1)
        cambiado = True
    if cambiado:
        escribir(MANIFIESTO, s)
        print('AndroidManifest: permisos de ubicacion y UbicacionActivity')
    else:
        print('AndroidManifest: ya parcheado')


def copiar_actividad():
    origen = os.path.join(AQUI, 'extra', 'UbicacionActivity.java')
    destino = os.path.join(JAVA, 'UbicacionActivity.java')
    shutil.copyfile(origen, destino)
    print('UbicacionActivity.java copiado')


if __name__ == '__main__':
    parchear_launcher()
    parchear_manifiesto()
    copiar_actividad()
    print('Parche aplicado')
