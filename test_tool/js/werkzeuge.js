"use strict";
// test_tool: werkzeuge.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Tools: firmware version check, settings backup, servo limits, link check,
// record and replay, flashing. Each tool window works with the board kind it
// needs (glove or robot hand), whichever of the two connected boards that is.
// ===========================================================================
Object.assign(TEXTS.en, {
  werkzeugLeiste: "Tools",
  aufnahme: "● Record & replay", aufnahmeTitel: "Record a glove session and play it back to the robot hand or the 3D view",
  aufnahmeFenster: "Record and replay",
  linktest: "Link check", linktestTitel: "Measure lost rounds, resends, round trip time and signal strength between glove and robot hand",
  grenzen: "Servo limits", grenzenTitel: "Set each servo's open and closed angle with sliders and save them on the robot hand",
  flashen: "Flash firmware", flashenTitel: "Put a new firmware on a board right from the browser, without the Arduino IDE",
  fw: v => `firmware ${v}`, fwFehlt: "firmware unknown",
  // version check
  v_fehlt: (name, want) => `${name} doesn't report its firmware version, so it runs firmware older than ${want}. Servo limits, link check and replay over the radio need the new firmware.`,
  v_alt: (name, have, want) => `${name} runs firmware ${have}, this page expects ${want} or newer.`,
  v_json: name => `${name} still sends the old JSON radio messages. Glove and robot hand only understand each other with the same protocol.`,
  v_protokoll: (a, pa, b, pb) => `${a} speaks radio protocol ${pa}, ${b} protocol ${pb}: they can't understand each other. Flash both with the newest firmware.`,
  v_rolle: (name, role) => `The board was detected as ${name}, but its firmware says it is the ${role}.`,
  rolle_glove: "sensor glove", rolle_hand: "robot hand", rolle_sim: "robot simulator", rolle_bridge: "test bridge",
  // record and replay
  a_text: "Records the glove's calibrated finger values (with only the robot hand connected: the values it receives). Saved as a file, a recording can be played back to the 3D view, to the robot hand over USB, or over the real radio through the glove.",
  a_starten: "● Start recording", a_stoppen: "■ Stop recording",
  a_quelleGlove: "Source: sensor glove", a_quelleHand: "Source: values the robot hand receives", a_quelleDemo: "Source: demo",
  a_keineQuelle: "Connect the glove (or the robot hand) or start the demo to record.",
  a_info: (dauer, n, keys) => `Recording: ${dauer}, ${n} frames, ${keys}`, a_leer: "No recording yet.",
  a_speichern: "Save as file", a_laden: "Open file…",
  a_ziel: "Play to", a_zielAnsicht: "3D view only", a_zielHand: "Robot hand (USB)", a_zielFunk: "Robot hand over radio (glove)",
  a_tempo: "Speed", a_schleife: "Loop", a_position: "Position",
  a_abspielen: "▶ Play", a_pause: "❚❚ Pause", a_stopp: "■ Stop",
  a_fehlerDatei: "This file is not a recording from this page.",
  a_geladen: name => `Opened ${name}.`,
  a_zielFehlt_glove: "Connect the glove for this.", a_zielFehlt_hand: "Connect the robot hand for this.",
  a_altFw: "The glove needs firmware 2.0 or newer for playback over the radio (command p).",
  a_hinweisHand: "The robot hand is in “Manual” while it plays or is paused; it holds the paused position. After Stop the glove gets control back.",
  a_hinweisFunk: "The glove sends the recording instead of its sensors, also the held position while paused. Half a second after Stop the sensors take over again.",
  a_hinweisAnsicht: "Only the 3D view moves; nothing is sent to a board.",
  // link check
  l_text: "The glove counts every radio round and reports once per second: lost rounds, resent messages, the time from sending a message to its ACK, and how strong the robot hand's signal arrives. With the robot hand connected too, its side is measured as well.",
  l_dauer: "Duration", l_offen: "until stopped (range test)",
  l_start: "Start", l_stopp: "Stop",
  l_csv: "Save as CSV",
  l_keinHs: "Connect the glove (or start the demo). The link check measures on the glove.",
  l_altFw: "The glove doesn't answer the link check. It needs firmware 2.0 or newer (command L).",
  l_nurHand: "Only the robot hand is connected: you see its signal strength and how many DATA messages arrive. Connect the glove as well for the full check.",
  l_wartet: "Waiting for the first measurement…",
  l_laeuft: "Measuring…",
  l_k_durchlaeufe: "Rounds / s", l_k_verloren: "Lost rounds", l_k_wiederholt: "Resent", l_k_rtt: "Round trip", l_k_rttMax: "Round trip max",
  l_k_signalHs: "Signal at glove", l_k_signalHand: "Signal at hand", l_k_daten: "DATA at hand / s",
  l_legende: "Blue: round trip (ms, left). Green: signal at the glove, orange: at the robot hand (dBm, right; higher is better). Red marks: lost rounds.",
  l_reichweite: "Range test:", l_markeName: "Name of the position", l_markieren: "Mark position",
  l_markierenTitel: "Stores the average of the last 5 seconds under this name, e.g. the distance",
  l_ort: "Position", l_signalHs: "Glove dBm", l_signalHand: "Hand dBm", l_durchlaeufe: "Rounds ok", l_wiederholt: "Resent", l_rtt: "Round trip",
  l_urteilGut: (n, ok) => `Very good: ${ok} of ${n} rounds arrived, hardly anything had to be resent.`,
  l_urteilOk: (n, ok) => `Usable: ${ok} of ${n} rounds arrived, but some messages had to be resent. Move the boards closer or turn the antennas towards each other.`,
  l_urteilSchlecht: (n, ok) => `Poor: only ${ok} of ${n} rounds arrived. Check the distance, the radio channel and the partner MAC.`,
  l_keineDaten: "No measurement arrived. Is the glove running and the radio switched on?",
  sig_stark: "strong", sig_gut: "good", sig_schwach: "weak", sig_sehrSchwach: "very weak",
  // pin assignment (js/pins.js)
  pins: "Pins", pinsTitel: "Which pin each sensor (glove) or HW-170 channel each servo (robot hand) is on. Saved on the board.",
  p_textGlove: analog => `GPIO pin of each flex sensor, "-" = not connected. Only analog pins work while the radio is on${analog ? `: ${analog}` : ""}. Saving restarts the glove; recalibrate the sensors you moved.`,
  p_textHand: () => `Channel 0..15 on the HW-170 servo driver for each servo ("-" = not connected), and the I2C pins SDA/SCL of the ESP32. Saving restarts the robot hand.`,
  p_keinBoard: "Connect the glove or the robot hand (or start one of their demos).",
  p_altFw: "This board doesn't report its pins yet. It needs glove firmware 2.3 / robot hand firmware 2.4 (Flash firmware).",
  p_wartet: "Asking the board for its pins…",
  p_standard: "from config.h", p_gespeichert: "saved on the board", p_geaendert: "changed, not saved yet",
  p_ungueltig: (device, k) => device === "glove" ? "a GPIO number or -" : isI2c(k) ? "a GPIO number" : "0..15 or -",
  p_speichern: "Save and restart", p_alleStandard: "All back to config.h", p_alleStandardTitel: "Removes the saved pins; the board restarts with the pins from config.h",
  p_neustart: "The board saves the pins and restarts. Continue?",
  // servo limits
  g_text: "For each servo: the angle at “open” (value 0) and at “closed” (value 1). While “Move along” is on, the servo follows the slider so you can see where the finger stops. Save writes the limits into the robot hand; they also apply to the collision protection.",
  g_folgen: "Move the servo along with the slider",
  g_offen: "Open", g_zu: "Closed",
  g_fahreOffen: "Go to open", g_fahreZu: "Go to closed", g_richtung: "Reversed", g_standard: "Default",
  g_richtungTitel: "Direction of the servo. Switch it when the finger runs the wrong way: it swaps the open and the closed angle. Save keeps it on the robot hand.",
  g_standardTitel: "Back to the angles in config.h",
  g_speichern: "Save", g_alleSpeichern: "Save all changes",
  g_jetzt: deg => `now ${deg}°`, g_konfig: "from config.h", g_gespeichert: "saved on the robot hand",
  g_keineHand: "Connect the robot hand (or start the robot hand demo).",
  g_altFw: "The robot hand doesn't report its limits. It needs firmware 2.0 or newer (command g).",
  g_wartet: "Asking the robot hand for its limits…",
  g_ok: name => `${name}: saved.`,
  g_tempo: "Speed", g_tempoMax: "max.",
  g_tempoText: "Top speed of every servo. Slower is gentler on fingers and tendons; the collision protection and catching up after an obstacle use it too.",
  g_tempoStandardTitel: "Back to the speed in config.h (300 °/s)",
  g_tempoAltFw: "The robot hand doesn't report its speed. It needs firmware 2.1 or newer (command b).",
  g_tempoWartet: "Asking the robot hand for its speed…",
  g_tempoOk: "Speed saved.",
  s_tempo: "servo speed",
  // settings backup
  s_kalib: n => `calibration of ${n} sensor${n === 1 ? "" : "s"}`, s_grenzen: n => `limits of ${n} servo${n === 1 ? "" : "s"}`,
  s_partner: "radio partner",
  s_wiederhergestellt: what => `Settings restored: ${what}.`,
  // flashing
  f_linkHs: "Glove and simulator firmware ↗", f_linkHand: "Robot hand firmware ↗", f_linkBridge: "Test bridge firmware ↗",
  f_ablage: "Drop a .bin file here or click to choose",
  f_ziel: "Board:", f_andere: "Another board (choose port)…",
  f_start: "Flash", f_laeuft: "Flashing…",
  f_keinSerial: "Flashing needs Chrome or Edge (Web Serial).",
  f_infoApp: (name, v, b, kb) => `${name} ${v}${b ? ", build " + b : ""} · program only, ${kb} KB · calibration and settings stay`,
  f_infoVoll: (name, v, b, kb) => `${name} ${v}${b ? ", build " + b : ""} · full image, ${kb} KB · erases the saved settings`,
  f_unbekannt: "unknown firmware",
  f_keinBild: "This is not an ESP32 firmware file (.bin from the release or from Arduino “Export compiled binary”).",
  f_falscherChip: id => `This file is for another chip (chip id ${id} in the image). The page flashes the ESP32-C6 and the classic ESP32 only.`,
  f_rolleFalsch: (file, board) => `Careful: the file is ${file} firmware, but the board is the ${board}.`,
  f_vollWarnung: "The full image erases calibration, servo limits and the radio partner.",
  f_sicherung: what => `Back up and restore afterwards: ${what}`,
  f_ladeEsptool: "Loading the flash tool (esptool-js, needs internet once)…",
  f_esptoolFehlt: "The flash tool could not be loaded. Is there an internet connection?",
  f_verbinde: "Connecting to the bootloader. If it hangs: hold BOOT, press RESET (EN), release BOOT.",
  f_chip: (label, desc) => `Found ${label}: ${desc}.`,
  f_chipKlassisch: "ESP32 (classic)", f_chipId: id => `chip id ${id}`,
  f_chipNicht: desc => `Found ${desc}. The page flashes the ESP32-C6 and the classic ESP32 only. Nothing was written.`,
  f_chipFalsch: (file, fileChip, boardChip) => `${file} is for the ${fileChip}, but the board has an ${boardChip}. Nothing was written.`,
  f_chipUmgestellt: variant => `Board type is now ${variant}: click Flash again.`,
  f_schreibe: pct => `Writing… ${pct} %`,
  f_neustart: "Done. Restarting the board and connecting again…",
  f_fertig: "Flashed. The board is connected again.",
  f_fertigOhne: "Flashed. Click Connect to open the board again.",
  f_fehler: msg => `Flashing failed: ${msg}`,
  f_log: "Log", f_logStufe: "Detail", f_logNormal: "normal", f_logDebug: "verbose (esptool debug)", f_logTrace: "everything (serial traffic)",
  f_logKopieren: "Copy", f_logSpeichern: "Save", f_logLeeren: "Clear", f_logZeilen: n => `(${n} lines)`,
  f_logDatei: name => `File: ${name}`, f_logZiel: (name, vid, pid) => `Board: ${name}${vid ? `, USB ${vid}:${pid}` : ""}`,
  f_logGeschrieben: (s, kb) => `Written in ${s} s (${kb} KB).`,
  f_logNochmal: "The board dropped out again right after connecting, connecting once more…",
  f_logWiederhergestellt: cmds => `Sent back: ${cmds}`,
  // firmware from GitHub
  gh_titel: "Firmware from GitHub", gh_anmelden: "Log in with GitHub", gh_abmelden: "Log out", gh_aktualisieren: "Refresh",
  gh_wer: login => `logged in as ${login}`,
  gh_erklaerung: "The firmware repos are private, so the page needs a GitHub <b>access token</b> to download from them (a web page on its own can't do GitHub's normal login). Create one once with <b>read access to the repo contents</b>, paste it here, and the page loads the newest firmware by itself. The token stays in this browser and is only sent to api.github.com.",
  gh_tokenLink: "1. Create a read-only token ↗", gh_tokenKlassisch: "or a classic token, if the organization doesn't allow the new kind ↗",
  gh_tokenFeld: "2. Paste the token (github_pat_… or ghp_…)", gh_merken: "Remember on this computer", gh_einloggen: "Log in",
  gh_pruefe: "Checking the token…", gh_ungueltig: "GitHub doesn't accept this token (mistyped, expired or revoked).",
  gh_suche: "Looking for firmware…",
  gh_keinBranch: repo => `${repo}: nothing found. Either the token has no access to this repo, or GitHub hasn't built main since the download was added (tab Actions).`,
  gh_fehler: msg => `GitHub: ${msg}`, gh_netz: "no connection to api.github.com", gh_limit: "too many requests, try again in a minute",
  gh_vonHand: "Or download by hand:",
  // Flash firmware window (formerly flash.html)
  fl_unter: "See whether a board runs the newest build from GitHub and update it, without the Arduino IDE.",
  fl_vergleich: "Build on the board compared with GitHub", fl_aufBoard: "On the board", fl_aufGh: "Newest on GitHub",
  fl_keinBoard: "Pick a connected board to compare.", fl_keinGh: "Log in with GitHub to compare.",
  fl_warte: "Asking the board…", fl_gleich: "Same build. Nothing to flash.",
  fl_hinten: n => `GitHub is ${n} commit${n === 1 ? "" : "s"} ahead. Flash to update.`,
  fl_vorn: n => `The board is ${n} commit${n === 1 ? "" : "s"} newer than main.`,
  fl_anders: "A different build than on GitHub.", fl_vergleiche: "Comparing…",
  fl_lokal: "Flashed from the Arduino IDE (build “local”), so it can't be compared.",
  fl_ohneVersion: "The board doesn't say its version. Flash it to bring it up to date.",
  fl_keinFw: kind => `GitHub has no firmware for this yet: ${kind}.`,
  fl_board: "Board", fl_verbinden: "Connect board",
  fl_neuText: "The port is picked when you click Flash. Or connect the board first to see what is on it.",
  fl_fw: "Firmware", fl_einst: "Settings", fl_keine: "none reported", fl_unbekannt: "Unknown board", fl_frage: "asking…",
  fl_fwText: (v, p) => `${v}, radio protocol ${p}`, fl_fwAlt: "older than 2.0 (no version line)",
  fl_stumm: "No answer from the board. Common reasons: a Beetle with a GitHub build from before 11 Nov 2026 (USB CDC On Boot was off), a DevKitC-1 on the “USB” socket, or a new board. Pick below what it should become and flash it.",
  fl_bridge: "Test bridge",
  fl_ghAus: "Log in once to see the newest builds and download them here.",
  fl_build: (build, date) => `build ${build || "?"}${date ? " · " + date : ""}`,
  fl_repo_ansteuerung_Gruppe1: "Glove and simulator", fl_repo_ansteuerung_hand: "Robot hand", fl_repo_tools: "Test bridge",
  fl_als: "Flash as", fl_variante: "Board type", fl_varianteTipp: "DevKitC-1: plug it into the socket marked UART. ESP32 DevKit: the classic ESP32 (WROOM-32, CP2102), glove and simulator only.",
  fl_varianteNicht: chip => `Not for this board: it has an ${chip}.`,
  fl_chip: "Chip", fl_chipSpaeter: "known after the first Flash (read from the bootloader)", fl_chipUsb: chip => `${chip} (from its USB id)`,
  fl_keinEsp32: kind => `${kind}: built for the ESP32-C6 only (Beetle, DevKitC-1). There is no firmware for the classic ESP32.`,
  fl_planChip: (chip, addr) => `For the ${chip}, written from 0x${addr}.`,
  fl_chipFremd: desc => `This board has an ${desc}. The page flashes the ESP32-C6 and the classic ESP32 only.`,
  fl_art: "What to write", fl_app: "Program only", fl_full: "Full image",
  fl_appTipp: "Keeps calibration, servo limits and radio partner.", fl_fullTipp: "For a new or broken board. Erases the saved settings.",
  fl_eigene: "Use a .bin file from this computer instead", fl_eigeneWeg: "Use GitHub again",
  fl_planGh: (name, build, kb) => `Writes ${name} from GitHub (build ${build || "?"}, ${kb} KB).`,
  fl_planDatei: (name, what) => `Writes ${name}: ${what}.`,
  fl_planOhne: "Log in with GitHub or choose a .bin file.",
  fl_planNeu: "You pick the board's port when you click Flash.",
  fl_startName: name => `Flash ${name}`,
  gh_lade: (name, pct) => `Downloading ${name}… ${pct} %`,
  // calibration improvements
  k_auswahl: "Sensors to calibrate (the others keep their calibration):",
  k_alt: "Before", k_rauschen: "Noise",
  k_wiederherstellen: "Restore saved calibration",
  k_wiederherstellenTitel: "Sends the calibration this page last read from this glove (e.g. after a full flash)",
  k_gesichert: when => `Saved on this computer ${when}`,
  u_rauschen: names => `${names} is noisy while resting. Check the wiring and the solder joints.`,
  // serial command table
  befehle: "Commands", befehleTitel: "What each serial command does on the board that is shown",
  b_titel: board => `Serial commands: ${board}`,
  b_text: "Type them in the serial monitor's input and press Enter. Click a row to put the command into the input (it is not sent yet). The examples are examples: change the finger, value or MAC.",
  b_befehl: "Command", b_wirkung: "What it does", b_zeileTitel: "Put into the serial monitor's input",
  b_steuern: "Control", b_einstellen: "Settings (saved on the board)", b_ausgabe: "Output in the log",
  b_quelle_hand: "From roboter_hand.ino (repo ansteuerung_hand). Fingers: F0 thumb flex, S0 thumb opposition, F1 index … F4 little finger.",
  b_quelle_glove: "The commands this page uses. The full list is at the top of sensor_glove.ino (repo ansteuerung_Gruppe1).",
  b_quelle_sim: "The commands this page uses. The full list is at the top of the simulator's .ino (repo ansteuerung_Gruppe1, tools/robot_simulator).",
  b_quelle_bglove: "From bridge.ino (repo tools). The test board is playing the glove.",
  b_quelle_bhand: "From bridge.ino (repo tools). The test board is playing the robot hand.",
});

Object.assign(TEXTS.de, {
  werkzeugLeiste: "Werkzeuge",
  aufnahme: "● Aufnehmen & Abspielen", aufnahmeTitel: "Eine Handschuh-Sitzung aufnehmen und an die Roboterhand oder die 3D-Ansicht abspielen",
  aufnahmeFenster: "Aufnehmen und abspielen",
  linktest: "Linktest", linktestTitel: "Verlorene Durchläufe, Wiederholungen, Antwortzeit und Signalstärke zwischen Handschuh und Roboterhand messen",
  grenzen: "Servogrenzen", grenzenTitel: "Winkel bei offen und zu für jeden Servo mit Reglern einstellen und in der Roboterhand speichern",
  flashen: "Firmware flashen", flashenTitel: "Neue Firmware direkt aus dem Browser aufspielen, ohne Arduino IDE",
  fw: v => `Firmware ${v}`, fwFehlt: "Firmware unbekannt",
  v_fehlt: (name, want) => `${name} meldet keine Firmware-Version, hat also Firmware älter als ${want}. Servogrenzen, Linktest und Abspielen über Funk brauchen die neue Firmware.`,
  v_alt: (name, have, want) => `${name} hat Firmware ${have}, diese Seite erwartet ${want} oder neuer.`,
  v_json: name => `${name} schickt noch die alten JSON-Funknachrichten. Handschuh und Roboterhand verstehen sich nur mit demselben Protokoll.`,
  v_protokoll: (a, pa, b, pb) => `${a} spricht Funkprotokoll ${pa}, ${b} Protokoll ${pb}: Die beiden verstehen sich nicht. Beide mit der neuesten Firmware flashen.`,
  v_rolle: (name, role) => `Das Board wurde als ${name} erkannt, laut Firmware ist es aber ${role}.`,
  rolle_glove: "der Sensorhandschuh", rolle_hand: "die Roboterhand", rolle_sim: "der Roboter-Simulator", rolle_bridge: "die Testbrücke",
  a_text: "Nimmt die kalibrierten Fingerwerte des Handschuhs auf (ist nur die Roboterhand verbunden: die Werte, die bei ihr ankommen). Als Datei gespeichert lässt sich eine Aufnahme in der 3D-Ansicht, über USB an der Roboterhand oder über den echten Funk durch den Handschuh abspielen.",
  a_starten: "● Aufnahme starten", a_stoppen: "■ Aufnahme beenden",
  a_quelleGlove: "Quelle: Sensorhandschuh", a_quelleHand: "Quelle: Werte, die bei der Roboterhand ankommen", a_quelleDemo: "Quelle: Demo",
  a_keineQuelle: "Zum Aufnehmen den Handschuh (oder die Roboterhand) verbinden oder die Demo starten.",
  a_info: (dauer, n, keys) => `Aufnahme: ${dauer}, ${n} Bilder, ${keys}`, a_leer: "Noch keine Aufnahme.",
  a_speichern: "Als Datei speichern", a_laden: "Datei öffnen…",
  a_ziel: "Abspielen an", a_zielAnsicht: "nur 3D-Ansicht", a_zielHand: "Roboterhand (USB)", a_zielFunk: "Roboterhand über Funk (Handschuh)",
  a_tempo: "Tempo", a_schleife: "Schleife", a_position: "Position",
  a_abspielen: "▶ Abspielen", a_pause: "❚❚ Pause", a_stopp: "■ Stopp",
  a_fehlerDatei: "Diese Datei ist keine Aufnahme dieser Seite.",
  a_geladen: name => `${name} geöffnet.`,
  a_zielFehlt_glove: "Dafür den Handschuh verbinden.", a_zielFehlt_hand: "Dafür die Roboterhand verbinden.",
  a_altFw: "Zum Abspielen über Funk braucht der Handschuh Firmware 2.0 oder neuer (Befehl p).",
  a_hinweisHand: "Die Roboterhand steht beim Abspielen und bei Pause auf „Von Hand“ und hält bei Pause die Stellung. Nach Stopp bekommt der Handschuh die Steuerung zurück.",
  a_hinweisFunk: "Der Handschuh sendet die Aufnahme statt seiner Sensoren, bei Pause die gehaltene Stellung. Eine halbe Sekunde nach Stopp übernehmen wieder die Sensoren.",
  a_hinweisAnsicht: "Nur die 3D-Ansicht bewegt sich, an kein Board wird etwas geschickt.",
  l_text: "Der Handschuh zählt jeden Funk-Durchlauf und meldet einmal pro Sekunde: verlorene Durchläufe, wiederholte Nachrichten, die Zeit vom Senden bis zum ACK und wie stark das Signal der Roboterhand ankommt. Ist die Roboterhand auch verbunden, wird ihre Seite mitgemessen.",
  l_dauer: "Dauer", l_offen: "bis Stopp (Reichweitentest)",
  l_start: "Start", l_stopp: "Stopp",
  l_csv: "Als CSV speichern",
  l_keinHs: "Den Handschuh verbinden (oder die Demo starten). Der Linktest misst am Handschuh.",
  l_altFw: "Der Handschuh antwortet nicht auf den Linktest. Er braucht Firmware 2.0 oder neuer (Befehl L).",
  l_nurHand: "Nur die Roboterhand ist verbunden: Du siehst ihre Signalstärke und wie viele DATA ankommen. Für den ganzen Test auch den Handschuh verbinden.",
  l_wartet: "Warte auf die erste Messung…",
  l_laeuft: "Misst…",
  l_k_durchlaeufe: "Durchläufe / s", l_k_verloren: "Verloren", l_k_wiederholt: "Wiederholt", l_k_rtt: "Antwortzeit", l_k_rttMax: "Antwortzeit max",
  l_k_signalHs: "Signal am Handschuh", l_k_signalHand: "Signal an der Hand", l_k_daten: "DATA an der Hand / s",
  l_legende: "Blau: Antwortzeit (ms, links). Grün: Signal am Handschuh, orange: an der Roboterhand (dBm, rechts; höher ist besser). Rote Striche: verlorene Durchläufe.",
  l_reichweite: "Reichweitentest:", l_markeName: "Name der Position", l_markieren: "Position merken",
  l_markierenTitel: "Speichert den Mittelwert der letzten 5 Sekunden unter diesem Namen, z. B. dem Abstand",
  l_ort: "Position", l_signalHs: "Handschuh dBm", l_signalHand: "Hand dBm", l_durchlaeufe: "Durchläufe ok", l_wiederholt: "Wiederholt", l_rtt: "Antwortzeit",
  l_urteilGut: (n, ok) => `Sehr gut: ${ok} von ${n} Durchläufen kamen an, kaum etwas musste wiederholt werden.`,
  l_urteilOk: (n, ok) => `Brauchbar: ${ok} von ${n} Durchläufen kamen an, aber einige Nachrichten mussten wiederholt werden. Boards näher zusammen oder Antennen zueinander drehen.`,
  l_urteilSchlecht: (n, ok) => `Schlecht: nur ${ok} von ${n} Durchläufen kamen an. Abstand, Funkkanal und Partner-MAC prüfen.`,
  l_keineDaten: "Keine Messung angekommen. Läuft der Handschuh und ist der Funk an?",
  sig_stark: "stark", sig_gut: "gut", sig_schwach: "schwach", sig_sehrSchwach: "sehr schwach",
  pins: "Pins", pinsTitel: "An welchem Pin jeder Sensor (Handschuh) bzw. an welchem HW-170-Kanal jeder Servo (Roboterhand) hängt. Wird im Board gespeichert.",
  p_textGlove: analog => `GPIO-Pin jedes Biegesensors, „-“ = nicht angeschlossen. Bei eingeschaltetem Funk gehen nur Analog-Pins${analog ? `: ${analog}` : ""}. Speichern startet den Handschuh neu; umgesteckte Sensoren neu kalibrieren.`,
  p_textHand: () => `Kanal 0..15 am Servotreiber HW-170 für jeden Servo („-“ = nicht angeschlossen) und die I2C-Pins SDA/SCL des ESP32. Speichern startet die Roboterhand neu.`,
  p_keinBoard: "Handschuh oder Roboterhand verbinden (oder eine ihrer Demos starten).",
  p_altFw: "Dieses Board meldet seine Pins noch nicht. Es braucht Handschuh-Firmware 2.3 / Roboterhand-Firmware 2.4 (Firmware flashen).",
  p_wartet: "Frage das Board nach seinen Pins…",
  p_standard: "aus config.h", p_gespeichert: "im Board gespeichert", p_geaendert: "geändert, noch nicht gespeichert",
  p_ungueltig: (device, k) => device === "glove" ? "GPIO-Nummer oder -" : isI2c(k) ? "GPIO-Nummer" : "0..15 oder -",
  p_speichern: "Speichern und neu starten", p_alleStandard: "Alle zurück auf config.h", p_alleStandardTitel: "Löscht die gespeicherten Pins; das Board startet mit den Pins aus config.h neu",
  p_neustart: "Das Board speichert die Pins und startet neu. Weiter?",
  g_text: "Für jeden Servo: der Winkel bei „offen“ (Wert 0) und bei „zu“ (Wert 1). Solange „Servo mitfahren“ an ist, folgt der Servo dem Regler, so siehst du, wo der Finger anschlägt. Speichern schreibt die Grenzen in die Roboterhand; sie gelten auch für den Kollisionsschutz.",
  g_folgen: "Servo mit dem Regler mitfahren",
  g_offen: "Offen", g_zu: "Zu",
  g_fahreOffen: "Auf offen", g_fahreZu: "Auf zu", g_richtung: "Umgekehrt", g_standard: "Standard",
  g_richtungTitel: "Drehrichtung des Servos. Umschalten, wenn der Finger falsch herum läuft: tauscht den Winkel bei offen und bei zu. Speichern behält es in der Roboterhand.",
  g_standardTitel: "Zurück auf die Winkel aus config.h",
  g_speichern: "Speichern", g_alleSpeichern: "Alle Änderungen speichern",
  g_jetzt: deg => `jetzt ${deg}°`, g_konfig: "aus config.h", g_gespeichert: "in der Roboterhand gespeichert",
  g_keineHand: "Die Roboterhand verbinden (oder die Roboterhand-Demo starten).",
  g_altFw: "Die Roboterhand meldet keine Grenzen. Sie braucht Firmware 2.0 oder neuer (Befehl g).",
  g_wartet: "Frage die Roboterhand nach ihren Grenzen…",
  g_ok: name => `${name}: gespeichert.`,
  g_tempo: "Tempo", g_tempoMax: "max.",
  g_tempoText: "Höchsttempo aller Servos. Langsamer schont Finger und Sehnen; der Kollisionsschutz und das Aufholen nach einem Hindernis halten sich auch daran.",
  g_tempoStandardTitel: "Zurück auf das Tempo aus config.h (300 °/s)",
  g_tempoAltFw: "Die Roboterhand meldet kein Tempo. Sie braucht Firmware 2.1 oder neuer (Befehl b).",
  g_tempoWartet: "Frage die Roboterhand nach ihrem Tempo…",
  g_tempoOk: "Tempo gespeichert.",
  s_tempo: "Servotempo",
  s_kalib: n => `Kalibrierung von ${n} Sensor${n === 1 ? "" : "en"}`, s_grenzen: n => `Grenzen von ${n} Servo${n === 1 ? "" : "s"}`,
  s_partner: "Funk-Partner",
  s_wiederhergestellt: what => `Einstellungen wiederhergestellt: ${what}.`,
  f_linkHs: "Firmware Handschuh und Simulator ↗", f_linkHand: "Firmware Roboterhand ↗", f_linkBridge: "Firmware Testbrücke ↗",
  f_ablage: ".bin-Datei hierher ziehen oder klicken zum Auswählen",
  f_ziel: "Board:", f_andere: "Anderes Board (Port wählen)…",
  f_start: "Flashen", f_laeuft: "Flasht…",
  f_keinSerial: "Zum Flashen braucht es Chrome oder Edge (Web Serial).",
  f_infoApp: (name, v, b, kb) => `${name} ${v}${b ? ", Build " + b : ""} · nur Programm, ${kb} KB · Kalibrierung und Einstellungen bleiben`,
  f_infoVoll: (name, v, b, kb) => `${name} ${v}${b ? ", Build " + b : ""} · komplettes Abbild, ${kb} KB · löscht die gespeicherten Einstellungen`,
  f_unbekannt: "unbekannte Firmware",
  f_keinBild: "Das ist keine ESP32-Firmware (.bin aus dem Release oder aus Arduino „Kompilierte Binärdatei exportieren“).",
  f_falscherChip: id => `Diese Datei ist für einen anderen Chip (Chip-ID ${id} im Abbild). Die Seite flasht nur den ESP32-C6 und den klassischen ESP32.`,
  f_rolleFalsch: (file, board) => `Achtung: Die Datei ist Firmware für ${file}, das Board ist aber ${board}.`,
  f_vollWarnung: "Das komplette Abbild löscht Kalibrierung, Servogrenzen und Funk-Partner.",
  f_sicherung: what => `Vorher sichern und danach wiederherstellen: ${what}`,
  f_ladeEsptool: "Lade das Flash-Werkzeug (esptool-js, braucht einmal Internet)…",
  f_esptoolFehlt: "Das Flash-Werkzeug ließ sich nicht laden. Gibt es eine Internetverbindung?",
  f_verbinde: "Verbinde mit dem Bootloader. Hängt es: BOOT halten, RESET (EN) drücken, BOOT loslassen.",
  f_chip: (label, desc) => `${label} gefunden: ${desc}.`,
  f_chipKlassisch: "ESP32 (klassisch)", f_chipId: id => `Chip-ID ${id}`,
  f_chipNicht: desc => `${desc} gefunden. Die Seite flasht nur den ESP32-C6 und den klassischen ESP32. Nichts wurde geschrieben.`,
  f_chipFalsch: (file, fileChip, boardChip) => `${file} ist für den ${fileChip}, das Board hat aber einen ${boardChip}. Nichts wurde geschrieben.`,
  f_chipUmgestellt: variant => `Board-Typ ist jetzt ${variant}: noch einmal auf Flashen klicken.`,
  f_schreibe: pct => `Schreibe… ${pct} %`,
  f_neustart: "Fertig. Board startet neu, verbinde wieder…",
  f_fertig: "Geflasht. Das Board ist wieder verbunden.",
  f_fertigOhne: "Geflasht. Mit Verbinden das Board wieder öffnen.",
  f_fehler: msg => `Flashen fehlgeschlagen: ${msg}`,
  f_log: "Protokoll", f_logStufe: "Umfang", f_logNormal: "normal", f_logDebug: "ausführlich (esptool-Debug)", f_logTrace: "alles (serieller Verkehr)",
  f_logKopieren: "Kopieren", f_logSpeichern: "Speichern", f_logLeeren: "Leeren", f_logZeilen: n => `(${n} Zeilen)`,
  f_logDatei: name => `Datei: ${name}`, f_logZiel: (name, vid, pid) => `Board: ${name}${vid ? `, USB ${vid}:${pid}` : ""}`,
  f_logGeschrieben: (s, kb) => `Geschrieben in ${s} s (${kb} KB).`,
  f_logNochmal: "Das Board war gleich nach dem Verbinden wieder weg, verbinde noch einmal…",
  f_logWiederhergestellt: cmds => `Zurückgeschickt: ${cmds}`,
  gh_titel: "Firmware von GitHub", gh_anmelden: "Mit GitHub anmelden", gh_abmelden: "Abmelden", gh_aktualisieren: "Neu laden",
  gh_wer: login => `angemeldet als ${login}`,
  gh_erklaerung: "Die Firmware-Repos sind privat, deshalb braucht die Seite ein GitHub-<b>Zugriffstoken</b> zum Herunterladen (die normale GitHub-Anmeldung geht mit einer Webseite allein nicht). Einmal eines mit <b>Lesezugriff auf den Repo-Inhalt</b> erstellen, hier einfügen, dann lädt die Seite die neueste Firmware selbst. Das Token bleibt in diesem Browser und geht nur an api.github.com.",
  gh_tokenLink: "1. Token nur zum Lesen erstellen ↗", gh_tokenKlassisch: "oder ein klassisches Token, falls die Organisation die neue Art nicht erlaubt ↗",
  gh_tokenFeld: "2. Token einfügen (github_pat_… oder ghp_…)", gh_merken: "Auf diesem Computer merken", gh_einloggen: "Anmelden",
  gh_pruefe: "Token wird geprüft…", gh_ungueltig: "GitHub nimmt dieses Token nicht an (vertippt, abgelaufen oder widerrufen).",
  gh_suche: "Suche Firmware…",
  gh_keinBranch: repo => `${repo}: nichts gefunden. Entweder hat das Token keinen Zugriff auf dieses Repo, oder GitHub hat main seit dem Einbau noch nicht gebaut (Reiter Actions).`,
  gh_fehler: msg => `GitHub: ${msg}`, gh_netz: "keine Verbindung zu api.github.com", gh_limit: "zu viele Anfragen, in einer Minute nochmal versuchen",
  gh_vonHand: "Oder von Hand herunterladen:",
  // Fenster Firmware flashen (früher flash.html)
  fl_unter: "Sehen, ob ein Board den neuesten Build von GitHub hat, und es aktualisieren, ohne Arduino IDE.",
  fl_vergleich: "Build auf dem Board im Vergleich zu GitHub", fl_aufBoard: "Auf dem Board", fl_aufGh: "Neuester auf GitHub",
  fl_keinBoard: "Ein verbundenes Board wählen, um zu vergleichen.", fl_keinGh: "Mit GitHub anmelden, um zu vergleichen.",
  fl_warte: "Frage das Board…", fl_gleich: "Gleicher Build. Nichts zu flashen.",
  fl_hinten: n => `GitHub ist ${n} Commit${n === 1 ? "" : "s"} weiter. Flashen zum Aktualisieren.`,
  fl_vorn: n => `Das Board ist ${n} Commit${n === 1 ? "" : "s"} neuer als main.`,
  fl_anders: "Ein anderer Build als auf GitHub.", fl_vergleiche: "Vergleiche…",
  fl_lokal: "Mit der Arduino IDE geflasht (Build „local“), daher kein Vergleich.",
  fl_ohneVersion: "Das Board nennt seine Version nicht. Flashen bringt es auf den neuesten Stand.",
  fl_keinFw: kind => `Auf GitHub gibt es dafür noch keine Firmware: ${kind}.`,
  fl_board: "Board", fl_verbinden: "Board verbinden",
  fl_neuText: "Der Port wird beim Klick auf Flashen gewählt. Oder das Board vorher verbinden, um zu sehen, was darauf ist.",
  fl_fw: "Firmware", fl_einst: "Einstellungen", fl_keine: "keine gemeldet", fl_unbekannt: "Unbekanntes Board", fl_frage: "frage…",
  fl_fwText: (v, p) => `${v}, Funkprotokoll ${p}`, fl_fwAlt: "älter als 2.0 (keine Versionszeile)",
  fl_stumm: "Das Board antwortet nicht. Häufige Gründe: ein Beetle mit einem GitHub-Build von vor dem 11.11.2026 (USB CDC On Boot war aus), ein DevKitC-1 an der Buchse „USB“, oder ein neues Board. Unten wählen, was es werden soll, und flashen.",
  fl_bridge: "Testbrücke",
  fl_ghAus: "Einmal anmelden, dann zeigt die Seite die neuesten Builds und lädt sie hier herunter.",
  fl_build: (build, date) => `Build ${build || "?"}${date ? " · " + date : ""}`,
  fl_repo_ansteuerung_Gruppe1: "Handschuh und Simulator", fl_repo_ansteuerung_hand: "Roboterhand", fl_repo_tools: "Testbrücke",
  fl_als: "Flashen als", fl_variante: "Board-Typ", fl_varianteTipp: "DevKitC-1: an der Buchse „UART“ anstecken. ESP32 DevKit: der klassische ESP32 (WROOM-32, CP2102), nur Handschuh und Simulator.",
  fl_varianteNicht: chip => `Passt nicht zu diesem Board: es hat einen ${chip}.`,
  fl_chip: "Chip", fl_chipSpaeter: "bekannt nach dem ersten Flashen (vom Bootloader gelesen)", fl_chipUsb: chip => `${chip} (laut USB-Kennung)`,
  fl_keinEsp32: kind => `${kind}: nur für den ESP32-C6 gebaut (Beetle, DevKitC-1). Für den klassischen ESP32 gibt es keine Firmware.`,
  fl_planChip: (chip, addr) => `Für den ${chip}, geschrieben ab 0x${addr}.`,
  fl_chipFremd: desc => `Dieses Board hat einen ${desc}. Die Seite flasht nur den ESP32-C6 und den klassischen ESP32.`,
  fl_art: "Was geschrieben wird", fl_app: "Nur Programm", fl_full: "Komplettes Abbild",
  fl_appTipp: "Kalibrierung, Servogrenzen und Funk-Partner bleiben.", fl_fullTipp: "Für ein neues oder kaputtes Board. Löscht die gespeicherten Einstellungen.",
  fl_eigene: "Stattdessen eine .bin-Datei von diesem Computer nehmen", fl_eigeneWeg: "Wieder GitHub nehmen",
  fl_planGh: (name, build, kb) => `Schreibt ${name} von GitHub (Build ${build || "?"}, ${kb} KB).`,
  fl_planDatei: (name, what) => `Schreibt ${name}: ${what}.`,
  fl_planOhne: "Mit GitHub anmelden oder eine .bin-Datei wählen.",
  fl_planNeu: "Den Port des Boards wählst du beim Klick auf Flashen.",
  fl_startName: name => `${name} flashen`,
  gh_lade: (name, pct) => `Lade ${name}… ${pct} %`,
  k_auswahl: "Diese Sensoren kalibrieren (die anderen behalten ihre Kalibrierung):",
  k_alt: "Vorher", k_rauschen: "Rauschen",
  k_wiederherstellen: "Gesicherte Kalibrierung zurückspielen",
  k_wiederherstellenTitel: "Schickt die Kalibrierung, die diese Seite zuletzt von diesem Handschuh gelesen hat (z. B. nach einem kompletten Flashen)",
  k_gesichert: when => `Auf diesem Computer gesichert ${when}`,
  u_rauschen: names => `${names} rauscht in Ruhe stark. Verkabelung und Lötstellen prüfen.`,
  // Tabelle der seriellen Befehle
  befehle: "Befehle", befehleTitel: "Was jeder serielle Befehl beim angezeigten Board tut",
  b_titel: board => `Serielle Befehle: ${board}`,
  b_text: "Im Eingabefeld des Seriellen Monitors eintippen und Enter drücken. Ein Klick auf eine Zeile setzt den Befehl ins Eingabefeld (er wird noch nicht gesendet). Die Beispiele sind Beispiele: Finger, Wert oder MAC anpassen.",
  b_befehl: "Befehl", b_wirkung: "Was er tut", b_zeileTitel: "Ins Eingabefeld des Seriellen Monitors setzen",
  b_steuern: "Steuern", b_einstellen: "Einstellungen (im Board gespeichert)", b_ausgabe: "Ausgabe im Log",
  b_quelle_hand: "Aus roboter_hand.ino (Repo ansteuerung_hand). Finger: F0 Daumen einziehen, S0 Daumen opponieren, F1 Zeigefinger … F4 kleiner Finger.",
  b_quelle_glove: "Die Befehle, die diese Seite benutzt. Die vollständige Liste steht oben in sensor_glove.ino (Repo ansteuerung_Gruppe1).",
  b_quelle_sim: "Die Befehle, die diese Seite benutzt. Die vollständige Liste steht oben in der .ino des Simulators (Repo ansteuerung_Gruppe1, tools/robot_simulator).",
  b_quelle_bglove: "Aus bridge.ino (Repo tools). Das Testboard spielt den Handschuh.",
  b_quelle_bhand: "Aus bridge.ino (Repo tools). Das Testboard spielt die Roboterhand.",
});

// ---------------------------------------------------------------------------
// Which board does a tool talk to?
// ---------------------------------------------------------------------------
// The demo plays one board (the one picked at the top left); otherwise the
// connected board of that kind. The simulator counts as glove side for nothing
// here: it neither records link statistics nor plays back.
const boardSelf = device => state.source === "demo" ? (state.device === device ? state : null) : (connOf(device) ?? null);
function sendToDevice(device, text, quiet = true) {
  if (state.source === "demo") {
    if (state.device === device) demoCommand(text);
    return Promise.resolve();
  }
  const c = connOf(device);
  return c ? sendTo(c, text, quiet) : Promise.resolve();
}
const deviceName = device => t("g_" + device);
const fmtTime = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");

// Floating tool windows: open/close with the tool bar button, × closes.
function toggleWindow(id, button, onOpen) {
  const d = $(id);
  if (d.open) { d.close(); return; }
  d.show();
  button?.setAttribute("aria-pressed", "true");
  onOpen?.();
}
for (const d of document.querySelectorAll("dialog.fenster")) {
  d.querySelector(".zu").onclick = () => d.close();
  d.addEventListener("close", () => {
    for (const b of document.querySelectorAll(".leiste button[aria-pressed]")) {
      if (b.dataset.fenster === d.id) b.setAttribute("aria-pressed", "false");
    }
  });
}
$("aufnahmeKnopf").dataset.fenster = "aufnahmeFenster";
$("linkKnopf").dataset.fenster = "linkFenster";
$("grenzenKnopf").dataset.fenster = "grenzenFenster";

// ---------------------------------------------------------------------------
// Serial commands: what each short command does on the board that is shown.
// [command, English, German]; a row with only a group key starts a group.
// Robot hand and test bridge: from the comments at the top of roboter_hand.ino
// and bridge.ino. Glove and simulator (repo ansteuerung_Gruppe1): the commands
// this page uses; the complete list is at the top of their .ino.
// ---------------------------------------------------------------------------
const MAC_EXAMPLE = "58:E6:C5:F8:99:1C";
const COMMANDS = {
  hand: [
    ["b_steuern"],
    ["s F1:0.5 F0:1", "Set fingers by hand, 0 = open … 1 = closed (switches to Manual)", "Finger von Hand setzen, 0 = offen … 1 = zu (schaltet auf „Von Hand“)"],
    ["v", "Manual: the fingers stay where they are until the next s", "Von Hand: die Finger bleiben, bis das nächste s kommt"],
    ["h", "The glove controls the hand again", "Der Handschuh steuert wieder"],
    ["r", "Reset: stops the servo test, clears the slider values, the glove controls again (without a glove the hand goes to rest)", "Reset: Servotest abbrechen, Reglerwerte löschen, Handschuh steuert wieder (ohne Handschuh fährt die Hand in die Ruhestellung)"],
    ["t", "Servo test: all servos 0° → 90° → 180° → rest position", "Servotest: alle Servos 0° → 90° → 180° → Ruhestellung"],
    ["xF1=95", "Move one servo straight to an angle in degrees (switches to Manual; to try out the limits)", "Einen Servo direkt auf einen Winkel fahren, in Grad (schaltet auf „Von Hand“; zum Ausprobieren der Grenzen)"],
    ["b_einstellen"],
    ["gF1=10,170", "Servo limits: angle at open (0) and closed (1), saved on the board", "Servogrenzen: Winkel bei offen (0) und zu (1), wird gespeichert"],
    ["gF1", "This servo's limits back to config.h", "Grenzen dieses Servos zurück auf config.h"],
    ["g", "Show all servo limits", "Alle Servogrenzen anzeigen"],
    ["b150", "Top speed of all servos in degrees per second (10 to 600, saved on the board; firmware 2.1)", "Höchsttempo aller Servos in Grad pro Sekunde (10 bis 600, wird gespeichert; Firmware 2.1)"],
    ["b0", "Servo speed back to config.h (300 °/s)", "Servotempo zurück auf config.h (300 °/s)"],
    ["b", "Show the servo speed", "Servotempo anzeigen"],
    ["m" + MAC_EXAMPLE, "Only listen to this glove (saved)", "Nur auf diesen Handschuh hören (wird gespeichert)"],
    ["KF1=5 SDA=19", "Pin assignment: HW-170 channel of a servo (0..15, - = none), I2C pins SDA/SCL; saved, the hand restarts (firmware 2.4)", "Pinbelegung: HW-170-Kanal eines Servos (0..15, - = keiner), I2C-Pins SDA/SCL; wird gespeichert, die Hand startet neu (Firmware 2.4)"],
    ["Kreset", "All pins back to config.h (restarts); K alone shows them", "Alle Pins zurück auf config.h (startet neu); K allein zeigt sie"],
    ["m", "Any glove may control the hand again (one at a time: the first one stays until it is silent for 1.5 s)", "Wieder jeder Handschuh darf die Hand steuern (immer einer: der erste bleibt, bis er 1,5 s still ist)"],
    ["b_ausgabe"],
    ["i", "Info: firmware, MAC, radio status, servos, limits", "Info: Firmware, MAC, Funkstatus, Servos, Grenzen"],
    ["a", "Received values on/off (for the Arduino serial plotter)", "Empfangene Werte an/aus (für den Seriellen Plotter)"],
    ["A", "Received values on (does not switch off)", "Empfangene Werte an (schaltet nicht aus)"],
    ["w", "Servo angles on/off", "Servowinkel an/aus"],
    ["l", "Radio log on/off: every ESP-NOW message as hex", "Funk-Log an/aus: jede ESP-NOW-Nachricht als Hex"],
    ["U", "Status lines for this page on (the page sends it when connecting)", "Statuszeilen für diese Seite an (schickt die Seite beim Verbinden)"],
  ],
  glove: [
    ["b_steuern"],
    ["k", "Quick calibration on the glove itself (open, fist, thumb); follow the steps in the log", "Kurz-Kalibrierung im Handschuh selbst (offen, Faust, Daumen); den Schritten im Log folgen"],
    ["cIndex=1200,2400", "Store one sensor's calibration: mV straight, mV bent (the calibration wizard sends this)", "Kalibrierung eines Sensors speichern: mV gestreckt, mV gebeugt (schickt der Kalibrier-Assistent)"],
    ["pF1:0.5 F0:1", "Send these values over radio instead of the sensors, for 0.5 s (replay)", "Diese Werte statt der Sensoren funken, für 0,5 s (Abspielen)"],
    ["f", "Radio on/off (diagnosis)", "Funk an/aus (Diagnose)"],
    ["d", "Creep compensation on/off", "Kriechausgleich an/aus"],
    ["b_einstellen"],
    ["m" + MAC_EXAMPLE, "Only talk to this robot hand (saved)", "Nur mit dieser Roboterhand funken (wird gespeichert)"],
    ["m", "Talk to every robot hand (broadcast)", "An alle Roboterhände senden (Broadcast)"],
    ["PF1=34 F2=-", "Pin assignment: GPIO of a sensor (- = not connected); saved, the glove restarts (firmware 2.3)", "Pinbelegung: GPIO eines Sensors (- = nicht angeschlossen); wird gespeichert, der Handschuh startet neu (Firmware 2.3)"],
    ["Preset", "All pins back to config.h (restarts); P alone shows them", "Alle Pins zurück auf config.h (startet neu); P allein zeigt sie"],
    ["b_ausgabe"],
    ["i", "Info: firmware, MAC, calibration, radio partner", "Info: Firmware, MAC, Kalibrierung, Funk-Partner"],
    ["a", "Calibrated values 0..1 on/off", "Kalibrierte Werte 0..1 an/aus"],
    ["A", "Calibrated values on (does not switch off; the page sends AR when connecting)", "Kalibrierte Werte an (schaltet nicht aus; die Seite schickt beim Verbinden AR)"],
    ["r", "Raw values (mV) on/off", "Rohwerte (mV) an/aus"],
    ["R", "Raw values on (does not switch off)", "Rohwerte an (schaltet nicht aus)"],
    ["l", "Radio log on/off: every ESP-NOW message as hex", "Funk-Log an/aus: jede ESP-NOW-Nachricht als Hex"],
    ["L", "Link statistics once per second on/off (link check)", "Verbindungsstatistik einmal pro Sekunde an/aus (Linktest)"],
  ],
  sim: [
    ["3", "Drop ACKs on purpose: 0 … 9 = 0 … 90 % (0 = none)", "ACKs absichtlich verwerfen: 0 … 9 = 0 … 90 % (0 = keine)"],
    ["s", "Mute on/off: the simulator stops answering", "Stumm an/aus: der Simulator antwortet nicht mehr"],
    ["l", "Radio log on/off: every ESP-NOW message as hex", "Funk-Log an/aus: jede ESP-NOW-Nachricht als Hex"],
    ["i", "Info", "Info"],
  ],
  bglove: [
    ["s F1:0.5 F0:1", "Finger values to send to the robot hand, 0..1 (F2:- leaves F2 out of DATA)", "Fingerwerte, die an die Roboterhand gehen, 0..1 (F2:- lässt F2 in DATA weg)"],
    ["x", "Stop/start sending (tests what the hand does when the glove is gone)", "Senden anhalten/fortsetzen (testet, was die Hand ohne Handschuh tut)"],
    ["H", "Play the robot hand instead (saved)", "Stattdessen die Roboterhand spielen (wird gespeichert)"],
    ["S", "Sniffer instead: listen to all ESP-NOW traffic on one channel, send nothing (saved; firmware 1.2)", "Stattdessen Sniffer: allen ESP-NOW-Funk auf einem Kanal mithören, nichts senden (wird gespeichert; Firmware 1.2)"],
    ["m" + MAC_EXAMPLE, "Only send to this robot hand (saved for this mode)", "Nur an diese Roboterhand senden (wird für diese Rolle gespeichert)"],
    ["m", "Send to every robot hand (broadcast)", "An alle Roboterhände senden (Broadcast)"],
    ["l", "Radio log on/off: every ESP-NOW message as hex", "Funk-Log an/aus: jede ESP-NOW-Nachricht als Hex"],
    ["i", "Info: MAC, firmware, mode, partner, settings", "Info: MAC, Firmware, Rolle, Partner, Einstellungen"],
  ],
  bhand: [
    ["3", "Drop ACKs on purpose: 0 … 9 = 0 … 90 % (0 = none)", "ACKs absichtlich verwerfen: 0 … 9 = 0 … 90 % (0 = keine)"],
    ["s", "No ACKs at all on/off (mute; tests the glove giving up)", "Gar keine ACKs an/aus (stumm; testet, ob der Handschuh aufgibt)"],
    ["G", "Play the glove instead (saved)", "Stattdessen den Handschuh spielen (wird gespeichert)"],
    ["S", "Sniffer instead: listen to all ESP-NOW traffic on one channel, send nothing (saved; firmware 1.2)", "Stattdessen Sniffer: allen ESP-NOW-Funk auf einem Kanal mithören, nichts senden (wird gespeichert; Firmware 1.2)"],
    ["m" + MAC_EXAMPLE, "Only answer this glove (saved for this mode)", "Nur diesem Handschuh antworten (wird für diese Rolle gespeichert)"],
    ["m", "Answer every glove", "Jedem Handschuh antworten"],
    ["l", "Radio log on/off: every ESP-NOW message as hex", "Funk-Log an/aus: jede ESP-NOW-Nachricht als Hex"],
    ["i", "Info: MAC, firmware, mode, partner, settings", "Info: MAC, Firmware, Rolle, Partner, Einstellungen"],
  ],
  bsniff: [
    ["k6", "Listen on this radio channel, 1 … 13 (saved; the project's boards use 1)", "Auf diesem Funkkanal mithören, 1 … 13 (wird gespeichert; die Boards des Projekts nutzen 1)"],
    ["G", "Play the glove instead (saved)", "Stattdessen den Handschuh spielen (wird gespeichert)"],
    ["H", "Play the robot hand instead (saved)", "Stattdessen die Roboterhand spielen (wird gespeichert)"],
    ["i", "Info: MAC, firmware, mode, channel", "Info: MAC, Firmware, Rolle, Kanal"],
  ],
};

// Fill the table for the board that is shown (also when switching board or language)
function buildCommands() {
  $("befehleTitelH").textContent = t("b_titel", deviceName(state.device));
  $("befehleQuelle").textContent = t("b_quelle_" + state.device);
  const body = $("befehleListe");
  body.textContent = "";
  for (const [cmd, en, de] of COMMANDS[state.device] ?? []) {
    const tr = body.insertRow(), td = tr.insertCell();
    if (en === undefined) {  // group heading
      tr.className = "gruppe";
      td.colSpan = 2;
      td.textContent = t(cmd);
      continue;
    }
    const code = document.createElement("code");
    code.textContent = cmd;
    td.append(code);
    tr.insertCell().textContent = language === "de" ? de : en;
    tr.title = t("b_zeileTitel");
    // a click puts the command into the serial monitor's input (sent with Enter or Send)
    tr.onclick = () => {
      const input = $("befehlEingabe");
      input.value = cmd;
      if (!input.disabled) { input.focus(); input.setSelectionRange(cmd.length, cmd.length); }
    };
  }
}
$("befehleKnopf").onclick = () => toggleWindow("befehleFenster", $("befehleKnopf"), buildCommands);
$("befehleFenster").addEventListener("close", () => $("befehleKnopf").setAttribute("aria-pressed", "false"));
