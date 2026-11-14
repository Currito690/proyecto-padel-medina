# Padel Medina · reglas de R8 (reducción y ofuscación activadas desde la 1.1.3).
#
# Capacitor localiza los plugins y sus métodos por reflexión y expone el puente
# al WebView con @JavascriptInterface: todo eso tiene que conservar el nombre.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, JavascriptInterface
-keep class com.getcapacitor.** { *; }
-keep class com.padelmedina.app.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# Plugins nativos: los oficiales de Capacitor, los de Capgo (inicio de sesión
# con Google) y los de la comunidad (Apple).
-keep class com.capacitorjs.plugins.** { *; }
-keep class ee.forgr.** { *; }
-keep class com.getcapacitor.community.** { *; }
-keep class io.ionic.** { *; }
-dontwarn com.getcapacitor.**

# Firebase y Google traen sus propias reglas; esto solo calla avisos de clases
# opcionales que no se usan.
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**

# Trazas de error legibles en Play Console aunque el código vaya ofuscado.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
