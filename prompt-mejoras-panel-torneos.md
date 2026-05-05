# Prompt: Mejoras del Panel de Administración - Módulo de Torneos

## Contexto
Necesito implementar varias mejoras en el panel de administración de mi web, específicamente en la sección de **Torneos**. A continuación detallo cada funcionalidad que debe ser desarrollada e integrada.

---

## 1. Gestión de Pistas en Torneos Iniciados

**Requisito:**
Cuando un torneo esté en estado **"Iniciado"**, el admin debe poder **incorporar/asignar pistas** al torneo.

**Detalles de implementación:**
- Añadir una sección dentro de la vista del torneo iniciado que permita gestionar las pistas disponibles.
- El admin debe poder seleccionar qué pistas se utilizarán para los partidos de ese torneo.
- Permitir añadir, editar o eliminar pistas asignadas durante el transcurso del torneo.
- Las pistas asignadas deben poder vincularse a los partidos programados.

---

## 2. Métodos de Pago en la Inscripción de Torneos

**Requisito:**
En el formulario de inscripción de los torneos debe aparecer una opción para elegir el método de pago.

**Opciones a mostrar:**
- ✅ **Pago con tarjeta** (ya implementado actualmente — mantener)
- 🆕 **Pago en el club** (nuevo — añadir)

**Detalles de implementación:**
- Mostrar ambas opciones como selección excluyente (radio button o similar) durante el proceso de inscripción.
- Si el usuario elige "Pago en el club", la inscripción debe quedar registrada como **pendiente de pago** hasta que el admin la marque como pagada manualmente.
- El admin debe tener una vista en el panel para marcar como "Pagado" las inscripciones que se hayan abonado en el club.
- Mantener registro/log de qué método de pago eligió cada pareja inscrita.

---

## 3. Configuración de Byes y Cabezas de Serie

**Requisito:**
En la configuración de cada torneo debe poder gestionarse:
- **Byes** (parejas que pasan automáticamente la primera ronda)
- **Cabezas de serie** (parejas con posición preferente en el cuadro)

**Detalles de implementación:**

### 3.1 Byes
- El sistema debe calcular automáticamente cuántos byes son necesarios según el número de inscritos para ajustar al cuadro (8, 16, 32, 64 parejas).
- El admin debe poder asignar manualmente qué parejas reciben los byes, o dejar que el sistema los asigne automáticamente a los cabezas de serie.

### 3.2 Cabezas de Serie
- Cuando **todas las parejas estén inscritas**, el admin debe poder asignar **manualmente** los cabezas de serie.
- Interfaz: lista de parejas inscritas con un selector/posición numérica (1º cabeza de serie, 2º, 3º, 4º…) que permita ordenarlas.
- Los cabezas de serie deben colocarse correctamente en el cuadro siguiendo el sistema estándar de torneos (no enfrentarse entre ellos hasta rondas avanzadas).
- Permitir guardar la configuración antes de generar el cuadro definitivo.

---

## 4. Introducción Automática de Resultados (sin clicks adicionales)

**Requisito:**
Actualmente, para introducir un resultado hay que pinchar sobre el ganador, lo cual es engorroso.
Se debe simplificar: **basta con introducir el resultado** y el sistema debe deducir automáticamente quién es el ganador.

**Detalles de implementación:**
- Eliminar el paso de tener que clicar sobre el ganador.
- El admin solo introduce los sets/games del resultado (ejemplo: 6-3, 6-4).
- El sistema debe calcular automáticamente:
  - Qué pareja ha ganado el partido.
  - Qué pareja pasa a la siguiente ronda del cuadro principal.
  - Qué pareja pasa al cuadro de **consolación** (si el torneo tiene cuadro de consolación habilitado).
- La actualización del cuadro debe ser automática tras guardar el resultado.
- Validar que el resultado introducido sea coherente (que haya un ganador claro según las reglas del pádel/tenis configuradas).

---

## 5. Formato de Liguilla con Opciones Configurables

**Requisito:**
Cuando se elija el formato **"Liguilla"** para un torneo, el admin debe poder seleccionar entre dos modalidades:

### 5.1 Liguilla Normal
- Todos los equipos se enfrentan entre sí.
- El ganador se determina por la clasificación final (puntos, sets ganados, games, etc.).

### 5.2 Liguilla con Eliminatorias Finales
- Fase de grupos en formato liguilla.
- Los mejores clasificados pasan a una fase de **semifinales y final**.
- El admin debe poder configurar:
  - Cuántos equipos clasifican de cada grupo (por ejemplo: 1º y 2º).
  - Si hay un partido por el 3º y 4º puesto.

**Detalles de implementación:**
- Añadir un selector al crear/editar un torneo de tipo liguilla con las dos opciones.
- Generar automáticamente el cuadro/calendario según la opción elegida.
- Calcular automáticamente la clasificación de la liguilla y los cruces de las eliminatorias finales.

---

## Resumen de Tareas a Implementar

| Nº | Funcionalidad | Ubicación |
|----|---------------|-----------|
| 1 | Asignación de pistas en torneos iniciados | Panel admin → Torneo iniciado |
| 2 | Opción "Pago en el club" en inscripciones | Formulario de inscripción + Panel admin |
| 3 | Configuración manual de byes y cabezas de serie | Panel admin → Configuración del torneo |
| 4 | Introducción de resultados automática (sin clicar al ganador) | Panel admin → Gestión de partidos |
| 5 | Liguilla normal vs Liguilla con semifinales y final | Panel admin → Crear/Editar torneo |

---

## Consideraciones Técnicas Generales

- Mantener la coherencia visual y de UX con el resto del panel de administración existente.
- Validar los datos en frontend y backend.
- Registrar logs/auditoría de las acciones del admin (especialmente pagos en club, asignación manual de cabezas de serie y resultados).
- Asegurar que los cambios no rompan torneos ya creados o en curso.
- Realizar pruebas con cuadros de distintos tamaños (8, 16, 32 parejas).
- La interfaz debe ser responsive y funcional tanto en escritorio como en móvil.

---

## Entregables Esperados

1. Implementación de las 5 funcionalidades descritas.
2. Documentación breve de uso para el admin.
3. Pruebas funcionales de cada módulo.
