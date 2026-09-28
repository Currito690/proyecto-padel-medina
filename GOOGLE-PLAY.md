# Publicar Padel Medina en Google Play

Guía completa del paso a la aplicación Android y de su publicación. Escrito para
quien vaya a ejecutarlo, sea el desarrollador o el club.

## Qué es la app y por qué esto importa

La app **no es una copia** de la web: es la misma aplicación de `padelmedina.com`
a pantalla completa, sin barra de navegador, mediante una *Trusted Web Activity*.
Es la vía que Google documenta para llevar una PWA a Play.

Consecuencias, y son las dos caras de la misma moneda:

- **A favor**: cada despliegue de la web llega a la app al instante. No hay que
  recompilar ni esperar a que Google revise nada. Reservas, panel de
  administración, monitor, torneos y pagos son exactamente los que ya funcionan.
- **En contra**: un despliegue con un fallo llega a la app igual de rápido, y la
  app no funciona sin el servidor. Conviene desplegar fuera del horario de
  reservas y vigilar que el servidor esté sano.

## Estado: lo que ya está hecho

| Hecho | Detalle |
|---|---|
| Proyecto Android generado | `android/`, paquete `com.padelmedina.app`, API objetivo 36 (la que Play exige desde el 31 de agosto de 2026) |
| Clave de firma creada | `C:/Users/curri/AndroidBuild/claves/padelmedina-upload.jks`, con su contraseña al lado. **Hay que copiarla fuera del ordenador** |
| Paquete firmado para Play | `C:/Users/curri/AndroidBuild/padelmedina-1.0.0.aab` |
| Instalable de prueba | `C:/Users/curri/AndroidBuild/padelmedina-1.0.0.apk` |
| Verificación del dominio | `public/.well-known/assetlinks.json` publicado y servido como JSON. Falta añadir la huella de Google tras la primera subida |
| Iconos | 512 normal y maskable, generados del emblema del logotipo, y el icono de la ficha |
| Gráfico de la ficha | `android/play-assets/grafico-funciones-1024x500.png` |
| Textos de la ficha | `android/play-assets/ficha-play.md` |
| Borrado de cuenta | Dentro de la app (Perfil) y página pública `/eliminar-cuenta`. Lo exige Google |
| Aviso de ubicación | Explicación previa al permiso de GPS en la vista del monitor. Lo exige Google |
| Probado en Android 16 | Ver el apartado de pruebas más abajo |

## Lo que tiene que decidir el club, antes de nada

**1. A nombre de quién va la cuenta de Google Play.** Es la decisión con más
consecuencias y la que marca el calendario:

| | Cuenta de organización (recomendada) | Cuenta personal |
|---|---|---|
| A nombre de | El club | Una persona |
| Requisito previo | Número D-U-N-S del club, gratuito, hasta 30 días | Ninguno |
| Prueba previa obligatoria | No | 12 probadores durante 14 días seguidos |
| Qué se publica en la ficha | Nombre y dirección del club | Nombre y dirección de la persona |

Para un club que cobra por sus servicios, Google pide cuenta de organización. Si
hay prisa, se puede ir montando todo y usar la pista de pruebas internas, que no
exige nada de esto. Lo primero, hoy mismo: **comprobar si el club ya tiene
D-U-N-S y, si no, solicitarlo**, porque es el trámite más lento.

**2. Con qué correo de Google se abre la cuenta.** Tiene que ser un correo del
club, no el personal del desarrollador: la cuenta es del club para siempre y
transferirla después es lento. El desarrollador se añade luego como usuario.

**3. Datos que se publican.** Para distribuir en la Unión Europea hay que
declararse comerciante, y Play publica en la ficha el nombre, la dirección y el
teléfono de contacto.

**4. Nombre del paquete.** Queda fijado como `com.padelmedina.app` en la primera
subida y **no se puede cambiar nunca**. Si no gusta, hay que decirlo ahora.

## Pasos, en orden

### 1. Cuenta de Play (lo hace el club)
1. Solicitar el D-U-N-S si se opta por cuenta de organización.
2. Crear la cuenta en Play Console con el correo del club y pagar los 25 dólares, una sola vez.
3. Elegir perfil de pagos de tipo organización desde el principio.
4. Completar la verificación de identidad, dirección, correo y teléfono.
5. Invitar al desarrollador en Usuarios y permisos, como administrador de la app.

### 2. Cuentas de prueba para el revisor de Google (lo hace el desarrollador)
El revisor no ve casi nada sin iniciar sesión, así que hay que darle credenciales.
Hay un detalle que provoca rechazos: **el código de un solo uso solo aparece al
crear una cuenta nueva**, no al entrar en una existente, y eso hay que escribirlo
en el formulario.

Crear tres cuentas permanentes, con el correo ya confirmado:

| Cuenta | Para qué |
|---|---|
| `play-review-client@padelmedina.com` | Reservas, torneos, perfil y borrado de cuenta |
| `play-review-monitor@padelmedina.com` | Agenda del monitor, fichaje y cobros |
| `play-review-admin@padelmedina.com` | Panel completo del club |

Estas cuentas no se borran ni se les cambia la contraseña nunca: Google las usa
también en las actualizaciones futuras.

### 3. Subir la primera versión
1. En Play Console, crear la app: nombre «Padel Medina», español de España, aplicación, gratuita.
2. Dejar activada la firma de apps de Google Play.
3. Subir `padelmedina-1.0.0.aab` a **Pruebas internas** y añadir a tres o cinco personas del club.

### 4. Cerrar la verificación del dominio (el paso que más falla)
Al firmar Google la app con su propia clave, la huella cambia. Si no se añade,
la app se abre con la barra de direcciones de Chrome a la vista.

1. Play Console → Versiones → Configuración → Integridad de la app → copiar la
   huella SHA-256 del certificado de firma.
2. Añadirla a `public/.well-known/assetlinks.json`, **junto a la que ya está**
   (`3D:EC:4A:59:...:7C:9A`, que es la de subida y sirve para las pruebas locales).
3. Desplegar la web y comprobar:

```
curl -I https://padelmedina.com/.well-known/assetlinks.json
```

Debe responder 200, `Content-Type: application/json` y sin redirecciones.

4. Instalar la app desde la pista interna y confirmar que **no** aparece la barra del navegador.

### 5. Formularios obligatorios de Play Console

**Acceso a la app**: marcar que parte está restringida y dar las tres cuentas,
con las instrucciones en inglés. Incluir esta frase, que evita el rechazo más
común: *"No verification code is required for existing accounts; the one-time
code only appears when creating a NEW account."*

**Política de privacidad**: `https://padelmedina.com/privacidad`

**Seguridad de los datos**: declarar exactamente esto, que es lo que hace la app.

| Dato | Se recoge | Para qué |
|---|---|---|
| Nombre, correo, teléfono, identificador de usuario | Sí | Gestionar la cuenta y las reservas |
| Ubicación precisa | Sí | Registro horario del personal del club |
| Historial de compras | Sí | Reservas y su cobro |
| Datos de tarjeta | No | Van directos a Redsys; la app no los ve |
| Actividad en la app | Sí | Funcionamiento del servicio |

Todo se cifra en tránsito. Y hay que marcar que el usuario puede pedir el borrado
de sus datos, indicando `https://padelmedina.com/eliminar-cuenta`.

Este formulario tiene que cuadrar con la política de privacidad. Si no cuadra, lo rechazan.

**Resto de declaraciones**: anuncios, no. Clasificación de contenido, se rellena
el cuestionario y sale apta para todos los públicos. Público objetivo, solo
mayores de 18, para no entrar en la política de familias. Funciones financieras,
hay que enviar la declaración aunque la respuesta sea que no tiene ninguna.
Aplicación gubernamental, no. Salud, no.

**Pagos**: la app cobra reservas de pista, que son un servicio del mundo real. La
política de Google permite cobrarlos con Redsys sin usar su facturación, que solo
es obligatoria para contenido digital. Conviene explicarlo en las notas del
revisor: *"Payments are for physical padel court bookings at the club's facility
in Medina Sidonia, Spain (real-world service), processed via Redsys, the Spanish
banking payment gateway."*

### 6. Probar la versión de la pista interna
Instalar la app **desde Google Play**, no el APK, y repasar:
entrar con correo y con Google, reservar pista, pagar con tarjeta y con Bizum
comprobando que vuelve a la app, fichar con GPS siendo monitor, recibir un aviso
push, exportar un PDF, subir el cartel de un torneo, y los enlaces de teléfono,
WhatsApp y mapas.

### 7. Producción
Si la cuenta es personal, antes hay que sostener la prueba cerrada con 12
probadores durante 14 días seguidos. Si es de organización, se pasa directo.
La revisión tarda entre unas horas y una semana; la primera app de una cuenta
nueva suele ser la más lenta.

## Lo que ya he probado, en un Android 16 real (emulador)

| Prueba | Resultado |
|---|---|
| La app abre sin barra de navegador | Correcto: la verificación del dominio funciona |
| Navegación interna y botón atrás de Android | Correcto |
| Permiso de ubicación | Android lo pide a nombre de «Padel Medina», no de Chrome |
| Ubicación para el fichaje | Posición en 522 ms y seguimiento continuo correcto |
| Permiso de notificaciones | Android lo pide a nombre de «Padel Medina» |
| Aviso mostrado | Sale con el nombre y el icono del club, no los de Chrome |
| Sin cobertura | La app abre igualmente con lo que Chrome tiene en caché |

Queda por probar con una cuenta real, porque hace falta iniciar sesión: el pago
con Redsys y Bizum de principio a fin, la descarga de PDF y la subida de imágenes.

## Riesgos que conviene tener presentes

- **Perder la clave de firma** deja la app sin poder actualizarse nunca. Copia
  fuera del ordenador, hoy.
- **La huella de Google sin añadir** al fichero de verificación: la app sale con
  la barra del navegador. Es el fallo más habitual.
- **Cuenta personal**: añade tres semanas largas por la prueba de 12 probadores.
- **Vender algo digital en el futuro** (un abono con ventajas dentro de la app)
  obligaría a usar la facturación de Google, con su comisión. Las reservas de
  pista, no.
- **Fechas en el calendario**: noviembre de 2026, declaración de ubicación
  precisa en Play Console; 27 de enero de 2027, pasa a ser obligatoria.

## Mantenimiento

- Los cambios de la web llegan solos a la app.
- Solo hay que subir un paquete nuevo si cambia el icono, el nombre, los permisos
  o el nivel de API exigido por Google. El procedimiento está en
  [android/COMO-COMPILAR.md](android/COMO-COMPILAR.md).
- Vigilar en Play Console los fallos y los bloqueos: Google penaliza por encima
  del 1,09 % de fallos.
- No borrar nunca las cuentas de revisión.
