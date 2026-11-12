"use strict";
// test_tool: signale.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Signals window: an oscilloscope over every number "Key:value" the boards print
// (also the fast streams _raw and _us), and the wiring check (command D).
//   Scope:        handleLine() calls signalFeed() for every data line; each key is a
//                 channel with its own ring buffer (time = arrival time of the line).
//   Wiring check: handleLine() gives "Diagnose: ..." (robot hand) and "Check: ..."
//                 (glove) lines to signalLine(); they never reach the data-line parser.
// ===========================================================================
Object.assign(TEXTS.en, {
  signale: "Signals", signaleTitel: "Oscilloscope for every number the board prints, and a wiring check",
  sg_tabs: "Signals window", sg_tabScope: "Scope", sg_tabPruef: "Wiring check",
  sg_lauf: "Run mode", sg_run: "Run", sg_pause: "Pause", sg_single: "Single",
  sg_runT: "Scroll live", sg_pauseT: "Freeze the picture (the buffer keeps recording)",
  sg_singleT: "Wait for the trigger, record one picture around it, then freeze. Without a trigger channel it records at once.",
  sg_zeit: "Time base", sg_trigger: "Trigger", sg_trigKein: "none (at once)", sg_steigend: "rising ↗", sg_fallend: "falling ↘",
  sg_pegel: "level", sg_flanke: "Trigger edge",
  sg_cursor: "Cursors", sg_cursorT: "Two cursors A and B: click or drag in the trace, or focus it and use ← → (A / B pick the cursor, Shift = big steps). Shows Δt, 1/Δt and the values.",
  sg_skala: "Scale", sg_skalaEinzeln: "each channel", sg_skalaGemeinsam: "shared axis",
  sg_leeren: "Clear", sg_leerenT: "Throw away everything in the buffer",
  sg_csv: "Export CSV", sg_csvT: "Save everything in the buffer: one column per channel, one row per line the board printed",
  sg_fragen: "Ask the board:",
  sg_roh: "Raw stream", sg_rohT: "Fast raw readings in mV for every sensor, ≥ 100 per second (O on, o off). The glove prints only these while it is on, so the finger cards pause.",
  sg_mv: "Voltages", sg_mvT: "Sensor voltages in mV in the normal data line (R on, r off)",
  sg_us: "Pulse widths", sg_usT: "Pulse width in µs that goes to each servo (P on, p off)",
  sg_grad: "Angles", sg_gradT: "Servo angles in degrees (w on/off)",
  sg_bildAria: "Signal trace. With the cursors on: arrow keys move the active cursor, A and B pick it.",
  sg_kanal: "Channel", sg_jetzt: "now", sg_min: "min", sg_max: "max", sg_mittel: "mean", sg_proS: "/ s",
  sg_sichtbar: n => `Show ${n}`, sg_waehlen: n => `Select ${n}: scale and axis`, sg_alle: "All", sg_keine: "None",
  sg_leer: "No signals yet. Connect a board or start the demo: every “Key:value” the board prints shows up here.",
  sg_leerKurz: "Waiting for signals…", sg_dig: "digital", sg_keineSichtbar: "No channel ticked: tick some below.",
  sg_wartet: (kanal, flanke, pegel) => `Waiting for ${kanal} ${flanke} ${pegel}…`,
  sg_erfasst: "Captured. Press Run to continue.", sg_erfasstSofort: "Captured one picture. Press Run to continue.",
  sg_pausiert: "Paused. The buffer keeps recording behind the picture.", sg_pausiertMessen: "Paused to measure. Press Run to continue.",
  sg_ref: { run: "now", done: "trigger", pause: "right edge" },
  sg_trigKanalFehlt: "The trigger channel is gone.",
  sg_dt: "Δt", sg_inv: "1/Δt",
  sg_spalteA: "A", sg_spalteB: "B", sg_spalteD: "B−A",
  sg_csvLeer: "The buffer is empty.",
  // wiring check
  sg_pruefText: "Sends D and shows what the board found: the robot hand scans the I2C bus for the servo driver and lists the servos with their pulse widths; the glove measures every sensor pin for a broken wire, a short circuit or noise. Glove: bend the fingers halfway first, because a straight finger reads almost 0 V, which looks like a short to GND.",
  sg_pruefStart: "Check wiring", sg_pruefLaeuft: "Checking…", sg_pruefNochmal: "Check again",
  sg_pruefNur: "The wiring check exists for the sensor glove (firmware 2.2) and the robot hand (firmware 2.3). Pick one of them at the top left.",
  sg_pruefKeinBoard: "Connect the board (or start the demo) to check its wiring.",
  sg_pruefKeineAntwort: board => `${board} doesn't answer D. It needs newer firmware (robot hand 2.3, glove 2.2).`,
  sg_pruefWartet: "Waiting for the answer…",
  sg_pruefFertig: "Check finished.", sg_pruefUnvollstaendig: "The answer stopped before the end. Check again.",
  // robot hand
  sg_hBus: "I2C bus", sg_hPins: "Pins", sg_hGeraete: "Devices found", sg_hKeine: "none",
  sg_hAdresse40: "servo driver (PCA9685)", sg_hAdresse70: "PCA9685 all-call address",
  sg_hTreiber: "Servo driver", sg_hTreiberOk: (addr, pwm) => `${addr} answers${pwm ? `, PWM ${pwm} Hz` : ""}`,
  sg_hTreiberFehlt: addr => `${addr} does not answer`,
  sg_hUrteilOk: n => `Servo driver found, ${n} servo${n === 1 ? "" : "s"} configured.`,
  sg_hUrteilFehlt: "Servo driver missing: the servos can't move.",
  sg_hHinweisLeer: "Nothing answers on the I2C bus. Check:",
  sg_hHinweisAdresse: "The bus has devices, but not the driver at 0x40. Check the address jumpers (A0–A5) on the driver board, or set the right address in the firmware.",
  sg_hHinweisTreiber: "Check:",
  sg_hH1: "SDA and SCL swapped (SDA to the SDA pin above, SCL to the SCL pin)",
  sg_hH2: "Driver powered: VCC 3.3 V and GND shared with the ESP32 (servo power V+ is separate)",
  sg_hH3: "Pull-up resistors on SDA and SCL (most driver boards have them; bare chips need 4.7 kΩ)",
  sg_hH4: "Solder joints, jumper wires and plugs; try a shorter cable",
  sg_hServos: "Servos", sg_hSchluessel: "Key", sg_hName: "Name", sg_hKanal: "Channel", sg_hPuls: "Pulse µs", sg_hWinkel: "Angle °",
  sg_hSonst: "Other lines from the board",
  // glove
  sg_gSensoren: "Sensors", sg_gSensor: "Sensor", sg_gPin: "Pin", sg_gMv: "mV", sg_gRauschen: "Noise mV", sg_gUrteil: "Verdict", sg_gHinweis: "What it means",
  sg_gOk: "ok", sg_gOffen: "open", sg_gKurz: "short", sg_gRauscht: "noisy",
  sg_gH_ok: "Reads a steady voltage in range.",
  sg_gH_open: "Floating pin: nothing connected, or the wire or solder joint is broken. Check the connector and the sensor's 3.3 V and GND.",
  sg_gH_short: "Stuck at 0 V or 3.3 V without any noise: short circuit, wrong pin or a dead sensor. Look for touching wires. A straight finger also reads about 0 V: bend the fingers halfway and check again.",
  sg_gH_noisy: "Reads, but jumps around: a loose contact or a long unshielded wire. Check the plug, shorten the wire or add a capacitor.",
  sg_gH_unbekannt: "The glove reports a verdict this page doesn't know.",
  sg_gUrteilOk: n => `All ${n} sensor${n === 1 ? "" : "s"} look fine.`,
  sg_gUrteilProblem: (bad, n) => `${bad} of ${n} sensor${n === 1 ? "" : "s"} need${bad === 1 ? "s" : ""} attention.`,
  sg_gAkku: "Battery", sg_gAkkuWert: (mv, v) => `${mv} mV (${v} V)`, sg_gAkkuLeer: "low: charge it",
  sg_gTaste: "Button", sg_gGedrueckt: "pressed", sg_gLos: "released",
  sg_gKeine: "The glove reported no sensors.",
  // serial command table (added to the table in werkzeuge.js)
  sg_cmdD_hand: "Wiring check: I2C scan, servo driver, one line per servo with pulse width and angle (firmware 2.3)",
  sg_cmdP_hand: "Pulse widths on: <key>_us in µs for every servo, in the 50 ms data line (does not switch off; firmware 2.3)",
  sg_cmdp_hand: "Pulse widths on/off (the Signals window shows them)",
  sg_cmdD_glove: "Wiring check: every sensor pin in mV with noise and a verdict ok/open/short/noisy, battery, button (firmware 2.2)",
  sg_cmdO_glove: "Fast raw stream on: <key>_raw in mV, ≥ 100 per second, instead of the normal data line (does not switch off; firmware 2.2)",
  sg_cmdo_glove: "Fast raw stream on/off (the Signals window shows it)",
});

Object.assign(TEXTS.de, {
  signale: "Signale", signaleTitel: "Oszilloskop für jede Zahl, die das Board ausgibt, und eine Verdrahtungsprüfung",
  sg_tabs: "Signale-Fenster", sg_tabScope: "Oszilloskop", sg_tabPruef: "Verdrahtung prüfen",
  sg_lauf: "Laufmodus", sg_run: "Lauf", sg_pause: "Pause", sg_single: "Einzel",
  sg_runT: "Live durchlaufen", sg_pauseT: "Bild einfrieren (der Puffer nimmt weiter auf)",
  sg_singleT: "Auf den Trigger warten, ein Bild um ihn herum aufnehmen und einfrieren. Ohne Trigger-Kanal sofort.",
  sg_zeit: "Zeitbasis", sg_trigger: "Trigger", sg_trigKein: "keiner (sofort)", sg_steigend: "steigend ↗", sg_fallend: "fallend ↘",
  sg_pegel: "Pegel", sg_flanke: "Trigger-Flanke",
  sg_cursor: "Cursor", sg_cursorT: "Zwei Cursor A und B: in die Kurve klicken oder ziehen, oder sie fokussieren und ← → benutzen (A / B wählen den Cursor, Umschalt = große Schritte). Zeigt Δt, 1/Δt und die Werte.",
  sg_skala: "Skala", sg_skalaEinzeln: "je Kanal", sg_skalaGemeinsam: "gemeinsame Achse",
  sg_leeren: "Leeren", sg_leerenT: "Alles im Puffer verwerfen",
  sg_csv: "CSV exportieren", sg_csvT: "Alles im Puffer speichern: eine Spalte je Kanal, eine Zeile je Zeile, die das Board ausgegeben hat",
  sg_fragen: "Board fragen:",
  sg_roh: "Rohstrom", sg_rohT: "Schnelle Rohwerte in mV für jeden Sensor, ≥ 100 pro Sekunde (O an, o aus). Solange er läuft, gibt der Handschuh nur diese aus, die Fingerkarten pausieren.",
  sg_mv: "Spannungen", sg_mvT: "Sensorspannungen in mV in der normalen Datenzeile (R an, r aus)",
  sg_us: "Pulsbreiten", sg_usT: "Pulsbreite in µs, die an jeden Servo geht (P an, p aus)",
  sg_grad: "Winkel", sg_gradT: "Servowinkel in Grad (w an/aus)",
  sg_bildAria: "Signalkurve. Bei eingeschalteten Cursorn: Pfeiltasten bewegen den aktiven Cursor, A und B wählen ihn.",
  sg_kanal: "Kanal", sg_jetzt: "jetzt", sg_min: "min", sg_max: "max", sg_mittel: "Mittel", sg_proS: "/ s",
  sg_sichtbar: n => `${n} anzeigen`, sg_waehlen: n => `${n} wählen: Skala und Achse`, sg_alle: "Alle", sg_keine: "Keine",
  sg_leer: "Noch keine Signale. Board verbinden oder die Demo starten: jedes „Name:Wert“, das das Board ausgibt, erscheint hier.",
  sg_leerKurz: "Warte auf Signale…", sg_dig: "digital", sg_keineSichtbar: "Kein Kanal angehakt: unten welche anhaken.",
  sg_wartet: (kanal, flanke, pegel) => `Warte auf ${kanal} ${flanke} ${pegel}…`,
  sg_erfasst: "Aufgenommen. Mit Lauf geht es weiter.", sg_erfasstSofort: "Ein Bild aufgenommen. Mit Lauf geht es weiter.",
  sg_pausiert: "Pausiert. Der Puffer nimmt hinter dem Bild weiter auf.", sg_pausiertMessen: "Zum Messen pausiert. Mit Lauf geht es weiter.",
  sg_ref: { run: "jetzt", done: "Trigger", pause: "rechter Rand" },
  sg_trigKanalFehlt: "Der Trigger-Kanal ist weg.",
  sg_dt: "Δt", sg_inv: "1/Δt",
  sg_spalteA: "A", sg_spalteB: "B", sg_spalteD: "B−A",
  sg_csvLeer: "Der Puffer ist leer.",
  sg_pruefText: "Schickt D und zeigt, was das Board gefunden hat: Die Roboterhand sucht den Servotreiber am I2C-Bus und listet die Servos mit ihren Pulsbreiten auf; der Handschuh misst jeden Sensor-Pin auf Drahtbruch, Kurzschluss und Rauschen. Handschuh: vorher die Finger halb beugen, denn ein gestreckter Finger liest fast 0 V, das sieht wie ein Kurzschluss gegen GND aus.",
  sg_pruefStart: "Verdrahtung prüfen", sg_pruefLaeuft: "Prüfe…", sg_pruefNochmal: "Nochmal prüfen",
  sg_pruefNur: "Die Verdrahtungsprüfung gibt es für den Sensorhandschuh (Firmware 2.2) und die Roboterhand (Firmware 2.3). Oben links eines von beiden wählen.",
  sg_pruefKeinBoard: "Board verbinden (oder die Demo starten), um die Verdrahtung zu prüfen.",
  sg_pruefKeineAntwort: board => `${board} antwortet nicht auf D. Es braucht neuere Firmware (Roboterhand 2.3, Handschuh 2.2).`,
  sg_pruefWartet: "Warte auf die Antwort…",
  sg_pruefFertig: "Prüfung fertig.", sg_pruefUnvollstaendig: "Die Antwort brach vor dem Ende ab. Nochmal prüfen.",
  sg_hBus: "I2C-Bus", sg_hPins: "Pins", sg_hGeraete: "Gefundene Geräte", sg_hKeine: "keine",
  sg_hAdresse40: "Servotreiber (PCA9685)", sg_hAdresse70: "PCA9685 All-Call-Adresse",
  sg_hTreiber: "Servotreiber", sg_hTreiberOk: (addr, pwm) => `${addr} antwortet${pwm ? `, PWM ${pwm} Hz` : ""}`,
  sg_hTreiberFehlt: addr => `${addr} antwortet nicht`,
  sg_hUrteilOk: n => `Servotreiber gefunden, ${n} Servo${n === 1 ? "" : "s"} eingerichtet.`,
  sg_hUrteilFehlt: "Servotreiber fehlt: die Servos können sich nicht bewegen.",
  sg_hHinweisLeer: "Am I2C-Bus antwortet nichts. Prüfen:",
  sg_hHinweisAdresse: "Am Bus hängen Geräte, aber nicht der Treiber bei 0x40. Adress-Jumper (A0–A5) auf der Treiberplatine prüfen oder die richtige Adresse in der Firmware einstellen.",
  sg_hHinweisTreiber: "Prüfen:",
  sg_hH1: "SDA und SCL vertauscht (SDA an den SDA-Pin oben, SCL an den SCL-Pin)",
  sg_hH2: "Treiber versorgt: VCC 3,3 V und GND gemeinsam mit dem ESP32 (die Servo-Spannung V+ ist getrennt)",
  sg_hH3: "Pull-up-Widerstände an SDA und SCL (die meisten Treiberplatinen haben sie; nackte Chips brauchen 4,7 kΩ)",
  sg_hH4: "Lötstellen, Steckdrähte und Stecker; ein kürzeres Kabel probieren",
  sg_hServos: "Servos", sg_hSchluessel: "Schlüssel", sg_hName: "Name", sg_hKanal: "Kanal", sg_hPuls: "Puls µs", sg_hWinkel: "Winkel °",
  sg_hSonst: "Weitere Zeilen vom Board",
  sg_gSensoren: "Sensoren", sg_gSensor: "Sensor", sg_gPin: "Pin", sg_gMv: "mV", sg_gRauschen: "Rauschen mV", sg_gUrteil: "Urteil", sg_gHinweis: "Bedeutung",
  sg_gOk: "ok", sg_gOffen: "offen", sg_gKurz: "Kurzschluss", sg_gRauscht: "verrauscht",
  sg_gH_ok: "Liest eine ruhige Spannung im erlaubten Bereich.",
  sg_gH_open: "Pin schwebt: nichts angeschlossen, oder Draht oder Lötstelle ist gebrochen. Stecker und 3,3 V und GND des Sensors prüfen.",
  sg_gH_short: "Hängt fest bei 0 V oder 3,3 V ohne Rauschen: Kurzschluss, falscher Pin oder ein toter Sensor. Nach sich berührenden Drähten suchen. Auch ein gestreckter Finger liest etwa 0 V: Finger halb beugen und nochmal prüfen.",
  sg_gH_noisy: "Liest, springt aber herum: Wackelkontakt oder langer ungeschirmter Draht. Stecker prüfen, Draht kürzen oder einen Kondensator einbauen.",
  sg_gH_unbekannt: "Der Handschuh meldet ein Urteil, das diese Seite nicht kennt.",
  sg_gUrteilOk: n => `Alle ${n} Sensor${n === 1 ? "" : "en"} sehen gut aus.`,
  sg_gUrteilProblem: (bad, n) => `${bad} von ${n} Sensor${n === 1 ? "" : "en"} brauch${bad === 1 ? "t" : "en"} Aufmerksamkeit.`,
  sg_gAkku: "Akku", sg_gAkkuWert: (mv, v) => `${mv} mV (${v} V)`, sg_gAkkuLeer: "niedrig: laden",
  sg_gTaste: "Taster", sg_gGedrueckt: "gedrückt", sg_gLos: "losgelassen",
  sg_gKeine: "Der Handschuh hat keine Sensoren gemeldet.",
  sg_cmdD_hand: "Verdrahtungsprüfung: I2C-Suche, Servotreiber, eine Zeile je Servo mit Pulsbreite und Winkel (Firmware 2.3)",
  sg_cmdP_hand: "Pulsbreiten an: <Schlüssel>_us in µs für jeden Servo, in der 50-ms-Datenzeile (schaltet nicht aus; Firmware 2.3)",
  sg_cmdp_hand: "Pulsbreiten an/aus (das Signale-Fenster zeigt sie)",
  sg_cmdD_glove: "Verdrahtungsprüfung: jeder Sensor-Pin in mV mit Rauschen und Urteil ok/open/short/noisy, Akku, Taster (Firmware 2.2)",
  sg_cmdO_glove: "Schneller Rohstrom an: <Schlüssel>_raw in mV, ≥ 100 pro Sekunde, statt der normalen Datenzeile (schaltet nicht aus; Firmware 2.2)",
  sg_cmdo_glove: "Schneller Rohstrom an/aus (das Signale-Fenster zeigt ihn)",
});

// Serial command help (the table lives in werkzeuge.js, the last group is "Output in the log")
const sgCmd = (cmd, key) => [cmd, TEXTS.en[key], TEXTS.de[key]];
COMMANDS.hand.push(sgCmd("D", "sg_cmdD_hand"), sgCmd("p", "sg_cmdp_hand"), sgCmd("P", "sg_cmdP_hand"));
COMMANDS.glove.push(sgCmd("D", "sg_cmdD_glove"), sgCmd("o", "sg_cmdo_glove"), sgCmd("O", "sg_cmdO_glove"));

// ---------------------------------------------------------------------------
// Buffer: one ring buffer per channel
// ---------------------------------------------------------------------------
const SIG_CAP = 16384;      // samples per channel: 60 s at 200 Hz and some more
const SIG_MAX = 80;         // channels
const SIG_GAP_MS = 1500;    // a pause this long in a channel breaks the line
const SIG_PALETTE = 6;      // --sig-1 .. --sig-6 for everything that is not a finger
const SIG_DASHES = { "": [], mV: [8, 4], Pos: [8, 4], comp: [2, 4], Ziel: [2, 4], ausgl: [2, 4], raw: [12, 4, 2, 4], Grad: [12, 4, 2, 4], us: [3, 3, 9, 3] };
const SIG_DASH_OTHER = [[8, 4], [2, 4], [12, 4, 2, 4], [3, 3, 9, 3]];
const SIG_RANK = { "": 0, raw: 1, us: 1, mV: 2, Pos: 2, comp: 3, Ziel: 3, Grad: 4 };
const SIG_SPANS = [1000, 2000, 5000, 10000, 20000, 30000, 60000];

const sig = {
  ch: new Map(),            // id -> channel
  devices: new Set(),
  palette: 0,               // colours handed out so far
  sourceKey: "",
  mode: "run",              // run | pause | armed | capture | done
  span: 10000, frozenEnd: 0, armedAt: 0, tTrig: null,
  trigId: "", trigLevel: 0, trigEdge: "rising", levelManual: false,
  cursors: false, a: null, b: null, active: "a",
  scale: "auto", sel: "",
  tab: "scope", geo: null, raf: 0, tableKey: "", tableAt: 0, rows: new Map(), trigKey: "",
  message: "",
};

function sigNewChannel(device, key) {
  if (sig.ch.size >= SIG_MAX) return null;
  const m = /^(.+)_([A-Za-z]+)$/.exec(key);
  const base = m ? m[1] : key, variant = m ? m[2] : "";
  const fid = KEY_TO_CHANNEL[base] ?? null;           // a finger: key F0 or the glove's own sensor name
  const c = {
    id: device + "|" + key, device, key, base, variant,
    finger: fid === null ? null : CHANNELS.findIndex(f => f.id === fid),
    color: fid === null ? null : CHANNEL[fid].color, pal: 0, dash: [],
    times: new Float64Array(SIG_CAP), vals: new Float32Array(SIG_CAP), n: 0,
    nonBinary: false, gT: 0, gPrev: 0, gN: 0,
    visible: false,
  };
  if (fid === null) {
    c.pal = sig.palette % SIG_PALETTE;
    c.dash = sig.palette >= SIG_PALETTE ? SIG_DASH_OTHER[(Math.floor(sig.palette / SIG_PALETTE) - 1) % SIG_DASH_OTHER.length] : [];
    sig.palette++;
  } else {
    let h = 0;
    for (const ch of variant) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    c.dash = SIG_DASHES[variant] ?? SIG_DASH_OTHER[h % SIG_DASH_OTHER.length];
  }
  // on by default: the fingers' own values, the fast streams, the link lane; the rest is a click away
  c.visible = (c.finger !== null && (variant === "" || variant === "raw" || variant === "us")) || /^(Link|Verbunden)$/.test(key);
  sig.ch.set(c.id, c);
  sig.devices.add(device);
  return c;
}

// New demo, new serial connection, other demo board: start with an empty buffer
function sigCheckSource() {
  const key = (state.source ?? "") + "|" + (state.source === "demo" ? state.device : connections.length ? "serial" : "");
  if (key === sig.sourceKey) return;
  sig.sourceKey = key;
  sigClear();
}

function sigClear() {
  sig.ch.clear(); sig.devices.clear(); sig.palette = 0; sig.rows.clear();
  sig.a = sig.b = null; sig.tTrig = null; sig.sel = ""; sig.tableKey = ""; sig.trigKey = "";
  if (sig.mode === "armed" || sig.mode === "capture" || sig.mode === "done") sig.mode = "run";
}

// data: {key: number} of one data line; device: which board printed it
function signalFeed(data, now, device) {
  if (!device) return;   // board not detected yet (the first lines after connecting): its name is not known
  sigCheckSource();
  for (const key in data) sigPush(device, key, data[key], now);
}

// "[link] ok:10 rtt_us:1500 ..." of the glove (also parsed by linktest.js)
function signalLinkLine(text, device, now) {
  const m = /^\[link\] (.*)$/.exec(text);
  if (!m) return;
  const d = {};
  for (const part of m[1].split(/\s+/)) {
    const p = /^(\w+):(-?\d+(?:\.\d+)?)$/.exec(part);
    if (p) d["link." + p[1]] = +p[2];
  }
  signalFeed(d, now, device);
}

function sigPush(device, key, v, now) {
  if (!Number.isFinite(v)) return;
  const id = device + "|" + key;
  const c = sig.ch.get(id) ?? sigNewChannel(device, key);
  if (!c) return;
  const i = c.n % SIG_CAP;
  c.vals[i] = v;
  if (v !== 0 && v !== 1) c.nonBinary = true;
  // Several lines that arrive in one chunk of serial data (a fast stream) share one
  // arrival time: spread them evenly over the time since the chunk before.
  if (c.n > 0 && now - c.gT < 1.5 && c.gN < SIG_CAP / 4) {
    c.gN++;
    c.n++;
    const from = Math.max(c.gPrev, c.gT - 120);
    for (let j = 0; j < c.gN; j++) c.times[(c.n - c.gN + j) % SIG_CAP] = from + (c.gT - from) * (j + 1) / c.gN;
  } else {
    c.gPrev = c.n > 0 ? c.times[(c.n - 1) % SIG_CAP] : now;
    c.gT = now; c.gN = 1;
    c.times[i] = now;
    c.n++;
  }
  // trigger: this sample crosses the level (time interpolated between the two samples)
  if (sig.mode === "armed" && id === sig.trigId && c.n >= 2) {
    const p = c.vals[(c.n - 2) % SIG_CAP], tp = c.times[(c.n - 2) % SIG_CAP], tc = c.times[(c.n - 1) % SIG_CAP], L = sig.trigLevel;
    if (tc >= sig.armedAt && (sig.trigEdge === "rising" ? p < L && v >= L : p > L && v <= L)) {
      sig.tTrig = v === p ? tc : tp + (L - p) / (v - p) * (tc - tp);
      sig.mode = "capture";
    }
  }
}

const sigStart = c => Math.max(0, c.n - SIG_CAP);
const sigT = (c, k) => c.times[k % SIG_CAP];
const sigV = (c, k) => c.vals[k % SIG_CAP];
// first logical index whose time is >= t (strict: > t)
function sigBound(c, t, strict) {
  let lo = sigStart(c), hi = c.n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, x = sigT(c, mid);
    if (strict ? x <= t : x < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function sigStats(c, t0, t1) {
  const lo = sigBound(c, t0, false), hi = sigBound(c, t1, true);
  let mn = Infinity, mx = -Infinity, sum = 0;
  for (let k = lo; k < hi; k++) { const v = sigV(c, k); if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
  const n = hi - lo;
  const rate = n >= 2 ? (n - 1) / ((sigT(c, hi - 1) - sigT(c, lo)) / 1000) : null;
  return { n, lo, hi, min: n ? mn : null, max: n ? mx : null, mean: n ? sum / n : null, rate,
           last: c.n ? sigV(c, c.n - 1) : null, lastT: c.n ? sigT(c, c.n - 1) : null };
}

// value at time t: the last sample at or before it (as printed), nothing if the channel was silent then
function sigAt(c, t) {
  const k = sigBound(c, t, true) - 1;
  if (k < sigStart(c)) return null;
  if (k === c.n - 1 && t - sigT(c, k) > SIG_GAP_MS) return null;
  return sigV(c, k);
}

// A channel that only ever printed 0 and 1 (Link, Verbunden, Test ...) is a logic lane. The fingers' own values never are.
const sigDigital = c => !c.nonBinary && c.n >= 5 && !(c.finger !== null && c.variant === "");
const sigLabel = c => (sig.devices.size > 1 ? t("kurz_" + c.device) + " " : "") + c.key;
function sigOrdered() {
  return [...sig.ch.values()].sort((a, b) =>
    (a.finger === null) - (b.finger === null) || (a.finger ?? 0) - (b.finger ?? 0) || a.device.localeCompare(b.device) ||
    (SIG_RANK[a.variant] ?? 9) - (SIG_RANK[b.variant] ?? 9) || a.key.localeCompare(b.key));
}
// flowing = this kind of series printed something in the last 1.2 s on the shown board
function sigFlowing(test, now) {
  for (const c of sig.ch.values()) if (c.device === state.device && test(c) && c.n && now - sigT(c, c.n - 1) < 1200) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Time window and run modes
// ---------------------------------------------------------------------------
function sigEnd(now) { return sig.mode === "pause" || sig.mode === "done" ? sig.frozenEnd : now; }

function sigFreeze(now, mode = "pause") {
  sig.frozenEnd = sig.geo?.t1 ?? now;
  sig.mode = mode;
}
function sigSetMode(mode) {
  const now = performance.now();
  if (mode === "run") { sig.mode = "run"; sig.tTrig = null; sig.message = ""; }
  else if (mode === "pause") { sigFreeze(now); sig.message = t("sg_pausiert"); }
  else if (mode === "single") {
    sig.armedAt = now; sig.tTrig = null; sig.message = "";
    if (sig.trigId && sig.ch.has(sig.trigId)) sig.mode = "armed";
    else { sig.tTrig = now; sig.mode = "capture"; }
  }
  sigControls(true);
}

// Called every frame while the window is open
function sigTick(now) {
  if (sig.mode === "capture" && now >= sig.tTrig + sig.span * 0.75) {
    sig.frozenEnd = sig.tTrig + sig.span * 0.75;
    sig.mode = "done";
    sig.message = t(sig.trigId && sig.ch.has(sig.trigId) ? "sg_erfasst" : "sg_erfasstSofort");
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function sigFmt(v, extra = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : 3;
  return v.toLocaleString(language, { maximumFractionDigits: d + extra });
}
function sigFmtT(sec) {
  const a = Math.abs(sec);
  const s = a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a.toFixed(2);
  return (sec < -0.0004 ? "−" : sec > 0.0004 ? "+" : "") + Number(s).toLocaleString(language) + " s";
}
function sigFmtDt(ms) {
  const a = Math.abs(ms);
  return a >= 1000 ? (a / 1000).toLocaleString(language, { maximumFractionDigits: 3 }) + " s" : a.toLocaleString(language, { maximumFractionDigits: 1 }) + " ms";
}

function sigColors() {
  return {
    bg: css("--sig-bg"), grid: css("--sig-gitter"), text: css("--sig-text"), trig: css("--sig-trig"),
    a: css("--sig-a"), b: css("--sig-b"), warn: css("--warn"), ok: css("--ok"),
    pal: Array.from({ length: SIG_PALETTE }, (_, i) => css("--sig-" + (i + 1))), font: "11px " + css("--schrift"),
  };
}
const sigColor = (c, cs) => c.color ?? cs.pal[c.pal];

function sigDraw(now) {
  sigTick(now);
  const { ctx, w, h } = prepare($("sigBild"));
  const cs = sigColors();
  const t1 = sigEnd(now), t0 = t1 - sig.span;
  const vis = sigOrdered().filter(c => c.visible && c.n);
  const dig = vis.filter(sigDigital), ana = vis.filter(c => !sigDigital(c));
  const left = 58, right = 12, top = 10, bottom = 24, pw = Math.max(10, w - left - right);
  const laneH = ana.length ? 18 : Math.min(34, (h - top - bottom) / Math.max(1, dig.length));
  const lanes = dig.length ? dig.length * laneH + (ana.length ? 6 : 0) : 0;
  const ay0 = top, ay1 = h - bottom - lanes, ph = Math.max(10, ay1 - ay0);
  const X = tm => left + (tm - t0) / sig.span * pw;
  sig.geo = { left, right, pw, t0, t1, w, h };

  ctx.fillStyle = cs.bg; ctx.fillRect(0, 0, w, h);
  ctx.font = cs.font; ctx.lineJoin = "round";
  // time grid: a line every tenth, a label every fifth; 0 = now, trigger or right edge
  const ref = sig.mode === "done" && sig.tTrig !== null ? sig.tTrig : t1;
  ctx.lineWidth = 1; ctx.fillStyle = cs.text; ctx.strokeStyle = cs.grid;
  for (let k = 0; k <= 10; k++) {
    const x = Math.round(left + pw * k / 10) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, h - bottom); ctx.stroke();
    if (k % 2 === 0) {
      const label = sigFmtT((t0 + sig.span * k / 10 - ref) / 1000);
      ctx.textAlign = k === 0 ? "left" : k === 10 ? "right" : "center";
      ctx.fillText(k === 10 && sig.mode === "run" ? "0 · " + t("sg_jetzt") : label, x, h - 7);
    }
  }
  ctx.textAlign = "left";

  // scales
  const st = new Map();
  for (const c of ana) st.set(c, sigStats(c, t0, t1));
  const range = {};
  const pad = (lo, hi) => {
    if (!(hi - lo > 1e-9)) { const m = Math.abs(lo) * 0.05 || 0.5; lo -= m; hi += m; }
    const p = (hi - lo) * 0.08;
    return [lo - p, hi + p];
  };
  if (sig.scale === "shared") {
    let lo = Infinity, hi = -Infinity;
    for (const s of st.values()) if (s.n) { lo = Math.min(lo, s.min); hi = Math.max(hi, s.max); }
    const r = Number.isFinite(lo) ? pad(lo, hi) : [0, 1];
    for (const c of ana) range[c.id] = r;
  } else {
    for (const c of ana) { const s = st.get(c); range[c.id] = s.n ? pad(s.min, s.max) : [0, 1]; }
  }
  const sel = vis.find(c => c.id === sig.sel) ?? ana[0] ?? dig[0];
  const yOf = c => { const [lo, hi] = range[c.id]; return v => ay1 - 3 - (v - lo) / (hi - lo) * (ph - 6); };

  // horizontal grid and the axis of the selected channel
  if (ana.length) {
    for (let k = 0; k <= 4; k++) {
      const y = Math.round(ay1 - 3 - (ph - 6) * k / 4) + 0.5;
      ctx.strokeStyle = cs.grid; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
      if (range[sel?.id]) {
        const [lo, hi] = range[sel.id];
        ctx.fillStyle = sigColor(sel, cs); ctx.textAlign = "right";
        ctx.fillText(sigFmt(lo + (hi - lo) * k / 4), left - 6, y + 4);
      }
    }
    ctx.textAlign = "left";
    if (sel && !sigDigital(sel)) { ctx.fillStyle = sigColor(sel, cs); ctx.fillText(sigLabel(sel), left + 8, top + 12); }
  }

  // traces (the selected one last and thicker)
  const order = [...ana.filter(c => c !== sel), ...ana.filter(c => c === sel)];
  for (const c of order) {
    const s = st.get(c);
    ctx.strokeStyle = sigColor(c, cs); ctx.lineWidth = c === sel ? 2.4 : 1.6; ctx.setLineDash(c.dash);
    sigPath(ctx, c, s, X, yOf(c), left, left + pw, false);
  }
  ctx.setLineDash([]);

  // logic lanes
  dig.forEach((c, i) => {
    const yTop = ay1 + (ana.length ? 6 : 0) + i * laneH, yHi = yTop + 3, yLo = yTop + laneH - 4;
    ctx.strokeStyle = cs.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, Math.round(yTop + laneH) - 0.5); ctx.lineTo(w - right, Math.round(yTop + laneH) - 0.5); ctx.stroke();
    ctx.fillStyle = sigColor(c, cs); ctx.textAlign = "right";
    ctx.fillText(sigLabel(c), left - 6, yTop + laneH / 2 + 4);
    ctx.textAlign = "left";
    ctx.strokeStyle = sigColor(c, cs); ctx.lineWidth = c === sel ? 2.4 : 1.6;
    sigPath(ctx, c, sigStats(c, t0, t1), X, v => (v >= 0.5 ? yHi : yLo), left, left + pw, true);
  });

  if (!vis.length) {
    ctx.fillStyle = cs.text; ctx.textAlign = "center";
    ctx.fillText(t(sig.ch.size ? "sg_keineSichtbar" : "sg_leerKurz"), left + pw / 2, h / 2);
    ctx.textAlign = "left";
  }

  // trigger: level (on its channel) and the moment
  const tc = sig.ch.get(sig.trigId);
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, pw, h - top - bottom); ctx.clip();
  ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = cs.trig; ctx.fillStyle = cs.trig;
  if (tc && ana.includes(tc)) {
    const y = yOf(tc)(sig.trigLevel);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillText("T", left + 3, y - 3);
  }
  ctx.setLineDash([5, 4]);
  if (sig.tTrig !== null && (sig.mode === "capture" || sig.mode === "done")) {
    const x = X(sig.tTrig);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, h - bottom); ctx.stroke();
    ctx.setLineDash([]); ctx.fillText("T", x + 3, top + 10);
  }
  // cursors
  ctx.setLineDash([]);
  if (sig.cursors && sig.a !== null) {
    for (const [name, tm, color] of [["A", sig.a, cs.a], ["B", sig.b, cs.b]]) {
      const x = X(tm);
      if (x < left - 1 || x > left + pw + 1) continue;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = name.toLowerCase() === sig.active ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, h - bottom); ctx.stroke();
      ctx.fillRect(x - 7, top, 14, 14);
      ctx.fillStyle = cs.bg; ctx.textAlign = "center"; ctx.fillText(name, x, top + 11); ctx.textAlign = "left";
    }
  }
  ctx.restore();

  // state in the corner
  const flag = sig.mode === "armed" ? [t("sg_wartet", tc ? sigLabel(tc) : "", t(sig.trigEdge === "rising" ? "sg_steigend" : "sg_fallend"), sigFmt(sig.trigLevel)), cs.warn]
    : sig.mode === "capture" ? ["●", cs.warn] : sig.mode === "done" ? ["■ " + t("sg_single"), cs.ok] : sig.mode === "pause" ? ["❚❚", cs.text] : null;
  if (flag) {
    ctx.fillStyle = flag[1]; ctx.textAlign = "right"; ctx.fillText(flag[0], w - right - 6, sig.cursors ? top + 28 : top + 12); ctx.textAlign = "left";
  }
  sig.last = { st, ana, dig, vis, t0, t1, ref };
}

// One trace. s = stats of the window (index range). digital: steps, only the changes are drawn.
function sigPath(ctx, c, s, X, Y, xMin, xMax, digital) {
  if (!s.n) return;
  const lo = Math.max(sigStart(c), s.lo - 1), hi = s.hi;   // one sample before the window: the line comes from the left
  ctx.beginPath();
  let pen = false, prevT = 0, prevY = 0, prevV = null;
  const clampX = x => Math.max(xMin - 2, Math.min(xMax + 2, x));
  if (digital) {
    for (let k = lo; k < hi; k++) {
      const v = sigV(c, k) >= 0.5 ? 1 : 0, tm = sigT(c, k), x = clampX(X(tm)), y = Y(v);
      if (pen && tm - prevT > SIG_GAP_MS) pen = false;
      if (!pen) { ctx.moveTo(x, y); pen = true; }
      else if (v !== prevV) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
      prevT = tm; prevY = y; prevV = v;
    }
    if (pen) ctx.lineTo(clampX(X(prevT)), prevY);
    ctx.stroke();
    return;
  }
  const px = xMax - xMin;
  if (hi - lo > px * 3) {
    // more samples than pixels: per pixel column the first, lowest, highest and last value
    let col = NaN, f = 0, mn = 0, mx = 0, l = 0, imn = 0, imx = 0;
    const flush = () => {
      if (Number.isNaN(col)) return;
      const pts = imn <= imx ? [f, mn, mx, l] : [f, mx, mn, l];
      for (const v of pts) { const y = Y(v); if (!pen) { ctx.moveTo(col, y); pen = true; } else ctx.lineTo(col, y); }
    };
    for (let k = lo; k < hi; k++) {
      const v = sigV(c, k), x = Math.round(clampX(X(sigT(c, k))));
      if (x !== col) { flush(); col = x; f = mn = mx = l = v; imn = imx = k; }
      else { if (v < mn) { mn = v; imn = k; } if (v > mx) { mx = v; imx = k; } l = v; }
    }
    flush();
  } else {
    for (let k = lo; k < hi; k++) {
      const tm = sigT(c, k), x = clampX(X(tm)), y = Y(sigV(c, k));
      if (pen && tm - prevT > SIG_GAP_MS) pen = false;
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      prevT = tm;
    }
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Controls, channel table, cursors
// ---------------------------------------------------------------------------
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function sigSwatch(c) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "sig-muster"); svg.setAttribute("width", "30"); svg.setAttribute("height", "10"); svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(ns, "line");
  for (const [k, v] of [["x1", 1], ["y1", 5], ["x2", 29], ["y2", 5], ["stroke-width", 2.5], ["stroke-dasharray", c.dash.length ? c.dash.join(" ") : "none"]]) line.setAttribute(k, v);
  line.style.stroke = c.color ?? `var(--sig-${c.pal + 1})`;
  svg.appendChild(line);
  return svg;
}

function sigBuildTable(list) {
  const body = $("sigZeilen");
  body.textContent = "";
  sig.rows.clear();
  for (const c of list) {
    const tr = body.insertRow();
    const row = { tr };
    const td0 = tr.insertCell(), box = el("input"); box.type = "checkbox"; box.checked = c.visible;
    box.setAttribute("aria-label", t("sg_sichtbar", sigLabel(c)));
    box.onchange = () => { c.visible = box.checked; };
    td0.append(box);
    const td1 = tr.insertCell(), name = el("button", "sig-name");
    name.type = "button"; name.setAttribute("aria-label", t("sg_waehlen", sigLabel(c)));
    name.append(sigSwatch(c), el("span", "", sigLabel(c)));
    if (sigDigital(c)) name.append(el("span", "sig-dig", t("sg_dig")));
    name.onclick = () => { sig.sel = c.id; sig.tableKey = ""; };
    td1.append(name);
    row.box = box; row.name = name;
    for (const k of ["now", "min", "max", "mean", "rate", "A", "B", "D"]) {
      const td = tr.insertCell(); td.className = "n" + (["A", "B", "D"].includes(k) ? " sig-cur" : "");
      row[k] = td;
    }
    sig.rows.set(c.id, row);
  }
}

function sigUpdateTable(now) {
  const list = sigOrdered();
  $("sigLeer").hidden = list.length > 0;
  $("sigTabelleBox").hidden = list.length === 0;
  const key = list.map(c => c.id + (sigDigital(c) ? "d" : "") + (c.id === sig.sel ? "*" : "")).join() + language + sig.devices.size;
  if (key !== sig.tableKey) { sig.tableKey = key; sigBuildTable(list); }
  $("sigTabelle").dataset.cursor = sig.cursors ? "ja" : "nein";
  const win = sig.last ?? { t0: now - sig.span, t1: now };
  for (const c of list) {
    const r = sig.rows.get(c.id);
    if (!r) continue;
    if (r.box.checked !== c.visible) r.box.checked = c.visible;
    r.name.setAttribute("aria-pressed", c.id === sig.sel);
    const s = win.st?.get(c) ?? sigStats(c, win.t0, win.t1);
    const fresh = s.lastT !== null && now - s.lastT < 2000;
    r.tr.dataset.alt = fresh ? "nein" : "ja";
    r.now.textContent = sigFmt(s.last);
    r.min.textContent = sigFmt(s.min); r.max.textContent = sigFmt(s.max); r.mean.textContent = sigFmt(s.mean);
    r.rate.textContent = s.rate === null ? "–" : s.rate.toLocaleString(language, { maximumFractionDigits: s.rate >= 100 ? 0 : 1 });
    if (sig.cursors && sig.a !== null) {
      const va = sigAt(c, sig.a), vb = sigAt(c, sig.b);
      r.A.textContent = sigFmt(va); r.B.textContent = sigFmt(vb);
      r.D.textContent = va === null || vb === null ? "–" : sigFmt(vb - va, 1);
    }
  }
  // trigger channel list
  const tk = list.map(c => c.id + sigLabel(c)).join() + language;
  if (tk !== sig.trigKey) {
    sig.trigKey = tk;
    const sel = $("sigTrigKanal");
    sel.textContent = "";
    const none = el("option", "", t("sg_trigKein")); none.value = "";
    sel.append(none);
    for (const c of list) { const o = el("option", "", sigLabel(c)); o.value = c.id; sel.append(o); }
    sel.value = sig.ch.has(sig.trigId) ? sig.trigId : "";
  }
  if (sig.trigId && !sig.ch.has(sig.trigId)) { sig.trigId = ""; $("sigTrigKanal").value = ""; }
}

function sigInfoLine() {
  let text = "";
  if (sig.cursors && sig.a !== null && sig.last) {
    const ref = sig.last.ref, rel = tm => sigFmtT((tm - ref) / 1000);
    const dt = Math.abs(sig.b - sig.a);
    text = `A ${rel(sig.a)}   B ${rel(sig.b)}   ${t("sg_dt")} ${sigFmtDt(dt)}   ${t("sg_inv")} ${dt > 0 ? (1000 / dt).toLocaleString(language, { maximumFractionDigits: dt < 1000 ? 1 : 3 }) + " Hz" : "–"}`;
  }
  if ($("sigInfo").textContent !== text) $("sigInfo").textContent = text;
  const armed = sig.mode === "armed";
  const msg = armed ? "" : sig.message;
  if ($("sigMeldung").textContent !== msg) $("sigMeldung").textContent = msg;
}

let sigCtlKey = "";
function sigControls(force = false) {
  const now = performance.now();
  const on = !!viewConn() || state.source === "demo";
  const flows = [
    ["sigRaw", c => c.variant === "raw"], ["sigMv", c => c.variant === "mV"],
    ["sigUs", c => c.variant === "us"], ["sigGrad", c => c.variant === "Grad" && c.finger !== null && !/^[FS]\d$/.test(c.base)],
  ].map(([id, test]) => [id, sigFlowing(test, now)]);
  const key = [sig.mode, sig.cursors, on, state.device, language, ...flows.map(f => f[1])].join();
  if (key === sigCtlKey && !force) return;
  sigCtlKey = key;
  $("sigRun").setAttribute("aria-pressed", sig.mode === "run");
  $("sigPause").setAttribute("aria-pressed", sig.mode === "pause");
  $("sigSingle").setAttribute("aria-pressed", sig.mode === "armed" || sig.mode === "capture" || sig.mode === "done");
  $("sigCursor").setAttribute("aria-pressed", sig.cursors);
  for (const [id, f] of flows) $(id).setAttribute("aria-pressed", f);
  for (const b of document.querySelectorAll("#signaleFenster [data-sig-seriell]")) b.disabled = !on || (b.id === "sigPruefStart" && !wiringKind());
}

// Pointer and keyboard on the trace: place and drag the cursors
function sigPointerTime(e) {
  const g = sig.geo, r = $("sigBild").getBoundingClientRect();
  if (!g) return null;
  return g.t0 + Math.max(0, Math.min(1, (e.clientX - r.left - g.left) / g.pw)) * (g.t1 - g.t0);
}
function sigEnsureCursors() {
  const g = sig.geo;
  if (sig.a === null && g) { sig.a = g.t0 + (g.t1 - g.t0) * 0.35; sig.b = g.t0 + (g.t1 - g.t0) * 0.65; }
}
function sigPause(auto) {
  if (sig.mode === "run") { sigFreeze(performance.now()); sig.message = t("sg_pausiertMessen"); sigControls(true); }
}
function sigMoveCursor(which, tm) {
  sig[which] = tm;
  sig.active = which;
}
let sigDrag = null;
$("sigBild").addEventListener("pointerdown", e => {
  if (!sig.cursors || !sig.geo) return;
  sigPause(true);
  sigEnsureCursors();
  const tm = sigPointerTime(e);
  const which = Math.abs(tm - sig.a) <= Math.abs(tm - sig.b) ? "a" : "b";
  sigMoveCursor(which, tm);
  sigDrag = which;
  $("sigBild").setPointerCapture(e.pointerId);
  $("sigBild").focus({ preventScroll: true });
  e.preventDefault();
});
$("sigBild").addEventListener("pointermove", e => { if (sigDrag) sigMoveCursor(sigDrag, sigPointerTime(e)); });
for (const type of ["pointerup", "pointercancel"]) $("sigBild").addEventListener(type, () => { sigDrag = null; });
$("sigBild").addEventListener("keydown", e => {
  if (!sig.cursors) return;
  const k = e.key.toLowerCase();
  if (k === "a" || k === "b") { sig.active = k; e.preventDefault(); return; }
  if (k !== "arrowleft" && k !== "arrowright") return;
  sigPause(true);
  sigEnsureCursors();
  const step = sig.span / 200 * (e.shiftKey ? 10 : 1) * (k === "arrowleft" ? -1 : 1);
  sig[sig.active] += step;
  e.preventDefault();
});

// ---------------------------------------------------------------------------
// Export: one row per line the board printed (lines that arrived together share their time)
// ---------------------------------------------------------------------------
function sigCsv() {
  const list = sigOrdered().filter(c => c.n);
  if (!list.length) { sig.message = t("sg_csvLeer"); return; }
  const rows = new Map();
  let first = Infinity;
  list.forEach((c, ci) => {
    for (let k = sigStart(c); k < c.n; k++) {
      const tm = sigT(c, k);
      first = Math.min(first, tm);
      const key = tm.toFixed(3);
      let r = rows.get(key);
      if (!r) rows.set(key, r = { tm, v: new Array(list.length).fill("") });
      r.v[ci] = sigV(c, k);
    }
  });
  const q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const out = [["time_s", ...list.map(c => q(sig.devices.size > 1 ? `${c.device} ${c.key}` : c.key))].join(",")];
  for (const r of [...rows.values()].sort((a, b) => a.tm - b.tm)) out.push([((r.tm - first) / 1000).toFixed(3), ...r.v].join(","));
  download(`signals-${stamp()}.csv`, out.join("\n") + "\n", "text/csv");
}

// ---------------------------------------------------------------------------
// Wiring check: "Diagnose: ..." (robot hand, command D) and "Check: ..." (glove, command D)
// ---------------------------------------------------------------------------
const wiring = { hand: null, glove: null, asked: { hand: 0, glove: 0 } };
const wiringKind = () => (state.device === "hand" ? "hand" : state.device === "glove" ? "glove" : null);
let wiringRev = 0;
const wiringNew = () => ({ rev: 0, done: false, i2c: null, driver: null, servos: [], sensors: [], battery: null, button: null, other: [] });

// Returns true for a line of the wiring check (the caller logs it and stops there)
function signalLine(text, device, now) {
  let m = /^Diagnose:\s*(.*)$/.exec(text);
  if (m) { wiringHand(m[1].trim()); return true; }
  m = /^Check:\s*(.*)$/.exec(text);
  if (m) { wiringGlove(m[1].trim()); return true; }
  return false;
}

function wiringHand(rest) {
  let w = wiring.hand;
  let m;
  // the bus line starts a new check
  if ((m = /^I2C SDA (\d+) SCL (\d+),\s*(.*)$/.exec(rest))) {
    w = wiring.hand = wiringNew();
    w.i2c = { sda: +m[1], scl: +m[2], addrs: (m[3].match(/0x[0-9a-f]{1,2}/gi) ?? []).map(a => "0x" + a.slice(2).toUpperCase().padStart(2, "0")) };
  } else if (!w || w.done) w = wiring.hand = wiringNew();
  if ((m = /^Servotreiber (0x[0-9a-f]+)\s+(ok|FEHLT)(?:,\s*PWM ([\d.]+) Hz)?/i.exec(rest))) {
    w.driver = { addr: "0x" + m[1].slice(2).toUpperCase().padStart(2, "0"), ok: m[2].toLowerCase() === "ok", pwm: m[3] ?? null };
  } else if ((m = /^Servo (\S+) (.+?) Kanal (\d+) Puls (-?[\d.]+)\s*\S+ Winkel (-?[\d.]+)/.exec(rest))) {
    w.servos.push({ key: m[1], name: m[2], channel: +m[3], pulse: +m[4], angle: +m[5] });
  } else if (/^fertig/i.test(rest)) {
    w.done = true;
  } else if (!/^I2C SDA/.test(rest)) {
    w.other.push("Diagnose: " + rest);
  }
  w.rev = ++wiringRev;
}

function wiringGlove(rest) {
  let w = wiring.glove, m;
  if ((m = /^sensor (\S+) GPIO(\d+) (-?[\d.]+) mV noise (-?[\d.]+) mV\s*(\S*)/.exec(rest))) {
    if (!w || w.done || w.sensors.length && w.battery !== null) w = wiring.glove = wiringNew();
    w.sensors.push({ key: m[1], pin: +m[2], mv: +m[3], noise: +m[4], verdict: m[5].toLowerCase() });
  } else {
    if (!w || w.done) w = wiring.glove = wiringNew();
    if ((m = /^battery (-?[\d.]+) mV/.exec(rest))) w.battery = +m[1];
    else if ((m = /^button (\w+)/.exec(rest))) w.button = m[1].toLowerCase();
    else if (/^done/i.test(rest)) w.done = true;
    else w.other.push("Check: " + rest);
  }
  w.rev = ++wiringRev;
}

function wiringStart() {
  const kind = wiringKind();
  if (!kind) return;
  wiring[kind] = null;
  wiring.asked[kind] = performance.now();
  wiringRev++;
  send("D");
  showWiring(true);
}

function wiringCheckBox(art, text) {
  const p = el("p", "sig-urteil", text);
  p.dataset.art = art;
  return p;
}
const wiringKv = (label, ...value) => { const d = el("div", "sig-kv"); d.append(el("span", "klein", label)); const v = el("span", "sig-wert"); v.append(...value); d.append(v); return d; };
const wiringChip = (text, art) => { const s = el("span", "sig-chip", text); if (art) s.dataset.art = art; return s; };
function wiringDot(key) {
  const fid = KEY_TO_CHANNEL[key], s = el("span", "punkt");
  s.style.background = fid ? CHANNEL[fid].color : "var(--inaktiv)";
  return s;
}
function wiringTable(head, rows, numeric = []) {
  const wrap = el("div", "sig-tabelle"), tbl = el("table", "liste");
  const tr = tbl.createTHead().insertRow();
  head.forEach((h, i) => { const th = el("th", numeric.includes(i) ? "n" : "", h); tr.append(th); });
  const body = tbl.createTBody();
  for (const r of rows) {
    const row = body.insertRow();
    r.forEach((cell, i) => {
      const td = row.insertCell(); td.className = numeric.includes(i) ? "n" : "";
      if (cell instanceof Node) td.append(cell); else td.textContent = cell;
    });
  }
  wrap.append(tbl);
  return wrap;
}

let wiringShownKey = "";
function showWiring(force = false) {
  const kind = wiringKind(), box = $("sigPruefErgebnis"), msg = $("sigPruefMeldung");
  const w = kind ? wiring[kind] : null;
  const now = performance.now();
  const waiting = kind && !w && wiring.asked[kind] && now - wiring.asked[kind] < 3500;
  const silent = kind && !w && wiring.asked[kind] && now - wiring.asked[kind] >= 3500;
  const live = kind && w && !w.done && wiring.asked[kind] && now - wiring.asked[kind] < 6000;
  const key = [kind, w?.rev, waiting, silent, live, language, state.device, !!(viewConn() || state.source === "demo")].join();
  if (key === wiringShownKey && !force) return;
  wiringShownKey = key;
  $("sigPruefStart").textContent = t(live || waiting ? "sg_pruefLaeuft" : w ? "sg_pruefNochmal" : "sg_pruefStart");
  box.textContent = "";
  let text = "", art = "";
  if (!kind) text = t("sg_pruefNur");
  else if (!viewConn() && state.source !== "demo") text = t("sg_pruefKeinBoard");
  else if (waiting) text = t("sg_pruefWartet");
  else if (silent) { text = t("sg_pruefKeineAntwort", deviceName(kind)); art = "warn"; }
  else if (w && !w.done && !live) { text = t("sg_pruefUnvollstaendig"); art = "warn"; }
  msg.textContent = text; msg.dataset.art = art;
  if (!w) return;
  box.append(kind === "hand" ? wiringHandView(w) : wiringGloveView(w));
  if (w.other.length) {
    const d = el("details", "sig-sonst"); d.append(el("summary", "", t("sg_hSonst")), el("pre", "klein", w.other.join("\n")));
    box.append(d);
  }
}

const SIG_ADDR = { "0x40": "sg_hAdresse40", "0x70": "sg_hAdresse70" };
function wiringHandView(w) {
  const frag = document.createDocumentFragment();
  const addr = w.driver?.addr ?? "0x40";
  const found = w.i2c ? w.i2c.addrs : [];
  const ok = w.driver ? w.driver.ok : found.includes("0x40");
  frag.append(wiringCheckBox(ok ? "ok" : "fehler", ok ? t("sg_hUrteilOk", w.servos.length) : t("sg_hUrteilFehlt")));
  // bus
  const bus = el("section", "sig-teil");
  bus.append(el("h4", "", t("sg_hBus")));
  if (w.i2c) bus.append(wiringKv(t("sg_hPins"), `SDA GPIO${w.i2c.sda} · SCL GPIO${w.i2c.scl}`));
  const chips = el("span", "sig-chips");
  if (!found.length) chips.append(wiringChip(t("sg_hKeine"), w.i2c ? "fehler" : ""));
  for (const a of found) chips.append(wiringChip(SIG_ADDR[a] ? `${a} ${t(SIG_ADDR[a])}` : a, a === "0x40" ? "ok" : ""));
  bus.append(wiringKv(t("sg_hGeraete"), chips));
  if (w.driver || w.i2c) {
    const state2 = w.driver ? w.driver.ok : found.includes(addr);
    bus.append(wiringKv(t("sg_hTreiber"), wiringChip(state2 ? t("sg_hTreiberOk", w.driver?.addr ?? addr, w.driver?.pwm) : t("sg_hTreiberFehlt", addr), state2 ? "ok" : "fehler")));
  }
  if (!ok) {
    const hint = el("div", "sig-hinweis");
    if (w.i2c && found.length && !found.includes("0x40")) hint.append(el("p", "", t("sg_hHinweisAdresse")));
    hint.append(el("p", "", t(w.i2c && !found.length ? "sg_hHinweisLeer" : "sg_hHinweisTreiber")));
    const ul = el("ul");
    for (const k of ["sg_hH1", "sg_hH2", "sg_hH3", "sg_hH4"]) ul.append(el("li", "", t(k)));
    hint.append(ul);
    bus.append(hint);
  }
  frag.append(bus);
  // servos
  if (w.servos.length) {
    const sv = el("section", "sig-teil");
    sv.append(el("h4", "", t("sg_hServos")));
    sv.append(wiringTable([t("sg_hSchluessel"), t("sg_hName"), t("sg_hKanal"), t("sg_hPuls"), t("sg_hWinkel")],
      w.servos.map(s => { const k = el("span", "sig-schluessel"); k.append(wiringDot(s.key), s.key); return [k, s.name, String(s.channel), sigFmt(s.pulse), sigFmt(s.angle, 1)]; }), [2, 3, 4]));
    frag.append(sv);
  }
  return frag;
}

const SIG_VERDICT = { ok: ["sg_gOk", "ok"], open: ["sg_gOffen", "fehler"], short: ["sg_gKurz", "fehler"], noisy: ["sg_gRauscht", "warn"] };
function wiringGloveView(w) {
  const frag = document.createDocumentFragment();
  const bad = w.sensors.filter(s => s.verdict !== "ok").length;
  if (!w.sensors.length) frag.append(wiringCheckBox("warn", t("sg_gKeine")));
  else frag.append(wiringCheckBox(bad ? (w.sensors.some(s => SIG_VERDICT[s.verdict]?.[1] === "fehler") || bad === w.sensors.length ? "fehler" : "warn") : "ok",
    bad ? t("sg_gUrteilProblem", bad, w.sensors.length) : t("sg_gUrteilOk", w.sensors.length)));
  if (w.sensors.length) {
    const sec = el("section", "sig-teil");
    sec.append(el("h4", "", t("sg_gSensoren")));
    sec.append(wiringTable([t("sg_gSensor"), t("sg_gPin"), t("sg_gMv"), t("sg_gRauschen"), t("sg_gUrteil"), t("sg_gHinweis")],
      w.sensors.map(s => {
        const v = SIG_VERDICT[s.verdict], k = el("span", "sig-schluessel");
        k.append(wiringDot(s.key), s.key);
        return [k, "GPIO" + s.pin, sigFmt(s.mv), sigFmt(s.noise), wiringChip(v ? t(v[0]) : s.verdict || "?", v ? v[1] : "warn"), t(v ? "sg_gH_" + s.verdict : "sg_gH_unbekannt")];
      }), [1, 2, 3]));
    frag.append(sec);
  }
  const rest = el("section", "sig-teil");
  if (w.battery !== null) {
    const low = w.battery < 3400;
    rest.append(wiringKv(t("sg_gAkku"), t("sg_gAkkuWert", sigFmt(w.battery), (w.battery / 1000).toLocaleString(language, { maximumFractionDigits: 2, minimumFractionDigits: 2 })),
      ...(low ? [" ", wiringChip(t("sg_gAkkuLeer"), "warn")] : [])));
  }
  if (w.button !== null) rest.append(wiringKv(t("sg_gTaste"), t(w.button === "pressed" ? "sg_gGedrueckt" : "sg_gLos")));
  if (rest.children.length) frag.append(rest);
  return frag;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function sigShowTab() {
  for (const b of document.querySelectorAll("#sigTabs button")) b.setAttribute("aria-pressed", b.dataset.tab === sig.tab);
  $("sigScope").hidden = sig.tab !== "scope";
  $("sigPruef").hidden = sig.tab !== "pruef";
}

function sigFrame() {
  sig.raf = 0;
  if (!$("signaleFenster").open) return;
  const now = performance.now();
  sigCheckSource();
  if (sig.tab === "scope") {
    sigDraw(now);
    if (now - sig.tableAt > 200) { sig.tableAt = now; sigUpdateTable(now); }
    sigInfoLine();
  } else showWiring();
  sigControls();
  sig.raf = requestAnimationFrame(sigFrame);
}

function sigOpen() {
  sigShowTab();
  sigControls(true);
  sig.tableKey = ""; sig.trigKey = ""; wiringShownKey = "";
  if (!sig.raf) sig.raf = requestAnimationFrame(sigFrame);
}

$("signaleKnopf").dataset.fenster = "signaleFenster";
$("signaleKnopf").onclick = () => toggleWindow("signaleFenster", $("signaleKnopf"), sigOpen);
for (const b of document.querySelectorAll("#sigTabs button")) b.onclick = () => { sig.tab = b.dataset.tab; sigShowTab(); sigControls(true); wiringShownKey = ""; };
$("sigRun").onclick = () => sigSetMode("run");
$("sigPause").onclick = () => sigSetMode("pause");
$("sigSingle").onclick = () => sigSetMode("single");
$("sigZeit").value = String(sig.span);
$("sigZeit").onchange = () => {
  sig.span = +$("sigZeit").value;
  if (sig.mode === "done" && sig.tTrig !== null) sig.frozenEnd = sig.tTrig + sig.span * 0.75;
};
$("sigTrigKanal").onchange = () => {
  sig.trigId = $("sigTrigKanal").value;
  const c = sig.ch.get(sig.trigId);
  if (c && !sig.levelManual && sig.last) {   // a level in the middle of what the channel does now
    const s = sigStats(c, sig.last.t0, sig.last.t1);
    if (s.n) { sig.trigLevel = (s.min + s.max) / 2; $("sigPegel").value = String(Number(sig.trigLevel.toPrecision(4))); }
  }
};
$("sigTrigFlanke").onchange = () => { sig.trigEdge = $("sigTrigFlanke").value; };
$("sigPegel").oninput = () => { const v = parseFloat($("sigPegel").value); if (Number.isFinite(v)) { sig.trigLevel = v; sig.levelManual = true; } };
$("sigCursor").onclick = () => {
  sig.cursors = !sig.cursors;
  if (sig.cursors) { sigPause(true); sig.a = sig.b = null; sigEnsureCursors(); }
  sigControls(true);
};
$("sigSkala").onchange = () => { sig.scale = $("sigSkala").value; };
$("sigLeeren").onclick = () => { sigClear(); sig.message = ""; };
$("sigCsv").onclick = sigCsv;
$("sigAlle").onclick = () => { for (const c of sig.ch.values()) c.visible = true; };
$("sigKeine").onclick = () => { for (const c of sig.ch.values()) c.visible = false; };
// ask the board: the button sends the "on" or the "toggle" command depending on whether the series flows now
const SIG_ASK = { sigRaw: ["O", "o"], sigMv: ["R", "r"], sigUs: ["P", "p"], sigGrad: ["w", "w"] };
for (const id in SIG_ASK) {
  $(id).onclick = () => send($(id).getAttribute("aria-pressed") === "true" ? SIG_ASK[id][1] : SIG_ASK[id][0]);
}
$("sigPruefStart").onclick = wiringStart;
$("signaleFenster").addEventListener("close", () => { sigDrag = null; });
