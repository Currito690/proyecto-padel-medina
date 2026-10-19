package com.padelmedina.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

/**
 * Padel Medina a PANTALLA COMPLETA, como cualquier app (Instagram, Netflix…):
 * la web se dibuja también detrás de la barra de la hora y de la barra de los
 * botones de abajo, y ella misma deja el hueco justo con las variables CSS
 * --pm-safe-top/right/bottom/left que se ponen aquí (ver --sa-* en src/index.css).
 *
 * Capacitor solo lo hace con WebView 140 o superior; con versiones anteriores
 * dejaba una franja arriba y abajo. Por eso el manejo de márgenes de Capacitor
 * va desactivado (capacitor.config.json: SystemBars.insetsHandling = "disable")
 * y se hace aquí para todas las versiones.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dibujar detrás de las barras del sistema (desde Android 15 es obligatorio;
        // así queda igual en las versiones anteriores).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Sin el velo gris que Android pone detrás de los botones de navegación.
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }

        // Cada vez que la web termina de cargar, se le vuelven a dar los márgenes
        // (los que se mandan antes de que exista la página se pierden).
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                if (ultimos != null) ponerMargenesEnLaWeb(ultimos[0], ultimos[1], ultimos[2], ultimos[3]);
            }
        });

        View raiz = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(raiz, (v, insets) -> {
            Insets barras = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets teclado = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean tecladoVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // Con el teclado abierto, la web se encoge para que no tape el campo que se escribe.
            v.setPadding(0, 0, 0, tecladoVisible ? teclado.bottom : 0);

            float d = getResources().getDisplayMetrics().density;
            int arriba = Math.round(barras.top / d);
            int derecha = Math.round(barras.right / d);
            int abajo = tecladoVisible ? 0 : Math.round(barras.bottom / d);
            int izquierda = Math.round(barras.left / d);
            ponerMargenesEnLaWeb(arriba, derecha, abajo, izquierda);

            // Se devuelven tal cual: con WebView 140+ también llegan a env(safe-area-inset-*).
            return insets;
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // Al volver a la app (o tras recargar la web) se vuelven a mandar los márgenes.
        View raiz = getWindow().getDecorView();
        ViewCompat.requestApplyInsets(raiz);
    }

    private int[] ultimos = null;

    private void ponerMargenesEnLaWeb(int arriba, int derecha, int abajo, int izquierda) {
        ultimos = new int[] { arriba, derecha, abajo, izquierda };
        if (bridge == null || bridge.getWebView() == null) return;
        String js = String.format(
            Locale.US,
            "try{var s=document.documentElement.style;" +
            "s.setProperty('--pm-safe-top','%dpx');s.setProperty('--pm-safe-right','%dpx');" +
            "s.setProperty('--pm-safe-bottom','%dpx');s.setProperty('--pm-safe-left','%dpx');}catch(e){}",
            arriba, derecha, abajo, izquierda
        );
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
    }
}
