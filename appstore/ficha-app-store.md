# Ficha de Padel Medina en App Store Connect

Todo listo para copiar y pegar en https://appstoreconnect.apple.com. Cada texto va
en su bloque y, debajo, lo que ocupa frente al límite de Apple. Ojo con dos campos
que Apple mide en **bytes** y no en caracteres (palabras clave y notas para la
revisión): ahí cada vocal con tilde o cada ñ cuenta doble.

Redactada a partir del código (rama `revision-20261002`, 14 de octubre de 2026):
describe solo lo que la app hace hoy en el iPhone.

## Índice

1. Crear la app
2. Información de la app: nombre, subtítulo, categorías y derechos de contenido
3. Clasificación por edades
4. Precio y disponibilidad
5. Comerciante en la UE (DSA)
6. Privacidad de la app
7. Página de la versión 1.0: texto promocional, descripción, palabras clave, URL y copyright
8. Capturas de pantalla
9. Información para la revisión
10. Cifrado (cumplimiento de exportación)
11. Antes de pulsar «Enviar para revisión»
12. Anexo: modelo de autorización del club

---

## 1. Crear la app

Mis apps → **+** → **Nueva app**.

| Campo | Valor |
|---|---|
| Plataformas | iOS |
| Nombre | `Padel Medina` |
| Idioma principal | Español (España) |
| ID del paquete (Bundle ID) | `com.padelmedina.app` |
| SKU (interno, no se publica) | `padelmedina-ios` |
| Acceso de usuarios | Acceso completo |

---

## 2. Información de la app

### Nombre (máx. 30)

```
Padel Medina
```
(12/30)

Si Apple dice que el nombre ya está cogido, por este orden:

```
Padel Medina Sidonia
```
(20/30). Si usas este, quita `sidonia` de las palabras clave (Apple ya indexa el nombre).

```
Padel Medina: Reservas
```
(22/30). Si usas este, cambia el subtítulo por el alternativo, para no repetir «Reservas».

### Subtítulo (máx. 30)

```
Reservas de pista y torneos
```
(27/30)

Alternativo:

```
Tu pista y tus torneos
```
(22/30)

### Categorías

- **Principal**: Deportes.
- **Secundaria**: Estilo de vida. Descarto «Salud y forma física»: la app no
  trata datos de salud y esa categoría invita a pensar que sí.

### Derechos de contenido

- «¿Tu app contiene, muestra o accede a contenido de terceros?» → **Sí**. La
  pantalla de inicio lleva el mapa de Google Maps insertado.
- «¿Tienes todos los derechos necesarios?» → **Sí**. Es el mapa insertado oficial
  de Google, usado según sus condiciones. Los carteles de eventos son del club.

---

## 3. Clasificación por edades

Información de la app → Clasificación por edades → Configurar. Es el cuestionario
actual de Apple, en vigor desde 2025, con edades 4+, 9+, 13+, 16+ y 18+. Entre
paréntesis va el nombre en inglés por si la pantalla sale en ese idioma.

| Paso | Pregunta | Respuesta |
|---|---|---|
| Controles de la app | Controles parentales (Parental Controls) | No |
| | Verificación de edad (Age Assurance) | No |
| Capacidades | Acceso web sin restricciones (Unrestricted Web Access) | **No**. Solo se abre la pasarela de pago de Redsys, y el mapa y WhatsApp van a sus propias apps. No se puede navegar por internet libremente |
| | Contenido generado por usuarios (User-Generated Content) | No |
| | Redes sociales (Social Media) | No |
| | Mensajería y chat (Messaging and Chat) | No. El botón de WhatsApp abre la app de WhatsApp, fuera de Padel Medina |
| | Publicidad (Advertising) | No |
| Temas para adultos | Lenguaje soez o humor grosero | Ninguno |
| | Terror o miedo | Ninguno |
| | Alcohol, tabaco o drogas | Ninguno |
| Medicina o bienestar | Información médica o de tratamientos | Ninguno |
| | Temas de salud o bienestar | No |
| Sexualidad o desnudos | Temas maduros o sugerentes | Ninguno |
| | Contenido sexual o desnudos | Ninguno |
| | Contenido sexual explícito | Ninguno |
| Violencia | Violencia de dibujos animados o fantasía | Ninguno |
| | Violencia realista | Ninguno |
| | Violencia realista prolongada, explícita o sádica | Ninguno |
| | Armas | Ninguno |
| Actividades de azar | Juegos de azar simulados (Simulated Gambling) | Ninguno |
| | Concursos (Contests) | **Poco frecuente (Infrequent)**, ver la nota |
| | Apuestas (Gambling) | No |
| | Cajas de botín (Loot Boxes) | No |
| Información adicional | Categoría de edad y anulación | No aplicable. No es una app para niños ni hace falta subir la edad |
| | URL de idoneidad por edad | En blanco |

**Resultado esperado: 4+.**

Nota sobre «Concursos»: Apple los define como competiciones entre usuarios por
clasificaciones o premios, incluidas las deportivas. La app inscribe en torneos de
pádel y enseña sus cuadros y resultados, aunque se jueguen en la pista y no en la
app. Marcar «Poco frecuente» es lo más honesto y deja la app en 4+. «Ninguno»
también se puede defender, y el resultado es el mismo. Lo que no hay que marcar es
«Frecuente», que sube la edad.

---

## 4. Precio y disponibilidad

- **Precio**: 0,00 € (gratis). **Compras dentro de la app**: ninguna.
- **Países**: solo **España**. La app está solo en español y el servicio se presta en
  Medina Sidonia. Se puede ampliar más adelante sin una versión nueva.
- **Mac con Apple silicon** y **Apple Vision Pro**: **desmárcalos**. Apple ofrece
  por defecto las apps de iPhone en esos aparatos, y ahí no se ha probado el
  inicio de sesión con Google, los avisos ni el pago.
- **Publicación de la versión** (está en la página de la versión): **Publicar
  manualmente esta versión**. Así decides tú el día del lanzamiento cuando Apple la
  apruebe.

---

## 5. Comerciante en la UE (DSA)

Para estar en el App Store de cualquier país de la UE, Apple pide declarar si
eres **comerciante** según la Ley de Servicios Digitales. Se hace en Business →
la cuenta → Cumplimiento.

- Respuesta: **Sí, soy comerciante**. Eres autónomo y la app se hace en el
  ejercicio de tu actividad.
- Apple **publica en la ficha de la UE** la dirección, el teléfono y el correo que
  pongas, y antes verifica el teléfono y el correo con un código. Elige datos
  profesionales:
  - Dirección: `________________________________`
  - Teléfono: `+34 ___ ___ ___`
  - Correo: `curritoastdj@gmail.com` (u otro profesional)
- Sin esta declaración la app no aparece en el App Store español.

---

## 6. Privacidad de la app

### URL

| Campo | Valor |
|---|---|
| URL de la política de privacidad | `https://padelmedina.com/privacidad` |
| URL de opciones de privacidad del usuario (opcional) | `https://padelmedina.com/eliminar-cuenta` |

### Recogida de datos

«¿Tú o tus socios externos recopiláis datos de esta app?» → **Sí**.

Para **todos** los tipos marcados, las respuestas son las mismas:

- Finalidad: **Funcionalidad de la app** y ninguna otra. No hay publicidad, ni
  analítica, ni personalización, ni correos comerciales.
- ¿Vinculados a la identidad del usuario? → **Sí**, porque van con su cuenta.
- ¿Se usan para rastrear? → **No**. No hay rastreo, ni SDK de publicidad, ni IDFA.

| Tipo de dato en Apple | ¿Se recoge? | Qué es exactamente en Padel Medina |
|---|---|---|
| Información de contacto › **Nombre** (Name) | Sí | Nombre y apellidos del registro, o los que da Apple o Google al entrar. En la inscripción a un torneo, también el nombre del compañero de pareja |
| Información de contacto › **Correo electrónico** (Email Address) | Sí | Correo de la cuenta. Con «Iniciar sesión con Apple» puede ser el de reenvío privado de Apple. Sirve para el código de verificación, las confirmaciones y los recordatorios. En los torneos se puede dar el correo de cada jugador |
| Información de contacto › **Número de teléfono** (Phone Number) | Sí | Obligatorio al registrarse con correo. En los torneos se piden los teléfonos de los dos jugadores |
| Ubicación › **Ubicación precisa** (Precise Location) | Sí | **Solo cuentas del personal del club** (monitores), al fichar la entrada o la salida. Se guarda con el fichaje. A los jugadores no se les pide nunca |
| Contenido del usuario › **Otro contenido del usuario** (Other User Content) | Sí | Firma manuscrita del monitor al fichar. En los torneos, la talla de camiseta y las horas en que la pareja no puede jugar |
| Identificadores › **ID de usuario** (User ID) | Sí | Identificador interno de la cuenta |
| Identificadores › **ID del dispositivo** (Device ID) | Sí | Token de avisos de Apple (APNs) del iPhone, solo si el usuario activa los recordatorios. Se borra al cerrar sesión o al eliminar la cuenta |
| Compras › **Historial de compras** (Purchase History) | Sí | Reservas e inscripciones: pista o torneo, fecha, importe, forma de pago (tarjeta, Bizum o en el club) y si está pagada |
| Información financiera › **Otra información financiera** (Other Financial Info) | Sí | **Solo personal del club**: las tarifas de sus clases y las horas que cuentan para su informe mensual de sueldo |
| Otros datos › **Otros tipos de datos** (Other Data Types) | Sí | **Solo personal del club**: registro horario, con la hora de entrada y la de salida |

**No se recogen**, así que no se marcan:

- Información de pago. La tarjeta y el Bizum se escriben en la página de
  **Redsys**, y ni el club ni la app los ven. Apple dice expresamente que en ese
  caso no cuenta como recogida. Lo que sí guarda la app, que es la forma de pago,
  el importe y si está pagado, va en «Historial de compras».
- Información crediticia, dirección postal y otra información de contacto.
- Salud y forma física, información sensible y contactos de la agenda.
- Correos o mensajes, fotos o vídeos, audio, contenido de juegos y atención al cliente.
- Historial de navegación e historial de búsqueda.
- Datos de uso: interacción con el producto, datos de publicidad y otros datos de uso.
- Diagnóstico: fallos, rendimiento y otros. No hay Sentry ni Crashlytics ni nada parecido.
- Ubicación aproximada, entorno y cuerpo.

Casos dudosos, decididos así:

- **Carteles de eventos**: los sube el administrador del club como material del
  propio club, no son datos de los usuarios. No se declaran «Fotos o vídeos». Si
  prefieres ir al máximo de prudencia, márcalo como no vinculado y con la finalidad
  Funcionalidad de la app.
- **IP en los registros del servidor**: la política la menciona y solo se usa para la
  seguridad del servicio. Apple no tiene una categoría para eso, y no se usa para
  localizar a nadie ni para ningún perfil, así que no se declara.
- **Datos del compañero de torneo**: son de otra persona, pero son el mismo tipo de
  dato (nombre, correo y teléfono). Ya quedan cubiertos arriba.

### Lo que verá el usuario en la ficha

- **Datos usados para rastrearte**: ninguno.
- **Datos vinculados a ti**: compras, información financiera, ubicación,
  información de contacto, contenido del usuario, identificadores y otros datos.

### Coherencia con la política de privacidad

La etiqueta de arriba describe lo que la app recoge de verdad. La política
publicada en `/privacidad` **no menciona** varias cosas. Están listadas en el
apartado 11 y conviene corregirlas antes de enviar.

---

## 7. Página de la versión 1.0

| Campo | Valor |
|---|---|
| Versión | `1.0` (build 1). Coincide con `MARKETING_VERSION` de Xcode |
| Novedades de esta versión | No aplica: Apple no lo pide en la primera versión |
| Copyright | `2026 Francisco Astorga Cile` (Apple añade el ©) |
| URL de soporte | `https://padelmedina.com/aviso-legal` |
| URL de marketing (opcional) | `https://padelmedina.com` |

Sobre la URL de soporte: Apple exige que lleve a datos de contacto reales.
`/aviso-legal` es pública y enseña el correo, el teléfono y la dirección del club.
La portada `https://padelmedina.com` no vale, porque sin sesión abre el
formulario de entrada.

### Texto promocional (máx. 170)

Se puede cambiar en cualquier momento sin enviar una versión nueva.

```
Reserva tu pista de pádel o pickleball en segundos, apúntate a los torneos del club y recibe un aviso en el iPhone antes de cada partido.
```
(137/170)

### Descripción (máx. 4000)

```
Padel Medina es la app del club de pádel Padel Medina, en Medina Sidonia (Cádiz). Reserva tu pista, apúntate a los torneos del club y recibe un aviso antes de cada partido, todo desde el iPhone.

RESERVA TU PISTA EN UN MINUTO
• Consulta las pistas libres de pádel y pickleball de cada día.
• Elige pista, fecha y hora, y confirma la reserva al momento.
• Paga con tarjeta o con Bizum a través de Redsys, la pasarela de pago de los bancos españoles, sin salir de la app. Si el club lo permite para esa hora, también puedes pagar en el propio club.
• Recibe la confirmación de la reserva en tu correo.

TUS RESERVAS, SIEMPRE A MANO
• En "Mis reservas" tienes tus próximos partidos y el historial de los ya jugados.
• Cancela desde la app con la antelación que marque el club.

TORNEOS DEL CLUB
• Consulta los torneos con inscripción abierta, sus fechas y sus categorías.
• Inscríbete con tu pareja en vuestra categoría e indica las horas en las que no podéis jugar.
• Si el torneo tiene cuota, págala con tarjeta o en el club.
• Sigue el cuadro en directo: cruces, horarios y resultados.
• Descubre los próximos eventos del club desde la pantalla de inicio.

AVISOS ANTES DE JUGAR
• Activa los recordatorios y te avisamos en el iPhone unas tres horas antes de tu pista. Si juegas a primera hora, el aviso llega la víspera a las 21:00. Nunca de madrugada.

ENTRA COMO PREFIERAS
• Inicia sesión con Apple, con Google o con tu correo electrónico.

EL CLUB, A UN TOQUE
• Llama al club o escríbele por WhatsApp desde tu perfil.
• Abre la ruta hasta el club en el mapa.

TU CUENTA Y TUS DATOS
• Elimina tu cuenta y tus datos personales cuando quieras desde Perfil.
• Sin publicidad y sin rastreo de tu actividad.

PARA EL EQUIPO DEL CLUB
El personal del club usa la misma app para consultar su agenda de pistas y clases y para fichar su entrada y su salida.

SOBRE LOS PAGOS
Todo lo que se paga en la app son servicios que se disfrutan en el club: el alquiler de pistas y la inscripción en torneos presenciales. Los pagos con tarjeta y Bizum se procesan en la pasarela segura de Redsys: ni la app ni el club ven ni guardan los datos de tu tarjeta.

CONTACTO
Padel Medina · Calle Alemania, 4-20, 11170 Medina Sidonia (Cádiz)
padelmedina@hotmail.com · padelmedina.com
```
(2.257/4.000 caracteres)

Lo que **no** sale en la descripción, a propósito:

- **Tienda de productos**: no existe. Se quitó entera (migración
  `20260813120000_tienda_eliminada.sql`) y el carrito solo lleva pistas.
- **Pago entre amigos**: está desactivado (`SPLIT_PAYMENT_ENABLED = false` en
  `PaymentGateway.jsx`). Si se anuncia y el revisor no lo encuentra, es motivo de
  rechazo (guía 2.3.1).

### Palabras clave (máx. 100 bytes)

Van sin espacios y sin tildes, para no gastar bytes; la búsqueda de Apple no
distingue tildes. No repiten palabras del nombre ni del subtítulo («padel»,
«medina», «reservas», «pista», «torneos»), porque Apple ya las indexa.

```
reservar,pistas,torneo,pickleball,club,sidonia,cadiz,partido,alquiler,cuadro,inscripcion,deporte
```
(96/100 bytes, 12 palabras)

---

## 8. Capturas de pantalla

**Tamaño obligatorio**: iPhone de 6,9 pulgadas, **1320 × 2868** en vertical
(simulador «iPhone 17 Pro Max», Cmd+S). Apple también acepta 1290 × 2796. Van
en PNG o JPG sin transparencia, de 1 a 10 capturas. Apple reduce estas para el
resto de iPhone.

**iPad**: no hacen falta capturas de iPad. `scripts/preparar-ios.mjs` deja la app
solo para iPhone (`TARGETED_DEVICE_FAMILY = 1`). Comprueba en Xcode → App →
General → Supported Destinations que solo sale iPhone. Si siguiera saliendo iPad,
Apple exigiría capturas de iPad de 13 pulgadas (2064 × 2752) y la revisaría
también en iPad.

Las 5 capturas ya están en `appstore/capturas/`, hechas con la cuenta de revisión:
1320 × 2868, PNG RGB sin transparencia. Se suben en este orden:

| # | Fichero | Pantalla | Pie de texto opcional |
|---|---|---|---|
| 1 | `1-reservar.png` | Inicio (pestaña Reservas): «Tu club de pádel en Medina Sidonia», horario y pistas | Tu pista, en segundos |
| 2 | `2-elegir-hora.png` | Pista 2: selector de fecha y horas libres, con una hora marcada | Elige día y hora libres |
| 3 | `3-carrito.png` | Carrito con la pista elegida, la cuenta atrás y el total | Todo claro antes de pagar |
| 4 | `4-pago.png` | Pantalla de pago con las pestañas Club, Tarjeta y Bizum, y el resumen | Paga con tarjeta, Bizum o en el club |
| 5 | `5-como-llegar.png` | Inicio más abajo: «Por qué Padel Medina» y el mapa de «Cómo llegar» | Tu club, a un toque |

Notas sobre las capturas:

- Sin torneo publicado ni reservas en la cuenta de revisión no se pudieron hacer
  las de Torneos ni Mis reservas. Si un día hay un torneo abierto, se puede cambiar
  la 5 por la pestaña Torneos, sin nombres de jugadores reales.
- `alternativas/5-perfil.png` no se usa: enseña el nombre «Revisor Google» y el
  correo de la cuenta de revisión.
- La 5 enseña «Cancelación flexible: hasta 24h antes». Es un texto fijo de la app:
  antes de enviar, comprueba en el panel de administración que la cancelación de
  reservas está activada con 24 horas.
- La 1 enseña el inicio sin el título «Padel Medina - Club de Pádel» encima de la
  tarjeta azul. Ese arreglo (`.sr-only` en `src/index.css`) tiene que ir en el
  build que se suba, si no la app no coincide con la captura.

Los pies son opcionales. Si los pones, que sea con texto encima de la captura, sin
marcos de iPhone de otros modelos y sin prometer nada que la app no haga.

---

## 9. Información para la revisión

### Contacto

| Campo | Valor |
|---|---|
| Nombre | Francisco |
| Apellidos | Astorga Cile |
| Teléfono | `+34 ___ ___ ___` (formato internacional con +34; **falta**) |
| Correo | `curritoastdj@gmail.com` |

### Inicio de sesión

- «Se requiere iniciar sesión» → **marcado**.
- Usuario:

```
play-review-client@padelmedina.com
```

- Contraseña:

```
(contraseña de la cuenta de revisión: la tiene Francisco)
```

Es una cuenta de jugador con el correo ya verificado. No caduca y no se le cambia
nunca la contraseña: Apple la usa también en las actualizaciones.

### Notas (máx. 4000 bytes)

Se pega el bloque entero, con la parte en inglés y la parte en español.

```
ABOUT THE APP
Padel Medina is the official app of Padel Medina, a real padel and pickleball club in Medina Sidonia (Cadiz, Spain). Players book courts, sign up for the club's in-person tournaments and get reminders before their games. It is developed and published by Francisco Astorga Cile on behalf of the club, with its authorization. The app is in Spanish only.

PAYMENTS (Guideline 3.1.3(e))
Everything paid in the app is a physical service used at the club: court rental and entry to in-person tournaments. There is no digital content, subscription or unlockable feature. Card and Bizum payments go through Redsys, the club's bank virtual POS, in a payment screen inside the app; the app never sees card data. Players may also choose to pay at the club when it is allowed.

DEMO ACCOUNT (player)
User: play-review-client@padelmedina.com
Password: (contraseña de la cuenta de revisión: la tiene Francisco)
The email is already verified: no code is needed to sign in. The 6-digit code is only asked when creating a NEW account.

HOW TO TEST
1. Sign in with the demo account. Sign in with Apple and Google also work (they create a new account).
2. Reservas: choose a court, a date and a free time, then book. The slot is held in the cart for a few minutes.
3. Payment: "Tarjeta" or "Bizum" opens the Redsys payment screen inside the app. This is a live merchant account and charges are real: please cancel on that screen; the app then shows "Pago cancelado" and nothing is charged. If "Club" appears, the booking is confirmed without paying online; in that case please book at least 2 days ahead and cancel it in "Mis reservas".
4. Torneos: club tournaments, registration form and live bracket (content depends on the club's calendar).
5. Reminders: in "Perfil", tap "Activar" next to "Recordatorios de partidos" (or "Activar avisos" in "Mis reservas" when there is an upcoming booking) and allow notifications. The reminder arrives about 3 hours before a booking, or at 21:00 the evening before for early games; never at night.
6. Account deletion: Perfil > "Eliminar mi cuenta". Please do not delete the demo account: create a new one with Sign in with Apple and delete that one.

Location is only requested from club staff accounts when they clock in at the club. The camera and photo library are only used by club administrators to upload an event poster. No ads, no tracking, no analytics.

NOTA EN ESPAÑOL
Padel Medina es la app de un club real de pádel y pickleball de Medina Sidonia (Cádiz). La desarrolla y publica Francisco Astorga Cile en nombre del club y con su autorización. La app está solo en español.
Pagos (guía 3.1.3(e)): todo lo que se paga son servicios físicos que se usan en el club (alquiler de pistas e inscripción en torneos presenciales). No hay contenido digital ni suscripciones. Tarjeta y Bizum se cobran con el TPV Redsys del club en una pantalla de pago dentro de la app; la app no ve los datos de la tarjeta.
Cuenta demo: la de arriba (correo ya verificado, no pide código).
Cómo probar: reservar pista y llegar al pago (el cobro es real: cancele en Redsys y la app muestra "Pago cancelado"; si aparece "Club", reserve con 2 días de antelación y cancele después en "Mis reservas"); ver torneos y cuadro; activar los recordatorios en Perfil (iOS pide permiso; el aviso llega unas 3 horas antes de la reserva); iniciar sesión con Apple; borrado de cuenta en Perfil > Eliminar mi cuenta (no borre la cuenta demo). La ubicación solo se pide al personal del club al fichar, y la cámara y las fotos solo las usa el administrador para subir el cartel de un evento.
```
(3.569/4.000 bytes)

Por qué la nota es así:

- **Solo se cita la guía 3.1.3(e)**, la de bienes y servicios que se consumen fuera
  de la app. La 3.1.5 ahora trata de **criptomonedas**: citarla confundiría al
  revisor.
- **Reservar sin tarjeta sí es posible a veces.** Si la franja y el horario del club
  lo permiten, sale el método «Club», que confirma la reserva sin pago online. Por
  eso se le pide al revisor reservar con 2 días de margen y cancelarla; así queda
  dentro del plazo de cancelación (24 h por defecto). Si prefieres que no reserve
  nada, cambia esa frase por: *"Please do not confirm "Club" bookings: they block
  a real court."*
- **«official app» y «with its authorization»** solo se pueden dejar si adjuntas
  la autorización firmada del club (ver «Archivo adjunto»). Sin ella, quita esas
  dos expresiones de la nota en inglés y «en nombre del club y con su
  autorización» de la española.
- **Funciones del personal**: la descripción las menciona y la cuenta demo es de
  jugador. Si Apple pide verlas, se le da una cuenta de monitor, nunca la de
  administrador, que puede tocar datos reales del club.

### Archivo adjunto

Adjunta un PDF con la **autorización del club** (modelo en el apartado 12). La app
lleva la marca de un negocio, Padel Medina, y la publica una persona física: es
el caso típico de rechazo por la guía 5.2.1 («el vendedor no es el dueño de la
marca»). Con la autorización adjunta desde el principio te ahorras esa ronda.

---

## 10. Cifrado (cumplimiento de exportación)

Al subir el build, App Store Connect pregunta por el cifrado:

- «¿Qué tipo de algoritmos de cifrado usa tu app?» → **Ninguno de los algoritmos
  mencionados anteriormente**. La app solo usa HTTPS y las funciones de Apple, lo
  que está exento.
- `scripts/preparar-ios.mjs` ya pone `ITSAppUsesNonExemptEncryption` = `NO` en
  `Info.plist`, así que normalmente App Store Connect ni siquiera lo pregunta. Si
  lo pregunta, la respuesta es la de arriba.

---

## 11. Antes de pulsar «Enviar para revisión»

Cosas que no son de la ficha pero que pueden tumbar la revisión. Las he
encontrado al leer el código.

**En el proyecto de Xcode** (carpeta `ios/`, solo en el Mac): lo deja hecho
`npm run ios:open` (que lanza `scripts/preparar-ios.mjs`). Todas las líneas tienen
que salir con ✓ o +, salvo el icono si aún no lo has cambiado:

1. **Textos de permiso en `Info.plist`**, en español: ubicación (fichaje del
   monitor), cámara y fotos (cartel de un evento; sin el de cámara la app se
   cerraría al elegir «Hacer foto»).
2. **Solo iPhone** (`TARGETED_DEVICE_FAMILY = 1`) y **solo en vertical**.
3. **Idioma principal español** y **sin cifrado propio**
   (`ITSAppUsesNonExemptEncryption = NO`).
4. **Manifiesto de privacidad** `PrivacyInfo.xcprivacy` dentro de la app. Sin él
   Apple rechaza la subida con el error ITMS-91053, porque los plugins de Apple y
   Google usan UserDefaults.
5. **Capacidades** Push Notifications y Sign in with Apple en el `.entitlements`.
6. **Icono**: si sale «! Icono…», copia `resources/icon-appstore-1024.png` con el
   comando que enseña el aviso. Ese PNG no tiene transparencia. No vuelvas a
   lanzar `npx @capacitor/assets generate --ios` con `resources/icon.png`, porque
   ese sí tiene canal alfa.
7. Asegúrate de que el nombre visible en el iPhone es «Padel Medina».

**Prueba en TestFlight** el mismo build que vas a enviar (no el que instala Xcode
con el cable: ese usa los avisos de pruebas de Apple y otra firma):

- Llega un recordatorio de prueba al iPhone.
- «Continuar con Apple» y «Continuar con Google» entran; si cancelas el de Apple,
  no sale ningún error.
- Un pago con tarjeta y otro con Bizum abren Redsys dentro de la app.
- «Eliminar mi cuenta» con una cuenta de usar y tirar.
- No sale el aviso «Instala Padel Medina».

**Política de privacidad** (`src/pages/PrivacyPolicy.jsx`). Faltan estas cosas
para que cuadre con la etiqueta del apartado 6:

1. **Iniciar sesión con Apple**: solo habla de Google. Hay que añadir que Apple
   facilita el nombre y el correo, que puede ser el de reenvío privado.
2. **Avisos en el iPhone**: habla del «identificador que su navegador nos facilita»
   y de retirarlo «desde su navegador». En el iPhone es el token de Apple (APNs) y
   se retira en Ajustes. Añadir Apple como proveedor que entrega los avisos.
3. **Personal del club**: no dice nada de la ubicación al fichar, la firma, el
   registro horario ni las tarifas y horas para el sueldo.
4. **Torneos**: no dice que se piden datos del compañero (nombre, teléfono y
   correo), la talla de camiseta y la disponibilidad, ni que los nombres de las
   parejas salen en el cuadro público.
5. **Google Maps**: el mapa insertado de la portada carga contenido de Google. La
   política dice que no hay cookies de terceros, y ese mapa puede ponerlas.

**Servidor y cuenta**:

1. **Borrado de cuenta con Apple**: Apple recomienda que, al eliminar una cuenta
   creada con «Iniciar sesión con Apple», se revoque su token con la API REST de
   Apple. `eliminar_mi_cuenta` hoy no lo hace. No suele bloquear, pero puede salir
   en la revisión.
2. **Avisar al club** de que durante la revisión puede entrar alguna reserva o
   inscripción de prueba a nombre de «Revisor».
3. Si puede ser, que haya **algún torneo publicado** mientras dure la revisión;
   si no, la pestaña Torneos sale vacía.
4. **Al activar los avisos no llega ninguna notificación de confirmación**: la app
   solo enseña el mensaje «¡Listo! Te avisaremos antes de tus partidos.». El aviso
   «Avisos activados» que te llegó lo mandó a mano el modo `prueba` de
   `send-reminders`. Si quieres que el revisor reciba uno, lo puedes mandar tú igual
   a la cuenta de revisión cuando Apple la esté probando. Por eso la nota no
   promete ninguna notificación inmediata.

---

## 12. Anexo: modelo de autorización del club

Para imprimir con membrete del club, firmar, pasar a PDF y adjuntar en la
información para la revisión.

```
AUTORIZACIÓN / AUTHORIZATION

D./Dña. ______________________, con DNI ________, en calidad de ____________ de
PADEL MEDINA (NIF ________), con domicilio en Calle Alemania, 4-20, 11170 Medina
Sidonia (Cádiz), AUTORIZA a D. Francisco Astorga Cile a desarrollar y publicar en
el App Store de Apple la aplicación «Padel Medina» (com.padelmedina.app), que usa
el nombre y la marca del club para la reserva de pistas y la inscripción en sus
torneos.

The undersigned, on behalf of PADEL MEDINA, authorizes Mr. Francisco Astorga Cile
to develop and publish the "Padel Medina" app (com.padelmedina.app) on the Apple
App Store, using the club's name and brand for court bookings and tournament
registrations.

En Medina Sidonia, a ___ de __________ de 2026.

Firma y sello:
```
