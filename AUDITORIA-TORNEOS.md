# Auditoría del módulo de TORNEOS

Revisión completa del apartado de torneos (panel admin, inscripción pública, cuadro público, lista de jugadores, pagos Redsys, funciones de servidor y políticas de la base de datos), hecha con 11 revisores independientes por zona de código y verificación adversaria de cada hallazgo (87 agentes en total).

- Fallos **confirmados** (verificados uno a uno contra el código): **68**
- Avisos **leves** sin verificar (se corrigen solo si son evidentes): 27

## src/components/admin/TournamentManager.jsx (52)

### [GRAVE] External bookings never block the scheduler: slot key and court id formats do not match
- **Dónde:** línea ~270 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** A client has a confirmed booking on Pista 2, 15/08 19:00-20:30. Admin generates the bracket for a tournament running 15/08 with 2 courts: the scheduler happily assigns a match to "15/08 19:00 - Pista 2", and the manual grid shows that cell as free. Two groups turn up for the same court.
- **Estado:** ✅ corregido — loadExternalBookings reescrito: carga courts y traduce UUID -> nº de pista (nombre de config, dígito del nombre, orden), expande cada rango 'HH:MM - HH:MM' a slots 'dd/mm HH:00', incluye holds pendiente_pago (<15 min) y blocked_slots; deps del effect ampliadas con courtsCount/courtNames. Consumidores sin cambios.

### [GRAVE] Re-saving a score with the same winner erases every downstream result on that path
- **Dónde:** línea ~809 (lote TM-A-estado-inscripciones)
- **Qué pasa:** R0 M0: A beats B '6-4 6-4'. R1 M0: A beats C '6-3 6-3'. Final: A beats D. Admin opens R0 M0 score to correct it to '6-4 6-3' (A still wins) -> R1 M0.winner and final.winner become null; final still shows A vs D with its score but no champion, and the public bracket (reads config) shows the same.
- **Estado:** ✅ corregido — Already applied in the working tree by the previous fixer: the downstream-clearing loop in advanceWinnerMut is guarded by `if (changed)`. Verified present, no further change needed.

### [GRAVE] Las reservas externas nunca bloquean pistas: claves y pistas no coinciden
- **Dónde:** línea ~958 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Un socio tiene reserva confirmada el 24/08 19:00-20:30 en Pista 1. El admin genera el cuadro con fechas 24/08-25/08: el scheduler asigna un partido a "24/08 19:00 - Pista 1" sin ningún aviso; en el editor manual ese slot tampoco aparece como ocupado.
- **Estado:** ✅ corregido — Misma corrección que el hallazgo de la línea 270: el mapa ya está en el espacio de claves del scheduler (dd/mm HH:00 -> Set<nº pista>), generateBracket/buildOccupiedCourts/buildOccupancyMap funcionan tal cual.

### [GRAVE] Ronda previa: más cabezas de serie que plazas directas corrompe el cuadro
- **Dónde:** línea ~1374 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Categoría con 7 parejas; el admin asigna los 3 cabezas de serie que le ofrece la pantalla de seeds; Generar cuadro (previa). Aparece un partido de previa vacío, #2 vs #3 se enfrentan en la primera ronda, y al meter el resultado de la previa 2 su ganador sobrescribe la plaza del ganador de la previa 1.
- **Estado:** ✅ corregido — maxSeeds = directCount en el generador (los sobrantes juegan la previa) y el panel de cabezas limita seedSlots a directCount cuando hay previa.

### [GRAVE] recomputeAllAutoTimes schedules matches whose participants are placeholders, giving consolation matches a time before the main match that feeds them
- **Dónde:** línea ~1872 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Tournament 24-25/08, 2 courts. Generate bracket + consolation before any result, then press 'Recalcular horarios'. Cons R0 'Perdedor por definir vs Perdedor por definir' is scheduled at '24/08 16:00 - Pista 2' (first free court). Public bracket shows it. Main R0 M1 is played Saturday 20:00; its loser is pushed into that cons match, which still says 24/08 16:00 — four hours before the match the loser came from. Same for main R1 'Ganador previa 1 vs X' (advanceWinnerMut clears that one later, but during recompute it steals a court from real matches).
- **Estado:** ✅ corregido — Recalcular salta partidos con isPlaceholder; consolación R0 no antes del partido del principal indicado por sourceMain (+gap); pushLoserToConsPure conserva sourceMain y suelta la hora no manual al sustituir el placeholder.

### [GRAVE] Score that does not decide a winner leaves the match stuck: no feedback, no manual fallback, and a previous winner is kept with a contradicting score
- **Dónde:** línea ~2031 (lote TM-C-resultados-avance)
- **Qué pasa:** Quarter-final ends by retirement: admin types '6-4 2-6 ret.' → p1Wins=1, p2Wins=1 → null → score saved, nothing advances, no message; the bracket cannot progress and the public page shows the match undecided. Or admin types '7-6(7-5) 4-6 6-4' (p1 won 2-1): the first token is split into 3 parts and ignored → 1-1 → no winner. Or: match A-B saved '6-4 6-3' (A advanced, B in consolation), admin edits to '4-6 6-3' intending to add the third set later → winner stays A, R1 still shows A, consolation still shows B, score reads 4-6 6-3.
- **Estado:** ✅ corregido — handleScoreSubmit now refuses (toast error, no save) an undecidable score when the match already has a winner; the admin is told to fix the score or set the winner with the manual 🏆 button.

### [GRAVE] Re-saving a score with the same winner wipes the winners of all later rounds; changing the winner leaves stale scores downstream
- **Dónde:** línea ~2039 (lote TM-C-resultados-avance)
- **Qué pasa:** R0 M0 'A vs B' saved as '6-4 6-3' → A advances. R1 M0 'A vs C' saved '6-2 6-2' → A in the final. Admin opens R0 M0 again and saves '6-4 6-2' (typo). Result: R1 M0.winner becomes null while its score '6-2 6-2' remains and A is still in the final → admin panel, PDFs and public bracket show a semifinal with a score but no winner and a finalist that 'did not win' his semifinal; the standings/loser logic (syncConsOnMainWinner) is not re-run for R1. Variant: change the R0 winner to B → R1 M0 becomes 'B vs C' but still displays '✎ 6-2 6-2' from the A-vs-C match.
- **Estado:** ✅ corregido — advanceWinnerMut: downstream-clearing loop now runs only when `changed` is true, and the invalidated match's `score` is cleared together with its `winner`.

### [GRAVE] Auto-schedule after a score ignores round order, allowed courts, court opening hours and bookings; assigns courts by count
- **Dónde:** línea ~2054 (lote TM-C-resultados-avance)
- **Qué pasa:** 1 day 16:00-22:00, 3 courts, 4 pairs, no availability rules. Generator puts R0 M0 and M1 at '24/08 16:00 - Pista 1/2' and the final at 18:00. Enter score for M0 → final.time wiped (changed). Enter score for M1 → both players known, no time → slotUsage['24/08 16:00']=2 < 3 → final scheduled at '24/08 16:00 - Pista 3', simultaneous with the two semifinals feeding it. With 2 courts and an admin having moved M1 manually to '17:00 - Pista 2': usage['17:00']=1 → final gets '17:00 - Pista 2' → double-booked court (buildOccupancyMap then silently overwrites one of the two entries in the grid). A court
- **Estado:** ✅ corregido — Legacy buildSlotUsage block removed (function deleted); result path now uses autoScheduleNextMatch = predecessors + round barrier + gap, buildOccupiedCourts (incl. external bookings), getAllowedCourts, courtStartHours via pickSlotAndCourt; manual times respected.

### [GRAVE] Correcting an R1 main result leaves the old loser in consolation and/or never injects the new eligible loser
- **Dónde:** línea ~2380 (lote TM-C-resultados-avance)
- **Qué pasa:** Main R1 M0: A (bye in R0) vs B (won R0). Admin types score making B the winner -> A is injected into cons. Admin realizes the score was inverted and re-enters it with A winning: A remains in the consolation bracket while also playing the main semifinal, and a pending placeholder elsewhere is turned into a BYE. Reverse order (first A wins, then corrected to B wins): A never appears in consolation; its reserved placeholder was already turned into BYE by the first entry.
- **Estado:** ✅ corregido — syncConsOnMainWinner rewritten: eligibility computed for the new loser, old loser always swapped out (replaced by new loser if eligible, else by a placeholder linked to the match), push fallback when the old loser was not in cons, release only when nobody from this match was in cons.

### [GRAVE] Any non-eligible R1 loser wipes an unrelated pending consolation placeholder (loser later dropped silently)
- **Dónde:** línea ~2384 (lote TM-C-resultados-avance)
- **Qué pasa:** 8-pair bracket, no byes. Admin generates consolation before all R0 results (placeholders for M0..M3). R0 M0, M1, M2 are played: cons R0 = [L0 vs L1], [L2 vs placeholder(M3)]. Admin enters the R1 M0 result (W0 vs W1) before R0 M3 is played (typical on multi-day events or when entering results in batch). Loser of R1 M0 is not eligible -> releaseConsPlaceholderAsBye converts placeholder(M3) into BYE and advances L2. Then R0 M3 is played: L3 is silently never added to consolation; the cons bracket has 3 pairs instead of 4 and nobody is warned.
- **Estado:** ✅ corregido — Release now targets only the placeholder linked to {round, matchIndex}. Silent drop surfaced: when pushLoserToConsPure finds no slot and the loser is not already in cons, an error toast is shown (computed from the state snapshot, not inside the updater).

### [GRAVE] handleSetWinner is dead code; the live result path (handleScoreSubmit) still uses the legacy court-blind scheduler
- **Dónde:** línea ~2409 (lote TM-C-resultados-avance)
- **Qué pasa:** 2 courts. Slot '24/08 18:00' has one match already on Pista 2 (usage=1, Pista 1 free). Admin enters a score whose next-round match is auto-scheduled to that slot: it gets 'Pista 2' (usage+1) -> two matches on the same court and hour. Likewise a consolation category restricted to Pista 2 gets assigned Pista 1, and a semifinal can be placed at a slot earlier than its quarterfinal feeders because earliestIdx is never applied.
- **Estado:** ✅ corregido — Scheduling logic extracted into autoScheduleNextMatch and shared by handleScoreSubmit and handleSetWinner; handleSetWinner kept, hardened (isRealPair guards, optional scoreStr, closes the editor) and wired to the UI as manual 🏆 buttons; buildSlotUsage deleted.

### [GRAVE] Consolation generated before R0 finishes reserves no slot for bye-players; their R1 loss is silently lost
- **Dónde:** línea ~2660 (lote TM-D-consolacion-pdf)
- **Qué pasa:** 6 pairs -> 8-slot bracket: R0 M0 = A vs BYE, M1 = B vs C, M2 = D vs E, M3 = F vs BYE. Admin clicks 'Generar Consolación' right after generating the bracket (the button is available). mainSources = [M1, M2] only -> cons is a single match with two placeholders. B and D lose R0 and fill it. A then loses R1 to C: pushLoserToConsPure finds no placeholder for {1,0}, no free placeholder, no bye-bye match -> returns null. A (and later F) never enter consolation; expected 4-pair consolation ends with 2.
- **Estado:** ✅ corregido — generateConsolation R1 loop no longer requires both p1 and p2: it reserves a mirror slot (sourceMain {round:1,...}) as soon as one known cons-eligible pair is present (bye-vs-bye and fully-unknown matches still skipped); loser calc guarded with m.p1 && m.p2. The missing-slot toast in syncConsOnMainWinner was already pr

### [GRAVE] Los BYEs de consolación se emparejan con placeholders y el placeholder se auto-avanza a R1: el perdedor real queda atascado en R0
- **Dónde:** línea ~2973 (lote TM-D-consolacion-pdf)
- **Qué pasa:** Categoría de 13 parejas (pow 16, 3 BYEs → 5 matches reales en R0). Generar consolación antes de jugar: 5 sources → pow 8 → 3 BYEs → R0 cons = [PH(M?) vs BYE, PH vs BYE, PH vs BYE, PH vs PH]. Los tres placeholders se auto-avanzan a semis de consolación como 'Perdedor por definir'. Se juegan los R0 del principal: los tres perdedores aterrizan en su slot espejo de R0 cons contra BYE, pero las semis siguen mostrando 'Perdedor por definir' y el admin no tiene ninguna acción para avanzar a esas parejas (el JSON guardado en config.consRounds queda con winner=placeholder).
- **Estado:** ✅ corregido — Auto-advance loop in generateConsolation now only advances isRealPair players vs BYE (placeholder-vs-BYE stays hidden until the loser arrives). pushLoserToConsPure uses a `place(m, side)` helper that calls advanceWinnerMut when the rival is a BYE (all PASS 1/PASS 2 sites), and includes a small self-heal: real-vs-BYE R0

### [GRAVE] Seed panel offers more seed slots than direct main-draw entries; generateBracket then builds broken prelim matches
- **Dónde:** línea ~3557 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Categoria with 7 pairs: floorPow=4, prelimMatchCount=3, directCount=1, panel shows 3 seed slots. Admin assigns seeds #1,#2,#3 and pulses Generar Cuadro. slot = [S1, null, S2, S3]; only slot 1 is free for prelim winners, so prelim match 0 gets nextSlot=1, prelim match 1 gets nextSlot=undefined, prelim match 2 has p1=p2=undefined ('¿? vs ¿?' card, never schedulable). When prelim match 1 is resolved its winner is written to R1 match 0 p2, evicting the winner/placeholder of prelim match 0 -> a pair that won its prelim vanishes from the draw.
- **Estado:** ✅ corregido — seedSlots limitado a directCount cuando hay previa; el generador degrada los seeds que no caben (maxSeeds = directCount) con aviso.

### [GRAVE] Seeds out of range or duplicated make pairs silently disappear from the generated bracket; panel hides them instead of validating
- **Dónde:** línea ~3562 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** (a) 13 pairs in a category: panel shows 5 seed slots, admin assigns #1..#5. One pair withdraws -> 12 pairs, seedSlots becomes 4, the #5 pair no longer appears anywhere in the panel but still has seed=5; Generar Cuadro places 5 seeds with only 4 direct slots (triggers the previous finding). (b) 8 pairs, admin types 9 in the inline Seed box of one pair: positions.indexOf(9) = -1, pair excluded from unseededAll -> the bracket is generated with a BYE where that pair should be and the pair is simply gone. (c) Two pairs typed seed 1 in the inline boxes: slot[0] ends up with the second one, the first
- **Estado:** ✅ corregido — Generador degrada repetidos/fuera de rango con toast; el panel muestra un aviso con botón 'Quitar' para seeds fuera de rango o repetidos y marca como ocupada cualquier pareja con seed; el input por fila limita 1..64 y rechaza duplicados dentro de la categoría.

### [GRAVE] Editar disponibilidad en Inscripciones no actualiza la pareja en `participants` (el cuadro se genera con horas viejas)
- **Dónde:** línea ~3774 (lote TM-A-estado-inscripciones)
- **Qué pasa:** 1) Pareja se inscribe online sin bloqueos. 2) Admin la confirma y pulsa 'Sincronizar (Web)' → entra en participants con prefRules []. 3) La pareja llama al club: no puede el sábado por la mañana. Admin va a Inscripciones → ✎ Editar → marca sábado 09-14 → Guardar. Toast '✓ Disponibilidad actualizada'. 4) Genera el cuadro: la pareja recibe partido el sábado a las 10:00 porque participants sigue con prefRules []. Volver a pulsar Sincronizar no lo arregla.
- **Estado:** ✅ corregido — Already applied in the working tree by the previous fixer (setParticipants with new prefRules/prefNames after setRegsList in saveRegAvail). Verified present; companion changes (changeRegCategory, deleteRegistration, realtime upsert) done in this pass.

### [GRAVE] Manual time editor (and the scheduler) never sees external court bookings: bookings.court_id is a UUID, tournament courts are integers
- **Dónde:** línea ~5553 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** A member has a confirmed booking on Pista 1 on 12/07 at 18:00. Admin opens ✎ on any match, picks day 12/07, row 18:00, column Pista 1: cell is green 'Libre', click assigns the tournament match there; the public bracket and the member's booking now overlap. 'Recalcular horarios' also places matches on that slot.
- **Estado:** ✅ corregido — Misma corrección que el hallazgo de la línea 270: buildOccupancyMap recibe pistas numéricas y slots horarios, así el editor manual muestra '🔒 Reserva de pista'.

### [GRAVE] "Reiniciar resultados" destroys liguilla, ronda-previa and bye brackets and leaves consolation stale
- **Dónde:** línea ~6022 (lote TM-C-resultados-avance)
- **Qué pasa:** Create a category with 6 pairs, generate with default 'Ronda Previa' (R0 = 2 prelim matches, R1 = cuartos with 4 direct pairs). Enter one prelim result. Open ⚙️ Más → Reiniciar resultados → confirm. All four direct-entry pairs in cuartos disappear (' ' names), only the 2 prelim matches remain; the bracket cannot be completed without re-drawing. Same with a liguilla of 4 pairs: jornadas 2 and 3 become empty cards.
- **Estado:** ✅ corregido — Reset now clears only seats produced by a result (winner ids of non-final rounds), keeps liguilla (isRR) pairings and R0, restores 'Ganador previa N' placeholders, re-applies R0 bye auto-advances (preserving times), empties consRounds, and the confirm text + a toast explain that the consolation must be regenerated.

### [GRAVE] 'Sincronizar desde este dispositivo' re-sube (y resucita) torneos que ya viven en la DB
- **Dónde:** línea ~6831 (lote TM-A-estado-inscripciones)
- **Qué pasa:** 1) El admin abre 'Torneo Verano' en el móvil (se crea la clave local con el UUID). 2) Desde el portátil lo renombra a 'Torneo Verano 2026' o cambia startDate (o directamente lo elimina; deleteTournament solo borra la clave local del dispositivo donde se borra). 3) En el móvil pulsa 'Sincronizar desde este dispositivo' → isDup no encuentra coincidencia por nombre/fecha → INSERT de un torneo duplicado/resucitado con cuadro, parejas y config desfasados. Toast '✅ 1 torneo subido'. El público no lo ve (draft) pero el admin acaba con dos torneos y puede editar/publicar el equivocado.
- **Estado:** ✅ corregido — Keys whose suffix is a UUID or whose data has publishedId are skipped; candidates whose localId matches an existing DB id are dropped; uploaded local keys are removed after a successful insert.

### [GRAVE] Al pulsar 'Volver' se pierden los cambios de los últimos 1,2 s (autosave debounced cancelado en el unmount)
- **Dónde:** línea ~6887 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Admin introduce el resultado de un partido (o marca ganador, cambia horario, confirma una pareja en participants, cambia fecha límite) y en menos de 1,2 s pulsa '← Volver'. La lista se muestra; al volver a abrir el torneo, el resultado no está y la página pública /torneos/:id/cuadro sigue mostrando el partido sin resultado.
- **Estado:** ✅ corregido — Same fix as line 244: ref-backed pending snapshot flushed on unmount and pagehide.

### [MEDIO] Pending autosave is discarded on unmount, losing the last edit made before leaving the editor
- **Dónde:** línea ~244 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Admin enters the final's score, immediately taps 'Volver al panel de Todos los Torneos' (well under 1.2 s). DB still has winner=null. The public bracket never shows the champion; reopening the editor loads the DB copy and the score is gone.
- **Estado:** ✅ corregido — Autosave now stores the snapshot in pendingSaveRef and flushTournamentSave() runs on the 1.2 s timer, on editor unmount (separate [] effect) and on window 'pagehide'.

### [MEDIO] 'Borrar Torneo Viejo' blanks the DB row while it stays public and breaks the editor until reload
- **Dónde:** línea ~357 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Admin with a published tournament presses 'Borrar Torneo Viejo' intending to start over. Players who still have the link see a tournament called '' with categories Masculino/Femenino and can still register (rows land on the same tournament_id). Admin cannot see those registrations nor re-publish until they refresh the browser.
- **Estado:** ✅ corregido — handleResetTournament now deletes the tournament_registrations, updates the row to name 'Torneo' / status 'draft' / blank config, sets dbStatus 'draft', clears regsList, keeps publishedId, resets a complete fresh config and newCoupleCategory 'Masculino'; dialog text warns that online registrations are deleted.

### [MEDIO] Rejecting, deleting or re-categorising a registration never touches participants, so ghost pairs stay in the draw
- **Dónde:** línea ~414 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Pair X registers in Masculino, admin confirms and presses 'Sincronizar (Web)': X is in participants. Player calls to say they cannot come; admin opens Inscripciones and presses 'Cambiar a rechazada' (or 'Borrar'). The panel says rejected, the couple receives the rejection email, but 'Generar Cuadro' still seeds X into the bracket and the public draw shows them. Same with 'Cambiar categoría': X stays in the old category's draw.
- **Estado:** ✅ corregido — confirmed_at only stamped on confirm; reject removes the pair from participants (and warns if its category already has a bracket); confirm adds it directly; delete/changeRegCategory also update participants; realtime UPDATE handler now removes non-confirmed rows and refreshes category/availability of existing ones.

### [MEDIO] Manual 'Marcar pagado' records half the amount actually charged and leaves stale data when reverted
- **Dónde:** línea ~470 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Fee 10 EUR/player. Pair A pays by card: amount_paid=20. Pair B pays cash, admin presses 'Marcar pagado': amount_paid=10. CSV export shows 20 vs 10 for the same fee; club accounting is off by half for every cash payment. Admin then presses 'Marcar pendiente' on B: row still says amount 10, method manual.
- **Estado:** ✅ corregido — amount_paid = fee * 2 (per pair, same as Redsys); reverting to pending nulls paid_at, amount_paid and payment_method. Header shows '€/jugador'.

### [MEDIO] Registrations are deduplicated by name only (any category) and syncRegistrations uses a stale participants closure
- **Dónde:** línea ~545 (lote TM-A-estado-inscripciones)
- **Qué pasa:** 'Ana y Lucia' register in Femenino and, separately, in Mixto. Admin confirms both. Sincronizar adds only the first one; the toast says 'No hay inscripciones confirmadas nuevas' forever for the second, and Mixto is one pair short without any warning.
- **Estado:** ✅ corregido — New sameCouple() helper (id, or normalized name + shared category incl. 'A y B') used by syncRegistrations, the realtime handler and the confirm path; syncRegistrations now writes via a functional setParticipants update.

### [MEDIO] Categorías con ' y ' en el nombre se reasignan a la primera categoría
- **Dónde:** línea ~1042 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** tConfig.categories = 'Femenino, Masculino 4ª y 5ª'. Las parejas inscritas en 'Masculino 4ª y 5ª' aparecen en el cuadro de Femenino y el cuadro masculino se queda sin parejas ('No hay suficientes parejas').
- **Estado:** ✅ corregido — normalizedParticipants comprueba primero la coincidencia exacta (sameCat) antes de trocear; catParts usa playsInCat (texto completo o trozo, sin mayúsculas); matchesFilter del panel de inscripciones también compara el texto completo.

### [MEDIO] Regenerar solo algunas categorías ignora las consolaciones ya programadas de las demás
- **Dónde:** línea ~1051 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Se genera Masculino, se genera su consolación (partido 25/08 18:00 - Pista 1) y luego el admin marca solo Femenino en el modal y genera: un partido de Femenino se asigna a 25/08 18:00 - Pista 1, la misma pista y hora que la consolación masculina.
- **Estado:** ✅ corregido — Helper markExisting aplicado a rounds[cat] y a consRounds[cat] en la rama onlyCats, así las categorías regeneradas no pisan slot+pista ni pareja de una consolación conservada.

### [MEDIO] Liguilla: la misma pareja se programa en horas consecutivas ignorando duración y descanso
- **Dónde:** línea ~1174 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Categoría en formato liguilla con 4 parejas, duración 90 min y descanso 30 min. Al generar: pareja A juega 10:00 Pista 1, 11:00 Pista 1 y 12:00 Pista 1; su segundo partido empieza cuando el primero aún no ha terminado.
- **Estado:** ✅ corregido — El bloque liguilla calcula earliestMinutes = último partido de cada pareja + duración + descanso (redondeado a la hora) y lo pasa a pickSlotCourtForMatch; lastMinuteByPair se actualiza tras cada asignación.

### [MEDIO] Seeds colisionados o fuera de rango hacen desaparecer parejas del cuadro
- **Dónde:** línea ~1236 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Pareja X inscrita en 'Masculino C y Masculino D' es cabeza #1 en C. En D el admin asigna #1 a la pareja Y (la pantalla de D no lo impide de forma segura). Al generar D, X e Y comparten el slot 0: una de las dos desaparece del cuadro y otro partido de R1 aparece con un hueco 'undefined'.
- **Estado:** ✅ corregido — Seeds leídos por categoría (getSeed) y saneados: repetidos, > mainBracketSize o por encima de las plazas directas pasan a no cabezas con toast; los huecos de relleno nunca quedan undefined (BYE de seguridad).

### [MEDIO] Modo byes: el auto-avance de byes borra los horarios recién calculados de R1 y de toda la cadena hasta la final
- **Dónde:** línea ~1636 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** 13 parejas, opción 'Octavos con byes' → cuadro de 16 con 3 byes. Tras generar, los tres cuartos con pareja que pasó por bye, sus semifinales y la final aparecen sin hora, aunque el modo prometía el calendario completo; los partidos que sí conservan hora están calculados contra un calendario ya borrado.
- **Estado:** ✅ corregido — Bloque de auto-avance de BYE movido antes del pre-scheduling de R1+ en generateBracket y antes del pre-scheduling en generateConsolation; PASS 1 ya ve a la pareja avanzada.

### [MEDIO] 'Editar orden' swap does not reconcile bye auto-advances, winners or scheduled times
- **Dónde:** línea ~1690 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** 6 pairs → 8-slot draw. R0 M0 = 'A vs BYE' (winner A, R1 M0.p1 = A). R0 M1 = 'B vs C'. Admin enables Editar orden and swaps A and B. Result: R0 M0 = 'B vs BYE' still highlighted with winner A; R0 M1 = 'A vs C'; R1 M0.p1 is still A → A appears twice in the bracket and B never advances; if B/C had marked the slot of M1 as unavailable, M1 keeps a time B cannot play. Saving persists this into tournaments.config and the public page shows it.
- **Estado:** ✅ corregido — handleSwapPlayers rechaza partidos con resultado (o cuyo ganador ya jugó R1), deshace el avance por BYE, limpia winner/score y horas no manuales, intercambia y vuelve a avanzar la pareja real contra BYE; swappable oculto en partidos jugados.

### [MEDIO] Auto-schedule after a result targets the wrong next match for ronda previa (ignores nextSlot)
- **Dónde:** línea ~2042 (lote TM-C-resultados-avance)
- **Qué pasa:** Previa with 3 matches, nextSlot = [1, 9, 13] (main matches 0, 4, 6). Admin saves the score of previa match index 2 (nextSlot 13). The winner correctly lands in main match 6, but the code looks at main match 1: if it already has two direct entrants and no time, it gets a slot assigned based on the wrong predecessors, while main match 6 (now complete) is left without a time and disappears from the players' schedule.
- **Estado:** ✅ corregido — New autoScheduleNextMatch routes via floor(nextSlot/2) when the finished match has nextSlot, uses the prelim matches feeding that slot as predecessors, and never schedules a match still holding a placeholder/'Ganador previa'.

### [MEDIO] Liguilla '3º y 4º puesto' match is never populated: semifinal losers are not routed to it
- **Dónde:** línea ~2061 (lote TM-C-resultados-avance)
- **Qué pasa:** Category configured as liguilla with liguillaThirdPlace=true and top 4. Generate eliminatorias, enter scores for both semifinals. Final is populated correctly; the '3º y 4º puesto' card never receives the two losers and can never be played/recorded, so the tournament cannot produce 3rd/4th classification (PDF/public also show it empty).
- **Estado:** ✅ corregido — Added syncThirdPlaceMut next to advanceWinnerMut; called from handleScoreSubmit and handleSetWinner when isCons. Semifinal losers land in p1/p2 of the isThirdPlace match; changing a semifinal result resets that match.

### [MEDIO] swapLoserInConsPure pre-advances the new loser into cons rounds the old loser had already won
- **Dónde:** línea ~2248 (lote TM-C-resultados-avance)
- **Qué pasa:** L1 loses main R0, enters cons, wins cons R0 vs L2, loses cons R1 vs L3 (L3 now in cons R2). Admin corrects the main R0 result so W1 is the loser: cons R0 becomes W1 vs L2 (no winner), cons R1 becomes W1 vs L3 with winner cleared, cons R2 still shows L3. W1 appears in two rounds at once and L3's win is erased.
- **Estado:** ✅ corregido — Rewritten: substitutes only in the entry match (first round where oldLoser appears), clears its result and the whole downstream chain via new clearConsDownstreamMut, re-applies bye auto-advance if the rival is a BYE, and tags the replacement (pair or placeholder) with sourceMain.

### [MEDIO] releaseConsPlaceholderAsBye libera el primer placeholder que encuentra, no el vinculado al match de R1 que lo originó
- **Dónde:** línea ~2287 (lote TM-C-resultados-avance)
- **Qué pasa:** R0 del principal: M0 (A vs BYE), M1 (B vs C), M2 (D vs E), M3 (F vs G). Se juegan M1 y M2, el admin genera consolación (slots: L(M1), L(M2), PH(M3), PH(R1-M0)). Se juega R1 M0 antes que M3 y pierde la pareja que venía de M1 (no elegible) → se libera como BYE el placeholder de M3 (primero con rival real). Al jugarse M3, su perdedor pisa el placeholder de R1-M0 (fallback) o, si ya no queda ninguno, no entra en consolación.
- **Estado:** ✅ corregido — Signature is now (cat, sourceMain): only the placeholder linked to that main match is released (legacy: only unlinked placeholders when no sourceMain is given); no first-free fallback. The released BYE keeps sourceMain so pushLoserToConsPure can undo it (new PASS 1b) if the result is corrected later.

### [MEDIO] 'Pasar partido completo a siguiente ronda' overwrites the sibling match's advanced winner (pair lost)
- **Dónde:** línea ~2508 (lote TM-C-resultados-avance)
- **Qué pasa:** Cons R1: M2 = A vs B (unplayed), M3 = C vs D, C already won and sits in R2 M1.p2. Admin presses 'Pasar partido completo' on M2 -> R2 M1 becomes A vs B; C is gone from the bracket with no trace. If instead M3 is played later, its winner overwrites B.
- **Estado:** ✅ corregido — handleAdvanceMatchWhole computes on the current state, refuses with an error toast when the sibling slot in the next match holds a real pair, resets next.winner/score, and toasts are no longer inside the updater; the button is hidden when the sibling slot is occupied.

### [MEDIO] Liguilla+KO third-place match is created but never populated (dead feature)
- **Dónde:** línea ~2604 (lote TM-C-resultados-avance)
- **Qué pasa:** Category configured as liguilla_ko with 'Top 4' and '3º y 4º puesto' checked. Liguilla finishes, admin generates the KO, both semis are played: the final gets its two finalists, but the '3º y 4º puesto' card stays 'Por definir vs Por definir' forever with no way to enter a score.
- **Estado:** ✅ corregido — Same syncThirdPlaceMut fix as the 2061 finding. The optional KO R0 bye auto-advance was not added (unreachable from the UI: qualifyN is always a power of two).

### [MEDIO] Se crea un placeholder muerto para matches de R1 ya jugados cuyo perdedor no es cons-eligible
- **Dónde:** línea ~2693 (lote TM-D-consolacion-pdf)
- **Qué pasa:** 12 parejas, el admin juega R0 y R1 y solo entonces pulsa 'Generar Consolación'. En R1 M0 (A que venía de BYE vs W ganador de R0) gana A: W ya jugó 2 partidos → loser=null → se crea `cons-placeholder-cat-r1-m0` y se empareja con un perdedor real de R0. Ese match de consolación nunca se puede jugar ni auto-resolver.
- **Estado:** ✅ corregido — Added `if (m.winner && !loser) return;` before the mainSources.push in the R1 loop so a decided R1 match that cannot feed consolation does not create a dead 'Perdedor por definir' placeholder.

### [MEDIO] El scheduler de consolación no evita que una pareja juegue dos partidos a la misma hora (parejas en dos categorías)
- **Dónde:** línea ~2895 (lote TM-D-consolacion-pdf)
- **Qué pasa:** Pareja 'Nico y Pablo' inscrita en Masculino C y Masculino D. Pierde R0 de C; su partido de consolación C se genera con afinidad y elige 'sáb 18:00 - Pista 2' porque está libre, mientras su cuartos de D ya está en 'sáb 18:00 - Pista 1'. El listado 'Partidos por día' muestra a la misma pareja dos veces a las 18:00.
- **Estado:** ✅ corregido — generateConsolation now builds playerSlots/markPlayerSlot/arePlayersFree from all categories' rounds + consRounds (excluding this cat's cons); pickSlotCourtForCons takes p1/p2 and skips slots where either pair already plays in all three search loops; R0 affinity, PASS 1 and PASS 2 pass the pair and mark/unmark slots (m

### [MEDIO] Las rondas R1+ de consolación se pre-programan aunque R0 no tenga horarios: semis/final de consolación caen en la primera hora del día 1
- **Dónde:** línea ~2931 (lote TM-D-consolacion-pdf)
- **Qué pasa:** Torneo 3 días, 8 parejas, 'Generar Consolación' justo tras generar el cuadro. Cons R0 = 4 placeholders (sin hora). Cons R1 (2 matches) y final se asignan a día 1 16:00 y 17:00 en las pistas de consolación; la web pública muestra 'Semifinal consolación · día 1 16:00' sin parejas, y el listado de partidos por día del día 1 incluye tres filas 'TBD vs TBD'.
- **Estado:** ✅ corregido — PASS 1 of cons pre-scheduling skips a match when a direct predecessor has no time and its winner is unknown (real-vs-real without time, or any match containing a placeholder, including placeholder-vs-BYE); real-vs-BYE predecessors without time do not block. Chains naturally to later rounds; PASS 2 unchanged.

### [MEDIO] handleDownloadPDF borra los estilos inline del contenedor del cuadro y React no los vuelve a aplicar
- **Dónde:** línea ~3137 (lote TM-D-consolacion-pdf)
- **Qué pasa:** Abrir un torneo con cuadro, pulsar 'Exportar PDF' del principal. Tras la descarga, la caja del cuadro principal pierde el fondo gris, el padding y los 3rem de separación con la consolación; el cuadro de consolación se pega al principal. Exportar la consolación también deja esa caja sin estilos.
- **Estado:** ✅ corregido — Saved `const prevCssText = element.style.cssText` before the capture try block and restore it in finally (`element.style.cssText = prevCssText`) instead of removeAttribute('style').

### [MEDIO] Availability edits are never synced between participants.prefRules and tournament_registrations.unavailable_times
- **Dónde:** línea ~3435 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** An online pair is confirmed and imported. The admin opens Inscripciones, edits the pair's availability to block Saturday morning, saves (toast 'Disponibilidad actualizada'). Then presses Generar Cuadro: expandedParticipants still uses the old prefRules, and the pair is scheduled Saturday 10:00 despite the saved block. Reverse case: admin blocks hours via the pencil icon in the participants list; the Inscripciones panel and any later re-import show the old availability.
- **Estado:** ✅ corregido — saveEditGrid (async) escribe unavailable_times en tournament_registrations para inscripciones online (id UUID, torneo publicado) y refresca regsList; saveRegAvail actualiza prefRules/prefNames del participante importado.

### [MEDIO] Dual-category pairs share one seed field, so seeding them in one category corrupts the other
- **Dónde:** línea ~3538 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Pair X is dual 'Masculino C y Masculino D'. In Masculino C the admin sets X as #1. Opening Masculino D shows X already as #1 (unwanted). The admin picks pair Y as #1 for Masculino D: onChange clears X.seed (currentId === X) and sets Y.seed = 1. Back in Masculino C, X is no longer cabeza de serie; generateBracket places X as an unseeded pair in C. It is impossible to seed X differently per category.
- **Estado:** ✅ corregido — Nuevo campo seedByCat con helpers getSeed/withSeed (módulo); panel, generador e input por fila leen/escriben por categoría; el `seed` antiguo sigue valiendo para su (primera) categoría, configs guardadas cargan igual.

### [MEDIO] Cambiar categoría / rechazar una inscripción ya sincronizada no se refleja en `participants`
- **Dónde:** línea ~3714 (lote TM-A-estado-inscripciones)
- **Qué pasa:** A) Pareja confirmada y sincronizada en 'Masculino B'. Admin en Inscripciones cambia el desplegable a 'Masculino A' → toast '✓ Pareja movida'. Genera el cuadro: la pareja juega en Masculino B. B) Pareja confirmada + sincronizada; el club decide rechazarla → 'Cambiar a rechazada' → correo de rechazo enviado; al generar el cuadro la pareja rechazada sigue dentro y recibe partidos.
- **Estado:** ✅ corregido — changeRegCategory maps the participant to the new category (warning if either category already has a bracket); reject filters it out; realtime UPDATE handler is now an upsert/remove.

### [MEDIO] Borrar una inscripción deja la pareja en `participants` y la reclasifica como 'añadida manualmente'
- **Dónde:** línea ~3737 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Pareja 'Juan y Pedro' inscrita 2 veces en Masculino (duplicada), ambas confirmadas y sincronizadas → participants tiene 2 entradas. Admin pulsa 🗑️ Borrar en una de ellas. Tras el toast '🗑️ Inscripción borrada', la misma pareja aparece abajo en 'Parejas añadidas manualmente', el recuento de tallas suma 2 jugadores 'sin asignar' extra, y al generar el cuadro salta el error de 'parejas duplicadas' (línea 901) o, si no estaba confirmada la otra, juega una pareja borrada.
- **Estado:** ✅ corregido — deleteRegistration now also does setParticipants(prev => prev.filter(p => p.id !== reg.id)) and warns if the pair was already in a bracket.

### [MEDIO] 'Marcar pagado' registra la mitad del importe que cobra la pasarela (por jugador vs por pareja)
- **Dónde:** línea ~3998 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Fee 20€. Pareja A paga con tarjeta → fila '✓ Pagado · 40.00€'. Pareja B paga en el club → admin pulsa 'Marcar pagado' → fila '✓ Pagado · 20.00€'. El CSV exportado suma importes distintos para el mismo concepto. Si luego pulsa 'Marcar pendiente' en A, la fila queda '⏳ Pendiente · 40.00€'.
- **Estado:** ✅ corregido — The 'Marcar pagado' button is now rendered for every row when the fee is enabled (column already gated by registrationFeeEnabled).

### [MEDIO] 'Borrar Torneo Viejo' deja el torneo público (status 'open') con config vacía y oculta Inscripciones/QR hasta recargar
- **Dónde:** línea ~4284 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Torneo 'Open Verano' publicado con 10 inscripciones. Admin pulsa 'Borrar Torneo Viejo' → Confirmar. En /torneos los jugadores ven ahora un torneo llamado 'Torneo' sin fechas con 'Inscripción abierta'. El admin, en Fase 2, no encuentra el botón Inscripciones ni el enlace; tiene que recargar la página (useState(tournamentKey)) para recuperarlos.
- **Estado:** ✅ corregido — Same handler fix as line 357 (DB row reset to draft, registrations deleted, publishedId kept) plus the visibility condition now uses Object.keys(rounds).length.

### [MEDIO] `newCoupleCategory` queda con una categoría inexistente tras cargar de BBDD → parejas manuales se añaden a una categoría fantasma
- **Dónde:** línea ~4941 (lote TM-A-estado-inscripciones)
- **Qué pasa:** Torneo con categorías 'Masculino A, Masculino B, Femenino'. Admin abre el editor desde otro ordenador (o tras borrar caché). La cabecera dice 'Elenco "Masculino": 0 parejas' y el desplegable parece vacío. Escribe 'Luis y Ana' y pulsa Añadir → la pareja aparece con etiqueta 'Masculino'. Genera cuadro: la pareja acaba en 'Masculino A' sin aviso, aunque el admin quería Femenino.
- **Estado:** ✅ corregido — Effect resyncs newCoupleCategory to the first real category whenever tConfig.categories changes ('' kept as the 'Todas' filter); addParticipant rejects a category not in the tournament with a toast.

### [MEDIO] Liguilla+KO '3º y 4º puesto' match is created but never receives the semifinal losers, so it can never be played
- **Dónde:** línea ~6254 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** Config: liguilla_ko, Top 4, 'Partido por el 3º y 4º puesto' ticked. Finish the liguilla, click 'Generar Eliminatorias Finales', enter both semifinal results. The final is populated; the '3º y 4º puesto' card stays 'Por definir vs Por definir' with no way to enter a result.
- **Estado:** ✅ corregido — Ya estaba resuelto por un fixer anterior (syncThirdPlaceMut llamado desde handleScoreSubmit y handleSetWinner); verificado en el código actual, sin cambios adicionales.

### [MEDIO] Swap mode reorders R0 pairs without clearing results or the pre-advanced bye winners, corrupting the bracket
- **Dónde:** línea ~6456 (lote TM-B-sorteo-scheduler)
- **Qué pasa:** 8-slot bracket with byes: R0 M0 = A vs BYE (A already sits in R1 M0.p1 with M0.winner = A), R0 M1 = B vs C. Admin clicks 'Editar orden', clicks A then B. Result: M0 = B vs BYE but M0.winner is still A and R1 still shows A; M1 = A vs C. A appears twice in the bracket and B can never advance (bye match has no score UI). Same with a played match: winner/score stay attached to the old pairing and the R1 seat holds the previous pair.
- **Estado:** ✅ corregido — Misma corrección que el hallazgo de la línea 1690 (handleSwapPlayers con guardas y reconciliación de BYE/hora, swappable oculto en partidos con resultado).

### [MEDIO] Score input is enabled for matches whose opponent is a 'Ganador previa' placeholder, so a placeholder can be recorded and advanced as winner
- **Dónde:** línea ~6493 (lote TM-C-resultados-avance)
- **Qué pasa:** Ronda Previa structure, cuartos M0 = 'Seed 1' vs 'Ganador previa 1'. Before the prelim is played, admin (or by mistake) opens '+ Introducir resultado' on M0 and types '4-6 4-6'. M0.winner becomes the placeholder, the semifinal shows 'Ganador previa 1' with a 🏆 on the card, and the public bracket shows a fake result.
- **Estado:** ✅ corregido — Component-level isRealPair(p) (not bye/placeholder/prelim placeholder) used for the `ready` gate, in determineWinnerFromScore, and as an early guard with toast in handleScoreSubmit and handleSetWinner.

### [MEDIO] activeId persistido en localStorage abre un editor 'fantasma' si el torneo ya no existe: todas las ediciones van a la nada
- **Dónde:** línea ~6708 (lote TM-A-estado-inscripciones)
- **Qué pasa:** 1) Móvil: admin deja abierto el torneo X (adminActiveTournamentId=X). 2) Portátil: elimina X. 3) Móvil: recarga la app → entra directamente al editor de X con la copia local; añade parejas, genera cuadro, pulsa 'Publicar cuadro' → handlePublishBracket hace update sobre 0 filas, no hay error, toast '🏆 Cuadro publicado'. Nadie ve nada y el trabajo se pierde al limpiar el navegador.
- **Estado:** ✅ corregido — Editor load: on PGRST116 / no row it removes the local copy, toasts and calls onBack() without arming the autosave (network errors keep the old behaviour). fetchTournaments drops a persisted activeId that is not in the fetched list (via activeIdRef).

## src/pages/TournamentBracket.jsx (3)

### [MEDIO] Public bracket labels the Ronda Previa as 'Octavos/Cuartos de Final'
- **Dónde:** línea ~5 (lote cuadro-publico)
- **Qué pasa:** 12 pairs: rounds = [previa(4 matches), cuartos, semis, final]. Admin panel shows 'Ronda Previa' for round 0; the public page shows 'Octavos de Final' for the same matches. With 6 pairs the previa is shown as 'Cuartos de Final' while the next round is also 'Semifinales' -> players see two inconsistent stage names.
- **Estado:** ✅ corregido — getRoundName now accepts the rounds array (number still works for compatibility), returns 'Ronda Previa' for index 0 when rounds[0][0].isPrelim, and adds Treintaidosavos/Sesentaicuatroavos; both mobile and desktop call sites pass bracket.data instead of bracket.data.length.

### [MEDIO] Empty 'Por definir' slot is painted as the winner (green background + trophy) whenever a match has no winner yet
- **Dónde:** línea ~63 (lote cuadro-publico)
- **Qué pasa:** Publish a KO bracket, enter the score of R0 match 0 so its winner moves to SF match 0 (p1 set, p2 still null, winner null). Open /torneos/<id>/cuadro: the SF card shows the empty second row highlighted green with a trophy icon next to 'Por definir', as if the not-yet-known pair had won.
- **Estado:** ✅ corregido — MatchCard: isWinner = !!match.winner && !!player && match.winner.id === player.id, so a null winner or empty slot never gets the winner styling/trophy.

### [MEDIO] Liguilla + KO: the final playoff bracket (stored in consRounds[cat]) is never shown on the public page
- **Dónde:** línea ~264 (lote cuadro-publico)
- **Qué pasa:** Category 'B' configured as 'Liguilla + eliminatorias finales', liguilla finished, admin clicks 'Generar eliminatorias', enters times, republishes the bracket and emails players 'Cuadro actualizado'. Players open the link: only the standings and past jornadas are visible; no final, no schedule.
- **Estado:** ✅ corregido — Inside the isLiguilla branch, after the Jornadas, a '🏆 Eliminatorias Finales' section renders catCons round by round (labels via getRoundName, '3º y 4º puesto' tag for isThirdPlace, hidden bye-only matches skipped) reusing MatchCard. Public-side only; the admin line 1158 change belongs to another owner.

## src/pages/TournamentRegistration.jsx (4)

### [MEDIO] Client-side duplicate check is dead code for players (no SELECT policy) and the admin gets two notification emails per registration
- **Dónde:** línea ~237 (lote registro-lista)
- **Qué pasa:** A player double-submits from two tabs, or re-registers after not receiving the confirmation email: two identical rows are inserted, the club receives four emails, and the bracket cannot be generated until the admin finds and deletes the duplicate.
- **Estado:** 🟡 parcial — Removed the misleading SELECT on tournament_registrations (always [] under RLS for players) and the unused normalizeForCompare import; the INSERT error handler now maps code 23505 (unique_violation) to the 'Esta pareja ya está inscrita en esa categoría' toast. Removed the client-side send-registration-admin-notify invo

### [MEDIO] Admin gets two 'Nueva inscripcion' emails per registration (DB trigger + client invoke), with different content
- **Dónde:** línea ~311 (lote registro-lista)
- **Qué pasa:** A pair registers with the fee enabled. The club inbox receives two 'Nueva inscripcion - Torneo X (Masculino)' messages within seconds, one with the amount and one without; with 40 registrations the admin gets 80 emails and starts ignoring them.
- **Estado:** ✅ corregido — Deleted the whole client-side supabase.functions.invoke('send-registration-admin-notify') block after the INSERT; left a comment that the DB trigger (migration admin_notify_on_registration) is the single sender. Flow now goes straight from the insert error check to the Redsys redirect. The trigger amount fix (new migra

### [MEDIO] With 'pago obligatorio' unchecked the card option is offered but the TPV redirect is skipped, so the user is told the gateway will open and it never does
- **Dónde:** línea ~339 (lote registro-lista)
- **Qué pasa:** Admin enables a 10 EUR fee but unticks 'obligatorio' (meaning: they can confirm pairs before payment arrives). A player picks 'Pagar ahora con tarjeta', clicks Inscribirse, sees the success screen, assumes they paid. The admin sees '⏳ Pendiente · Tarjeta' and has to chase the money.
- **Estado:** ✅ corregido — Redirect condition changed from `totalFee > 0 && feeRequired && chosenMethod === 'card'` to `totalFee > 0 && chosenMethod === 'card'`, so a player who picks 'Pagar ahora con tarjeta' always goes to Redsys; removed the now-unused feeRequired const. redsys-create call body unchanged.

### [MEDIO] After Redsys the player is sent to /torneos/:id?inscripcion=ok|fallo but nothing reads that param: paid users see a blank form, failed payments have no message or retry
- **Dónde:** línea ~358 (lote registro-lista)
- **Qué pasa:** Fee enabled, player chooses 'Pagar ahora con tarjeta', pays 20 EUR. Redsys → redsys-redirect → /torneos/<id>?inscripcion=ok → the form reloads empty. The player thinks it did not work and registers (and pays) again. Admin now has two rows for the same pair, both 'paid'. Variant: card declined → ?inscripcion=fallo → same blank form; the 'failed' row lingers and the pair re-registers.
- **Estado:** ✅ corregido — Added useSearchParams + payScreen state. fetchTournament reads ?inscripcion before the bracketPublished/status early-returns, sets payScreen, clears the param (replace) and skips the form. 'ok' reuses the success card with 'Pago recibido' wording and clears sessionStorage; 'fallo' renders a 'Pago no completado' card th

## src/pages/Tournaments.jsx (1)

### [MEDIO] La lista pública ignora config.registrationClosed: muestra 'Inscripción abierta' y botón 'Inscribirse' tras el cierre manual del admin
- **Dónde:** línea ~69 (lote registro-lista)
- **Qué pasa:** Admin publica un torneo sin fecha límite y pulsa 'Cerrar inscripción' al llenarse el cupo. En /torneos la tarjeta sigue con badge verde 'Inscripción abierta', barra verde y CTA 'Inscribirse al torneo'; el jugador pulsa y aterriza en una página que dice 'Inscripción Cerrada'. Lo mismo en el portal del club: información contradictoria y quejas de jugadores.
- **Estado:** ✅ corregido — Added manuallyClosed(t) = t.config?.registrationClosed === true and made isOpen(t) = (status==='open' || status==null) && !manuallyClosed(t). Deadline note now also renders 'Inscripción cerrada por el club' (red) when manually closed even without a deadline. Kept `|| t.status == null` as the finding recommended.

## supabase-schema.sql (1)

### [GRAVE] Any logged-in user can set profiles.role='admin' on their own row and gain full control of tournaments and registrations
- **Dónde:** línea ~98 (lote backend)
- **Qué pasa:** A normal client logs in, runs PATCH /rest/v1/profiles?id=eq.<own uuid> with {"role":"admin"} using their session JWT. is_admin() now returns true, so they can read every registration (names, phones, emails), mark payments, confirm/reject pairs, edit or delete any tournament, and everything else gated by is_admin(). The panel's role check in AuthContext also flips, giving them the admin UI.
- **Estado:** ✅ corregido — New migration 20260824100000_profiles_bloquea_cambio_role.sql: BEFORE UPDATE OF role trigger 'profiles_bloquea_cambio_role' raises 42501 if NEW.role <> OLD.role and the caller is an anon/authenticated JWT that is not is_admin() (SQL editor/service_role keep working for admin promotion); policy 'Usuarios editan su perfi

## supabase/functions/redsys-create/index.ts (1)

### [GRAVE] Tournament payment amount is taken from the client, so a player can pay any amount and still be marked 'paid'
- **Dónde:** línea ~62 (lote backend)
- **Qué pasa:** Fee is 10 EUR/player (20 EUR/pair). Player registers normally (registrationId X, payment 'pending'). From the browser console they POST to /functions/v1/redsys-create with {kind:'tournament', registrationId:X, amount:0.01, successUrl, failUrl, notifyUrl, paymentMethod:'card'}, submit the returned form to Redsys and pay 1 cent. redsys-notify sets payment_status='paid', amount_paid=0.01. Admin panel shows '✓ Pagado · 0.01€' and, unless the admin reads the cents, the pair is treated as paid.
- **Estado:** ✅ corregido — redsys-create: for kind==='tournament' loads registration + tournaments.config with service role, rejects invalid/missing/already-paid registrations and tournaments without online fee, charges registrationFeeAmount*2 server-side and signs expectedCents into MerchantData. Booking path unchanged.

## supabase/functions/redsys-notify/index.ts (1)

### [MEDIO] Tournament payment notify silently accepts a charge whose registration no longer exists (or is missing) and never alerts the admin
- **Dónde:** línea ~128 (lote backend)
- **Qué pasa:** Admin opens Inscripciones, sees a pending duplicate-looking row and presses 'Borrar' while that player is on the Redsys page. The player completes the 20 EUR payment. redsys-notify updates 0 rows, logs 'marcada como pagada', returns OK. Nobody at the club knows the money came in; the player has a Redsys receipt but no registration.
- **Estado:** ✅ corregido — Added alertaCobroTorneo() helper (push + admin email, same pattern as alertaCobroSinReserva); UUID guard on registrationId (no id=eq.undefined); loads the registration first: missing row -> alert + OK (no retry loop), already paid -> idempotent OK, amount mismatch vs expectedCents (fallback fee*2 from config) -> stored

## supabase/functions/send-bracket-published/index.ts (1)

### [GRAVE] Open email relay + HTML/link injection: no caller check and unescaped tournamentName/tournamentUrl
- **Dónde:** línea ~80 (lote backend)
- **Qué pasa:** curl -X POST https://<proj>.supabase.co/functions/v1/send-bracket-published -H 'Authorization: Bearer <anon key from bundle>' -H 'Content-Type: application/json' -d '{"emails":["victim1@x.com",...],"tournamentName":"<a href=https://evil.example>Torneo</a>","tournamentUrl":"https://evil.example/login"}' → every victim receives a legitimate-looking Padel Medina mail whose green button goes to the attacker's page. Deliverability of the club's domain is also at risk from the resulting spam reports.
- **Estado:** ✅ corregido — Added callerAutorizado() (service-role bearer OR user JWT verified via /auth/v1/user + profiles.role='admin', like admin-update-user) and escapeHtml() applied to tournamentName and tournamentUrl inside bracketHtml; inputs coerced/length-capped; tournamentUrl must parse as http(s). Admin panel already sends the admin se

## supabase/functions/send-tournament-confirmation/index.ts (1)

### [GRAVE] Open email relay + HTML injection: no caller check and unescaped coupleName/tournamentName/category
- **Dónde:** línea ~118 (lote backend)
- **Qué pasa:** Anonymous POST to /functions/v1/send-tournament-confirmation with the anon key and body {"action":"confirm","emails":["anyone@x.com"],"coupleName":"<a href=https://evil.example>pulsa aquí</a>","tournamentName":"Torneo","category":"A"} → 'anyone@x.com' receives an 'Inscripción confirmada' mail from reservas@padelmedina.com containing the attacker's link. A real category such as '4ª <35 años' also renders broken because '<' is not escaped.
- **Estado:** ✅ corregido — Same callerAutorizado() admin/service-role check before reading the body; coupleName/tournamentName/category coerced and length-capped, and passed through escapeHtml() into confirmedHtml/rejectedHtml (subject stays plain text).

## supabase/migrations/20260422120000_tournaments_admin_write.sql (1)

### [MEDIO] Anonymous INSERT policy WITH CHECK (true) lets anyone self-confirm, self-mark as paid, or register into closed tournaments
- **Dónde:** línea ~22 (lote backend)
- **Qué pasa:** With the anon key from the bundle: POST /rest/v1/tournament_registrations {tournament_id:<any>, category:'A', player1_name:'X', player2_name:'Y', confirmation_status:'confirmed', payment_status:'paid', amount_paid:30} after the deadline. The club receives a 'Nueva inscripcion' mail saying '✓ Pagado · 30.00€', and the next 'Sincronizar inscripciones' click puts the pair in the bracket without the admin ever confirming or receiving money.
- **Estado:** ✅ corregido — New migration 20260824100100_inscripciones_insert_solo_abiertas.sql: SECURITY DEFINER helper torneo_admite_inscripciones(uuid) (status='open', registrationClosed/bracketPublished not true, registrationDeadline[+Time] not passed in Europe/Madrid, tolerant of malformed old configs) and 'Anyone can register' recreated for

## supabase/migrations/20260426120000_ensure_anyone_can_register.sql (1)

### [GRAVE] INSERT policy WITH CHECK (true) lets anyone self-mark a registration as paid and confirmed, and register into closed/draft tournaments
- **Dónde:** línea ~9 (lote backend)
- **Qué pasa:** Anyone with the public anon key runs: POST /rest/v1/tournament_registrations {tournament_id:<id>, category:'Masculino', player1_name:'A', player2_name:'B', payment_status:'paid', payment_method:'redsys', amount_paid:20, paid_at:now, confirmation_status:'confirmed', confirmed_at:now}. If the admin has the availability panel open the pair appears in participants immediately; otherwise on the next 'Sincronizar'. The admin sees '✓ Pagado · 20.00€ / ✓ Confirmada' and never validated or charged them. The same call works after the deadline, after '🔒 Cerrar inscripción', on a draft tournament, or aft
- **Estado:** ⏭️ omitido — Unverified (confirmed=false) and not trivial: restricting the public SELECT could break the admin list and other pages that select tournaments; the existing migration is not editable. Left for a dedicated change.

## supabase/migrations/20260503100000_admin_notify_on_registration.sql (1)

### [GRAVE] Admin receives every registration twice: DB trigger AND the client both call send-registration-admin-notify
- **Dónde:** línea ~52 (lote backend)
- **Qué pasa:** A pair registers in a tournament with a 15 € fee choosing 'card'. padelmedina@hotmail.com gets two 'Nueva inscripcion - <torneo> (<cat>)' mails within seconds: one reading 'Pago: ⏳ Pendiente · Tarjeta · 30.00€' and another reading 'Pago: ⏳ Pendiente · Tarjeta' (no amount). The club cannot tell whether one or two pairs registered.
- **Estado:** 🟡 parcial — New migration 20260824100200_notify_admin_importe_y_secreto.sql recreates only notify_admin_on_new_registration() (trigger untouched, stays the single path): amount = fee from config * 2 (or amount_paid if set, NULL when not_required/no fee) and sends x-notify-secret read from Vault ('registration_notify_secret') so se

## Avisos leves (sin verificar)

- src/components/admin/TournamentManager.jsx ~L218: Fresh tournaments lose their DB name and a failed DB fetch lets stale localStorage overwrite the DB
- src/components/admin/TournamentManager.jsx ~L471: Manual 'Marcar pagado' stores the per-player fee while online payments store the per-pair amount (fee x 2)
- src/components/admin/TournamentManager.jsx ~L720: Bracket-published mail links to whatever origin the admin is browsing from (localhost/preview) instead of the production URL
- src/components/admin/TournamentManager.jsx ~L924: Hora de fin excluida por el scheduler pero ofrecida en las rejillas y opción dualCategoryMaxMatches sin efecto
- src/components/admin/TournamentManager.jsx ~L1075: Regenerar una categoría con <2 parejas borra su cuadro existente sin aviso
- src/components/admin/TournamentManager.jsx ~L1090: Torneos que cruzan fin de año: el orden temporal se invierte
- src/components/admin/TournamentManager.jsx ~L2003: parseScore drops any set written with tie-break detail, so the bracket cell shows fewer sets than were played
- src/components/admin/TournamentManager.jsx ~L2030: Correcting a score to one with no decidable winner keeps the previous winner and downstream advancement
- src/components/admin/TournamentManager.jsx ~L2096: getAllowedCourts returns courts that no longer exist after courtsCount is reduced
- src/components/admin/TournamentManager.jsx ~L2793: slotMinutesGen ordena los slots sin año: un torneo que cruza Nochevieja invierte el orden temporal
- src/components/admin/TournamentManager.jsx ~L2998: Los selectores CSS del PDF usan el id derivado del nombre de la categoría sin escapar: con '/', '+', '(' etc. se descartan todas las reglas
- src/components/admin/TournamentManager.jsx ~L3149: El filtro de día del listado/PDF persiste con un valor que ya no existe y deja el modal vacío
- src/components/admin/TournamentManager.jsx ~L3256: El PDF de partidos y el modal en pantalla etiquetan la ronda con un desfase de 1 y la consolación pierde la ronda
- src/components/admin/TournamentManager.jsx ~L3383: Availability grid includes the end hour, which the scheduler never uses
- src/components/admin/TournamentManager.jsx ~L3446: Drag-select state sticks when the mouse button is released outside the window
- src/components/admin/TournamentManager.jsx ~L3539: Seed panel counts pairs per category differently from generateBracket
- src/components/admin/TournamentManager.jsx ~L3759: Guardar disponibilidad sin fechas configuradas (o tras cambiar fechas) borra todos los bloqueos de la inscripción
- src/components/admin/TournamentManager.jsx ~L3997: Inscripciones con `payment_status='not_required'` no tienen botón de cobro aunque el torneo tenga cuota activada
- src/components/admin/TournamentManager.jsx ~L4322: Cambiar 'Horario Inicial' por encima del 'Horario Final' deja `endHour`/`firstDayStartHour` stale y sin horas válidas
- src/components/admin/TournamentManager.jsx ~L5782: Courts editor prunes courtStartHours on every keystroke and leaves courtsByCategory/courtNames pointing at courts that no longer exist
- src/components/admin/TournamentManager.jsx ~L6747: La migración legacy inserta duplicados si la consulta de comprobación falla, y no comprueba el error
- src/components/admin/TournamentManager.jsx ~L6889: onBack no espera a updateTournamentName antes de fetchTournaments: la lista puede volver con el nombre antiguo
- src/pages/TournamentBracket.jsx ~L368: Consolation shows phantom 'Perdedor por definir vs ---' cards that the admin hides
- src/pages/TournamentRegistration.jsx ~L118: Registration deadline is parsed in the browser's timezone and only evaluated at render, so it is not the Madrid deadline and an open tab can submit after it
- src/pages/Tournaments.jsx ~L62: Public tournament list ignores config.registrationClosed, showing 'Inscripción abierta' and an 'Inscribirse' button after the admin closed registrations manually
- src/pages/Tournaments.jsx ~L214: El plazo mostrado omite la hora límite y se calcula en la zona horaria del navegador del visitante
- supabase/migrations/20260421110000_tournaments_public_read.sql ~L11: tournaments.config (with manual participants' names, availability and shirt sizes) is world-readable for every status, including drafts
