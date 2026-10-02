package com.padelmedina.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * Coge la ubicación con el GPS de Android y se la devuelve a la web.
 *
 * Por qué existe: dentro de la app, Chrome no da ubicación precisa en algunos
 * móviles (Samsung, entre otros) y la delegación de ubicación de Google se
 * queda colgada. Así que la web, cuando corre dentro de la app, abre esta
 * pantalla con la dirección padelmedina://ubicacion y esta pantalla vuelve a la
 * web con las coordenadas en la URL: ?gps=lat,lng,precision_m,marca_de_tiempo
 * o ?gps=err:motivo si no ha podido.
 */
public class UbicacionActivity extends Activity {

    private static final int PETICION_PERMISO = 7;
    private static final long TIEMPO_MAXIMO_MS = 15000;      // tope: se devuelve lo mejor que haya
    private static final float PRECISION_BUENA_M = 30f;      // con esto se para antes
    private static final long FRESCA_MS = 60000;             // una posición guardada vale si es de hace menos de 1 min
    private static final String VOLVER_POR_DEFECTO = "https://padelmedina.com/?gpsnativo=1&firmar=1";

    private LocationManager gestor;
    private Location mejor;
    private boolean terminado = false;
    private String volver;
    private TextView estado;
    private final Handler reloj = new Handler(Looper.getMainLooper());
    private final List<String> proveedoresActivos = new ArrayList<>();

    private final LocationListener oyente = new LocationListener() {
        @Override public void onLocationChanged(Location loc) { considerar(loc); }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        volver = leerVolver();
        pintar();
        if (tienePermiso()) {
            empezar();
        } else {
            requestPermissions(new String[] {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }, PETICION_PERMISO);
        }
    }

    // Pantalla mínima: un giro y un texto. Sin XML, para que el parche sea un solo fichero.
    private void pintar() {
        LinearLayout caja = new LinearLayout(this);
        caja.setOrientation(LinearLayout.VERTICAL);
        caja.setGravity(Gravity.CENTER);
        caja.setBackgroundColor(Color.parseColor("#F8FAFC"));
        int m = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 24, getResources().getDisplayMetrics());
        caja.setPadding(m, m, m, m);

        ProgressBar giro = new ProgressBar(this);
        caja.addView(giro);

        estado = new TextView(this);
        estado.setText("Obteniendo tu ubicación…");
        estado.setTextColor(Color.parseColor("#0F172A"));
        estado.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        estado.setGravity(Gravity.CENTER);
        estado.setPadding(0, m, 0, 0);
        caja.addView(estado);

        TextView pista = new TextView(this);
        pista.setText("Si tarda, acércate a una ventana o sal a la pista.");
        pista.setTextColor(Color.parseColor("#64748B"));
        pista.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        pista.setGravity(Gravity.CENTER);
        pista.setPadding(0, m / 2, 0, 0);
        caja.addView(pista);

        setContentView(caja);
    }

    private String leerVolver() {
        String v = getIntent().getStringExtra("volver");
        if (v == null && getIntent().getData() != null) {
            v = getIntent().getData().getQueryParameter("volver");
        }
        if (v != null && v.contains("%")) v = Uri.decode(v);
        // Solo se vuelve a nuestra propia web
        if (v == null || !v.startsWith("https://padelmedina.com/")) v = VOLVER_POR_DEFECTO;
        return v;
    }

    private boolean tienePermiso() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int codigo, String[] permisos, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permisos, resultados);
        if (codigo != PETICION_PERMISO) return;
        if (tienePermiso()) empezar();
        else terminar("err:permiso");
    }

    private void empezar() {
        gestor = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (gestor == null) { terminar("err:desactivada"); return; }

        List<String> candidatos = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) candidatos.add(LocationManager.FUSED_PROVIDER);
        candidatos.add(LocationManager.GPS_PROVIDER);
        candidatos.add(LocationManager.NETWORK_PROVIDER);

        try {
            for (String p : candidatos) {
                if (!gestor.isProviderEnabled(p)) continue;
                // Lo último que se sepa, si es reciente, ya cuenta
                Location ultima = gestor.getLastKnownLocation(p);
                if (ultima != null && (System.currentTimeMillis() - ultima.getTime()) < FRESCA_MS) considerar(ultima);
                if (terminado) return;
                gestor.requestLocationUpdates(p, 0L, 0f, oyente, Looper.getMainLooper());
                proveedoresActivos.add(p);
            }
        } catch (SecurityException e) {
            terminar("err:permiso");
            return;
        }

        if (proveedoresActivos.isEmpty()) {
            terminar("err:desactivada");   // la ubicación del móvil está apagada
            return;
        }
        reloj.postDelayed(() -> terminar(mejor != null ? formatear(mejor) : "err:tiempo"), TIEMPO_MAXIMO_MS);
    }

    private void considerar(Location loc) {
        if (loc == null || terminado) return;
        if (mejor == null || loc.getAccuracy() < mejor.getAccuracy()) mejor = loc;
        if (estado != null) estado.setText("Precisión: " + Math.round(mejor.getAccuracy()) + " m…");
        if (mejor.getAccuracy() <= PRECISION_BUENA_M) terminar(formatear(mejor));
    }

    private static String formatear(Location l) {
        return l.getLatitude() + "," + l.getLongitude() + "," + Math.round(l.getAccuracy()) + "," + l.getTime();
    }

    private void terminar(String resultado) {
        if (terminado) return;
        terminado = true;
        reloj.removeCallbacksAndMessages(null);
        if (gestor != null) {
            try { gestor.removeUpdates(oyente); } catch (SecurityException ignored) { }
        }
        String url = volver + (volver.contains("?") ? "&" : "?") + "gps=" + Uri.encode(resultado);
        // Se vuelve lanzando la actividad de arranque con la URL de vuelta, en
        // la MISMA tarea y sin banderas que limpien la pila: asi la pestaña de
        // Chrome que ya estaba abierta sigue viva y simplemente navega a esa URL.
        Intent vuelta = new Intent(this, LauncherActivity.class);
        vuelta.setAction(Intent.ACTION_VIEW);
        vuelta.setData(Uri.parse(url));
        startActivity(vuelta);
        finish();
    }

    @Override
    public void onBackPressed() {
        terminar("err:cancelado");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        reloj.removeCallbacksAndMessages(null);
        if (gestor != null) {
            try { gestor.removeUpdates(oyente); } catch (SecurityException ignored) { }
        }
    }
}
