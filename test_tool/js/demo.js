"use strict";
// test_tool: demo.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Demo: made-up board so the page can be tried without hardware.
// Glove demo: waves on all six sensors. Robot hand demo: plays the firmware
// (glove waves, servos with 300 °/s, sliders, grips, servo test). Both also
// play the radio protocol for the packets panel when it records.
// ===========================================================================
let demoTimer = null, demoRadioTimer = null, demoLinkTimer = null;
const demo = { radioLog: false, values: {}, creep: true, speed: null };  // speed: °/s set with "b", null = config.h (300)

// Which servos the robot hand demo has (picked above the finger cards, remembered)
demo.channels = new Set(["F0", "S0", "F1"]);
try {
  const saved = JSON.parse(localStorage.getItem("demoServos"));
  if (Array.isArray(saved)) demo.channels = new Set(saved.filter(k => K_TO_ID[k]));
} catch (e) {}

// After an obstacle a demo servo catches up like the 3D model and the firmware:
// its speed rises along an S-curve over CATCH_UP_RAMP_S to CATCH_UP_DEG, and it brakes before the target.
const CATCH_UP_DEG = 300;     // degrees per second (the servo can't go faster)
const CATCH_UP_DEG_BRAKE = 720;  // degrees per second²

function startDemo() {
  state.source = "demo";
  resetValues();
  resetPackets();
  packets.userOff = false;
  setStatus("st_demo", "warn");
  $("demo").textContent = t("demoStoppen");
  demo.radioLog = false;
  demo.values = {};
  state.mac = null;
  $("mac").hidden = true;
  const start = performance.now();
  let last = start;
  if (state.device === "hand") {
    const empty = v => Object.fromEntries(CHANNELS.map(c => [c.k, v]));
    Object.assign(demo, { manual: false, test: -1, testSince: 0, hand: empty(null), angle: empty(null),
                          deg: empty(0), goal: empty(0), catching: empty(false), catchTime: empty(0), partner: null,
                          limits: Object.fromEntries(CHANNELS.map(c => [c.k, { open: 0, closed: 180, std: true }])), data: 0 });
    $("demoAuswahl").hidden = false;
    for (const l of ["MAC 24:58:7C:E1:0A:3B, Funkkanal 1", `Roboterhand bereit (${demo.channels.size} Servos), Funkkanal 1`,
                     "Firmware: hand " + EXPECTED_FW.hand + ", protocol 2, build demo", demo.partnerLine(),
                     "Handschuh verbunden: 40:4C:CA:12:34:56"]) handleLine(l);
  } else if (state.device === "bglove") {
    Object.assign(demo, { bValues: Object.fromEntries(CHANNELS.map(c => [c.k, 0])), bSending: true, bOk: 0, partner: null });
    for (const l of ["MAC 7C:2C:67:0B:44:10, radio channel 1", "Bridge partner Broadcast (everyone)"]) handleLine(l);
  } else {
    if (state.device === "glove") for (const l of ["MAC 40:4C:CA:12:34:56, radio channel 1", "Firmware: glove " + EXPECTED_FW.glove + ", protocol 2, build demo",
                                                   "Target 24:58:7C:E1:0A:3B"]) handleLine(l);
    else if (state.device === "bhand") for (const l of ["MAC 7C:2C:67:0B:44:10, radio channel 1", "Bridge partner Broadcast (everyone)"]) handleLine(l);
    else if (state.device === "bsniff") demoSniffStart(start);
    else handleLine("Firmware: simulator " + EXPECTED_FW.sim + ", protocol 2, build demo");
  }
  Object.assign(demo, { linkOn: false, playback: null, playbackTime: 0, rawOn: false, mvOn: true, pulses: false, angles: false, rawAcc: 0, rawLast: start });
  setControls();
  demoTimer = setInterval(() => {
    const now = performance.now(), s = (now - start) / 1000, dt = (now - last) / 1000;
    last = now;
    if (state.device === "hand") demoHandStep(now, s, dt);
    else if (state.device === "bglove") demoBridgeGloveStep(now);
    else if (state.device !== "bsniff") demoGloveStep(s);  // the sniffer's values come from its frames
    if (state.device === "bhand" && Math.round(s * 20) % 5 === 0) handleLine(`Link:1 Data:${Math.round(s * 10)} Rounds:${Math.round(s * 10)} Foreign:0 Rssi:-47 Undelivered:0`);
  }, 50);
  // radio rounds as in the protocol: SYN, ACK, DATA, ACK, WAKEUP, ACK, then 100 ms pause
  demoRadioTimer = setInterval(demoRadioRound, 106);
  // link statistics of the glove demo (command L), once per second; the signal drifts slowly
  demoLinkTimer = setInterval(() => {
    if (state.device === "bsniff") { demoSniffStatus(); return; }
    if (!demo.linkOn || state.device !== "glove") return;
    const s = (performance.now() - start) / 1000;
    const rssi = Math.round(-52 - 14 * (0.5 - 0.5 * Math.cos(s / 9)) + (Math.random() - 0.5) * 4);
    const weak = rssi < -62;
    const fail = weak && Math.random() < 0.2 ? 1 : 0, resent = weak ? Math.floor(Math.random() * 4) : Math.random() < 0.1 ? 1 : 0;
    const ok = 9 - fail, acks = ok * 3, rtt = 1500 + Math.round(Math.random() * 600) + resent * 300;
    handleLine(`[link] ok:${ok} fail:${fail} sent:${acks + resent + fail} resent:${resent} acks:${acks} rtt_us:${rtt} ` +
               `rtt_max_us:${rtt + 900 + resent * 8000} round_us:${rtt * 3 + 400} rssi:${rssi} rssi_min:${rssi - 3} playback:${demo.playback ? 1 : 0}`);
  }, 1000);
}

function stopDemo() {
  clearInterval(demoTimer);
  clearInterval(demoRadioTimer);
  clearInterval(demoLinkTimer);
  demoTimer = demoRadioTimer = demoLinkTimer = null;
  if (link.running) stopLink();
  stopPlay();
  if (rec.recording) stopRecording();
  $("demoAuswahl").hidden = true;
  state.source = null;
  state.target = undefined;
  state.lastGlove = null;
  state.mac = null;
  packets.recording = false;
  setStatus("st_getrennt", "");
  $("demo").textContent = t("demo");
  $("mac").hidden = true;
  setControls();
  showTarget();
}

function demoGloveStep(s) {
  const wave = (phase, speed = 1) => 0.5 - 0.5 * Math.cos(s * speed + phase);
  const v = { ThumbFlex: wave(0, 1.1), ThumbOpp: wave(1.8, 0.7), Index: wave(0.6, 1.3), Middle: wave(1.2, 1.3),
              Ring: wave(1.8, 1.3), Pinky: wave(2.4, 1.3) };
  // playback (command p): the radio sends these, the sensors keep measuring
  if (demo.playback && performance.now() - demo.playbackTime > 500) demo.playback = null;
  const line = {};
  for (const [k, x] of Object.entries(v)) {
    line[k] = x;
    const id = KEY_TO_CHANNEL[k];
    demo.values[id] = demo.playback ? demo.playback[CHANNEL[id].k] : x;
    if (demo.values[id] === undefined) delete demo.values[id];
    if (state.device === "sim" || state.device === "bhand") continue;  // these only know the values from the radio
    if (demo.mvOn) line[k + "_mV"] = Math.round(30 + x * 2000 * (0.55 + 0.45 * Math.exp(-((s * 1.3) % 4))));
    if (demo.creep) line[k + "_comp"] = Math.round(30 + x * 2000);
  }
  if (demo.rawOn && state.device === "glove") { demoRawStream(v); return; }   // the raw stream replaces the normal line (like the firmware)
  const now = performance.now();
  takeGlove(line, now);
  signalFeed(line, now, state.device);
}

// Glove command O/o: ~120 "<name>_raw:<mV>" lines per second, several per timer tick (like a USB chunk with a few lines in it)
function demoRawStream(v) {
  const now = performance.now(), n = Math.floor(demo.rawAcc += (now - demo.rawLast) / 1000 * 120);
  demo.rawAcc -= n; demo.rawLast = now;
  for (let i = 0; i < n; i++) {
    const noise = () => Math.round((Math.random() - 0.5) * 24);
    handleLine(Object.entries(v).map(([k, x]) => `${k}_raw:${Math.max(0, Math.round(30 + x * 2000 + noise()))}`).join(" "));
  }
}

// Glove command D (firmware 2.2): every sensor pin, one of them with a broken wire
const DEMO_GLOVE_PINS = { ThumbFlex: 4, ThumbOpp: 5, Index: 6, Middle: 0, Ring: 1, Pinky: 2 };
function demoGloveCheck() {
  const out = [];
  for (const [name, pin] of Object.entries(DEMO_GLOVE_PINS)) {
    const open = name === "Index";
    const mv = open ? 3180 + Math.round(Math.random() * 60) : 600 + Math.round(Math.random() * 900), noise = open ? 380 + Math.round(Math.random() * 60) : 8 + Math.round(Math.random() * 10);
    out.push(`Check: sensor ${name} GPIO${pin} ${mv} mV noise ${noise} mV ${open ? "open" : "ok"}`);
  }
  out.push("Check: battery 3920 mV", "Check: button released", "Check: done");
  return out;
}

// Robot hand command D (firmware 2.3): I2C scan, driver, one line per servo. Pulse widths are whole PCA9685 ticks of 4.889 µs (500 µs shows as 499).
const DEMO_HAND_SERVOS = { F0: ["DaumenEin", 0], S0: ["DaumenOpp", 8], F1: ["Zeige", 1], F2: ["Mittel", 2], F3: ["Ring", 3], F4: ["Klein", 4] };
const demoPulse = deg => Math.floor((500 + deg / 180 * 2000) / 4.889) * 4.889;
function demoHandDiagnose(keys, degOf) {
  return ["Diagnose: I2C SDA 19 SCL 20, 2 Geraet(e): 0x40 0x70", "Diagnose: Servotreiber 0x40 ok, PWM 50 Hz",
          ...keys.map(k => `Diagnose: Servo ${k} ${DEMO_HAND_SERVOS[k][0]} Kanal ${DEMO_HAND_SERVOS[k][1]} Puls ${Math.round(demoPulse(degOf(k)))} us Winkel ${degOf(k).toFixed(1)}`),
          "Diagnose: fertig"];
}

// Test bridge as glove: it sends what the sliders say; the made-up hand always answers
function demoBridgeGloveStep(now) {
  if (demo.bSending) demo.bOk++;
  demo.values = Object.fromEntries(Object.entries(demo.bValues).map(([k, v]) => [K_TO_ID[k], v]));
  const parts = Object.entries(demo.bValues).map(([k, v]) => `${k}:${v.toFixed(3)}`);
  handleLine(parts.join(" ") + ` Link:${demo.bSending ? 1 : 0} Ok:${Math.floor(demo.bOk / 2)} Fail:0 Send:${demo.bSending ? 1 : 0} Rssi:-47 Err:0 Foreign:0 Undelivered:0`);
}

demo.partnerLine = function () { return this.partner ? "Partner " + this.partner : "Partner Broadcast (jeder Handschuh)"; };

function demoHandStep(now, s, dt) {
  const wave = (phase, speed) => 0.5 - 0.5 * Math.cos(s * speed + phase);
  // glove waves, only for the servos picked above the cards
  const hs = {};
  CHANNELS.forEach((c, i) => { if (demo.channels.has(c.k)) hs[c.k] = wave(i * 0.9, 0.7 + 0.15 * i); });
  demo.values = Object.fromEntries(Object.entries(hs).map(([k, v]) => [K_TO_ID[k], v]));
  if (demo.test >= 0 && now - demo.testSince > 2000) {
    demo.test++; demo.testSince = now; if (demo.test > 3) demo.test = -1;
  }
  const parts = [];
  const view = mainHand();
  for (const k in hs) {
    // servo limits (command g): value 0 -> open angle, 1 -> closed angle
    const lim = demo.limits[k], span = (lim.closed - lim.open) || 1;
    const toDeg = v => lim.open + v * span, toVal = d => (d - lim.open) / span;
    if (demo.test >= 0) demo.goal[k] = [0, 90, 180, lim.open][demo.test];
    else if (demo.manual && demo.angle[k] !== null) demo.goal[k] = demo.angle[k];
    else {
      const w = demo.manual ? demo.hand[k] : hs[k];
      if (w !== null) demo.goal[k] = toDeg(w);
    }
    // If the part hits another one in the 3D model (finger on thumb ...), the
    // simulated servo stops there instead of pushing on
    const a = view?.stops?.[K_TO_ID[k]];
    if (a && a.dir * (toVal(demo.goal[k]) - a.value) * Math.sign(span) > 0) { demo.goal[k] = toDeg(a.value); demo.catching[k] = true; }
    // After the obstacle: no jump, the shortest way to the current value with a soft start and stop
    const gap = demo.goal[k] - demo.deg[k];
    if (demo.catching[k] && !a && Math.abs(gap) < 1) demo.catching[k] = false;
    const top = demo.speed ?? CATCH_UP_DEG;  // top speed (command b)
    let speed = top;  // degrees per second
    if (demo.catching[k]) {
      const intoObstacle = a && a.dir * gap > 0;  // only stands still while it would go into the obstacle
      demo.catchTime[k] = intoObstacle ? 0 : demo.catchTime[k] + dt;
      const u = Math.min(1, demo.catchTime[k] / CATCH_UP_RAMP_S), ramp = u * u * u * (u * (u * 6 - 15) + 10);
      speed = Math.min(top * ramp, Math.sqrt(2 * CATCH_UP_DEG_BRAKE * Math.abs(gap)) + 4);
    }
    demo.deg[k] += Math.max(-speed * dt, Math.min(speed * dt, gap));
    if (a && a.dir * (toVal(demo.deg[k]) - a.value) * Math.sign(span) > 0) demo.deg[k] = toDeg(a.value);  // servo stands at the obstacle
    parts.push(`${k}:${hs[k].toFixed(3)} ${k}_Pos:${toVal(demo.deg[k]).toFixed(3)} ` +
               `${k}_Ziel:${toVal(demo.goal[k]).toFixed(3)} ${k}_Grad:${demo.deg[k].toFixed(1)}` +
               (demo.pulses ? ` ${k}_us:${Math.round(demoPulse(demo.deg[k]))}` : "") +
               (demo.angles ? ` ${DEMO_HAND_SERVOS[k][0]}_Grad:${demo.deg[k].toFixed(1)}` : ""));
  }
  demo.data += dt * 9.4;
  const rssi = Math.round(-58 - 6 * Math.sin(s / 7) + (Math.random() - 0.5) * 3);
  parts.push(`Verbunden:1 Manuell:${demo.manual ? 1 : 0} Test:${demo.test >= 0 ? 1 : 0} Servotreiber:1 Daten:${Math.floor(demo.data)} RSSI:${rssi} NichtAngekommen:0 Fremd:0`);
  handleLine(parts.join(" "));
}

// Commands to the demo board (the robot hand demo understands the same ones as the firmware)
// Pin assignment in the demo (glove P, robot hand K): defaults like config.h,
// changes only live until the page is reloaded.
const DEMO_PIN_DEFAULT = {
  glove: { F0: "4", S0: "5", F1: "6", F2: "0", F3: "1", F4: "2" },
  hand: { F0: "0", S0: "8", F1: "1", F2: "2", F3: "3", F4: "4", SDA: "19", SCL: "20" },
};
const demoPins = { glove: {}, hand: {} };
function demoPinLines(device) {
  const def = DEMO_PIN_DEFAULT[device], saved = demoPins[device];
  for (const k in def) {
    const dflt = device === "glove" && !demo.channels.has(k) ? "-" : def[k];
    const v = saved[k] ?? dflt, s = k in saved;
    if (device === "glove") handleLine(`Pin ${k} ${v === "-" ? "-" : "GPIO" + v} ${s ? "saved" : "default"}`);
    else handleLine(`Belegung ${k} ${isI2c(k) ? "" : "Kanal "}${v} ${s ? "gespeichert" : "standard"}`.replace("  ", " "));
  }
  if (device === "glove") handleLine("Pins: analog pins on this board: GPIO0..6");
}
function demoPinCommand(device, arg) {
  if (!arg) { demoPinLines(device); return; }
  if (arg === "reset") demoPins[device] = {};
  else for (const [k, v] of arg.split(/\s+/).map(p => p.split("="))) {
    if (!(k in DEMO_PIN_DEFAULT[device])) { handleLine(device === "glove" ? `ERROR: can't read "${k}=${v}". Example: PF1=34, PF1=- or Preset` : `FEHLER: "${k}=${v}" nicht verstanden. Beispiel: KF1=5, KF1=-, KSDA=21 oder Kreset`); return; }
    if (v === "default" || v === "standard") delete demoPins[device][k]; else demoPins[device][k] = v;
  }
  handleLine(device === "glove" ? "Pins saved, restarting ..." : "Belegung gespeichert, Neustart ...");
  demoPinLines(device);
}

function demoCommand(text) {
  for (const line of text.split("\n")) {
    if (line === "l") { demo.radioLog = !demo.radioLog; continue; }
    // the test bridge switches its mode (G glove, H hand, S sniffer): the demo of that mode starts
    const mode = { G: "bglove", H: "bhand", S: "bsniff" }[line];
    if (mode && ["bglove", "bhand", "bsniff"].includes(state.device)) {
      if (mode !== state.device) setTimeout(() => { if (state.source === "demo") { setDevice(mode, "start"); startDemo(); } }, 0);
      continue;
    }
    if (state.device === "bsniff") { demoSniffCommand(line); continue; }
    if (state.device === "bglove") {
      if (line.startsWith("s ")) for (const [k, w] of line.slice(2).split(" ").map(p => p.split(":"))) if (k in demo.bValues) demo.bValues[k] = clamp01(+w);
      if (line === "x") demo.bSending = !demo.bSending;
      if (line.startsWith("m")) { const mac = normalizeMac(line.slice(1)); handleLine("Bridge partner " + (mac ?? "Broadcast (everyone)")); }
      continue;
    }
    if (state.device === "glove") {
      if (line === "L") { demo.linkOn = !demo.linkOn; handleLine("Link statistics " + (demo.linkOn ? "ON" : "OFF")); }
      else if (line === "d") { demo.creep = !demo.creep; handleLine("Creep compensation " + (demo.creep ? "ON" : "OFF")); }
      else if (line === "f") { demo.radioOff = !demo.radioOff; handleLine(demo.radioOff ? "Radio OFF (nothing is sent)" : "Radio ON"); }
      else if (line.startsWith("p")) {
        demo.playback = Object.fromEntries(line.slice(1).trim().split(/\s+/).map(p => p.split(":")).filter(([k]) => K_TO_ID[k]).map(([k, v]) => [k, clamp01(+v)]));
        demo.playbackTime = performance.now();
      } else if (line === "D") for (const l of demoGloveCheck()) handleLine(l);
      else if (line === "O" || line === "o") demo.rawOn = line === "O" ? true : !demo.rawOn;
      else if (line === "R" || line === "r") demo.mvOn = line === "R" ? true : !demo.mvOn;
      else if (line.startsWith("P")) demoPinCommand("glove", line.slice(1).trim());
      else if (line === "i") {
        handleLine("Firmware: glove " + EXPECTED_FW.glove + ", protocol 2, build demo");
        handleLine("Creep compensation " + (demo.creep ? "on" : "off"));
        demoPinLines("glove");
      }
      continue;
    }
    if (state.device !== "hand") continue;
    if (line.startsWith("K")) { demoPinCommand("hand", line.slice(1).trim()); continue; }
    if (line.startsWith("g")) {  // servo limits
      const m = /^g(\w*)(?:=(-?[\d.]+),(-?[\d.]+))?$/.exec(line.trim());
      const show = k => { const l = demo.limits[k]; handleLine(`Grenze ${k} Kanal ${KEYS.indexOf(k)} offen ${l.open.toFixed(1)} zu ${l.closed.toFixed(1)}${l.std ? " (config.h)" : ""}`); };
      if (!m || !m[1]) { for (const k of demo.channels) show(k); continue; }
      if (!demo.limits[m[1]] || !demo.channels.has(m[1])) { handleLine(`FEHLER: kein Servo "${m[1]}"`); continue; }
      demo.limits[m[1]] = m[2] === undefined ? { open: 0, closed: 180, std: true }
        : { open: Math.max(0, Math.min(180, +m[2])), closed: Math.max(0, Math.min(180, +m[3])), std: +m[2] === 0 && +m[3] === 180 };
      show(m[1]);
      continue;
    }
    if (line.startsWith("b")) {  // top speed of the servos (firmware 2.1)
      const v = line.slice(1).trim();
      if (v && !/^\d/.test(v)) { handleLine(`FEHLER: "${v}" ist keine Zahl. Beispiel: b150 (Grad pro Sekunde), b0 = config.h`); continue; }
      if (v) demo.speed = +v <= 0 ? null : Math.max(10, Math.min(600, +v));
      handleLine(`Tempo ${demo.speed ?? CATCH_UP_DEG} Grad/s${demo.speed === null ? " (config.h)" : ""}`);
      continue;
    }
    if (line.startsWith("x")) {  // move to an angle
      const m = /^x(\w+)=(-?[\d.]+)/.exec(line.trim());
      if (m && m[1] in demo.angle && demo.test < 0) {
        if (!demo.manual) { demo.manual = true; for (const k in demo.hand) demo.hand[k] = null; }
        demo.hand[m[1]] = null;
        demo.angle[m[1]] = Math.max(0, Math.min(180, +m[2]));
      }
      continue;
    }
    if (line.startsWith("m")) {  // partner MAC
      demo.partner = normalizeMac(line.slice(1));
      handleLine(demo.partnerLine());
      continue;
    }
    if (line.startsWith("s ")) {
      if (!demo.manual) { demo.manual = true; for (const k in demo.hand) demo.hand[k] = null; }
      for (const [k, w] of line.slice(2).split(" ").map(p => p.split(":"))) if (k in demo.hand) { demo.hand[k] = clamp01(+w); demo.angle[k] = null; }
      continue;
    }
    for (const c of line) {
      if (c === "l") demo.radioLog = !demo.radioLog;
      if (c === "h") demo.manual = false;
      if (c === "r") { demo.manual = false; demo.test = -1; for (const k in demo.hand) demo.hand[k] = demo.angle[k] = null; }
      if (c === "v") demo.manual = true;
      if (c === "t" && demo.test < 0) { demo.test = 0; demo.testSince = performance.now(); }
      if (c === "P") demo.pulses = true;
      if (c === "p") demo.pulses = !demo.pulses;
      if (c === "w") demo.angles = !demo.angles;
      if (c === "D") for (const l of demoHandDiagnose([...demo.channels], k => demo.deg[k] ?? 0)) handleLine(l);
      if (c === "i") {
        for (const l of ["Firmware: hand " + EXPECTED_FW.hand + ", protocol 2, build demo", "MAC 24:58:7C:E1:0A:3B, Funkkanal 1",
                         "Funk: VERBUNDEN, Handschuh 40:4C:CA:12:34:56", demo.partnerLine(), "Servotreiber: ok (Demo)"]) handleLine(l);
        demoCommand("g");
        demoCommand("b");
      }
    }
  }
}

// One protocol round as the radio log of the demo board would print it (binary format)
function demoRadioRound() {
  if (state.device === "bsniff") { demoSniffRound(); return; }  // the sniffer always prints
  if (!demo.radioLog) return;
  const hex = bytes => bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  let mask = 0;
  const vals = [];
  CHANNELS.forEach((c, i) => {
    if (demo.values[c.id] === undefined) return;
    mask |= 1 << i;
    vals.push(Math.round(clamp01(demo.values[c.id]) * 255));
  });
  const fingers = CHANNELS.filter(c => demo.values[c.id] !== undefined).map((c, i) => `${c.k}:${(vals[i] / 255).toFixed(3)}`).join(" ");
  const msgs = [[[0x53], "SYN"], [[0x44, mask, ...vals], "DATA " + fingers], [[0x57, 100, 0], "WAKEUP 100 ms"]];
  const ack = m => [[0x41, m[0][0]], "ACK " + String.fromCharCode(m[0][0])];
  const line = m => hex(m[0]) + "  " + m[1];
  const glove = "40:4C:CA:12:34:56", hand = "24:58:7C:E1:0A:3B";
  for (const m of msgs) {
    if (state.device === "glove" || state.device === "bglove") { handleLine("[radio] -> " + line(m)); handleLine(`[radio] <- ${hand} ${line(ack(m))}`); }
    else if (state.device === "bhand") { handleLine(`[radio] <- ${glove} ${line(m)}`); handleLine("[radio] -> " + line(ack(m))); }
    else if (state.device === "hand") { handleLine(`[funk] <- ${glove} ${line(m)}`); handleLine("[funk] -> " + line(ack(m))); }
    else { handleLine("<- " + hex(m[0])); handleLine("-> " + line(ack(m))); }
  }
}

// ---------------------------------------------------------------------------
// Test bridge as sniffer: on channel 1 our glove talks to our robot hand (the
// MACs of the glove and hand demos, so they count as "ours") and a foreign group
// talks too; on channel 6 a third pair. Every frame as the bridge prints it:
// "[sniff] t:<µs> ch:<n> rssi:<dBm> <802.11 frame without FCS>" (contract C1).
// ---------------------------------------------------------------------------
const SNIFF_DEMO = {
  glove: "40:4C:CA:12:34:56", hand: "24:58:7C:E1:0A:3B", bridge: "7C:2C:67:0B:44:10",
  foreignGlove: "A0:B7:65:1C:22:9E", foreignHand: "D4:8A:FC:3E:71:05",
  ch6Glove: "54:32:04:0B:8E:10", ch6Hand: "F0:F5:BD:2A:C4:61",
};
const sniffModeLine = () => `Bridge mode sniffer: listens to all ESP-NOW traffic on channel ${demo.sniffCh}, sends nothing`;

function demoSniffStart(start) {
  Object.assign(demo, { sniffCh: 1, sniffBoot: start - 4.2e6 / 1000, sniffFrames: 0, sniffOther: 0, sniffSeq: {}, sniffRound: 0 });
  for (const l of [`Test bridge ready, radio channel 1, MAC ${SNIFF_DEMO.bridge}`, "Firmware: bridge " + EXPECTED_FW.bridge + ", protocol 2, build demo",
                   sniffModeLine()]) handleLine(l);
}

function demoSniffCommand(line) {
  const k = /^k(.*)$/.exec(line.trim());
  if (k) {
    if (/^\d+$/.test(k[1]) && +k[1] >= 1 && +k[1] <= 13) { demo.sniffCh = +k[1]; handleLine(sniffModeLine()); }
    else handleLine(`ERROR: "${k[1]}" is not a channel 1..13. Example: k6`);
  } else if (line.startsWith("m")) {
    handleLine("ERROR: mode sniffer has no partner (m), it hears everyone");
  } else if (line === "i") {
    for (const l of [`MAC ${SNIFF_DEMO.bridge}, radio channel 1`, "Firmware: bridge " + EXPECTED_FW.bridge + ", protocol 2, build demo", sniffModeLine(),
                     "Bridge: ACK loss 0 %, muted off, log off, sending off", "Bridge radio: ok, 0 errors"]) handleLine(l);
  }
}

// One ESP-NOW frame as the radio sends it (without FCS), layout in contract C1.
// The sequence number counts per sender, like on a real radio.
function demoSniffFrame(src, dst, payload) {
  const mac = m => m.split(":").map(h => parseInt(h, 16));
  const rnd = () => Math.floor(Math.random() * 256);
  const seq = demo.sniffSeq[src] = ((demo.sniffSeq[src] ?? Math.floor(Math.random() * 4096)) + 1) & 0xFFF;
  return [0xD0, 0x00, 0x00, 0x00, ...mac(dst), ...mac(src), 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, (seq << 4) & 0xFF, seq >> 4,
          0x7F, 0x18, 0xFE, 0x34, rnd(), rnd(), rnd(), rnd(), 0xDD, 5 + payload.length, 0x18, 0xFE, 0x34, 0x04, 0x01, ...payload];
}

function demoSniffRound() {
  const now = performance.now(), s = (now - demo.sniffBoot) / 1000;
  const wave = (phase, speed) => 0.5 - 0.5 * Math.cos(s * speed + phase);
  const u8 = v => Math.round(clamp01(v) * 255);
  const noise = (dbm, spread) => Math.round(dbm + (Math.random() - 0.5) * spread);
  const frames = [];
  // a round as in the protocol: SYN (to everyone), DATA, WAKEUP, each answered by an ACK
  // (now and then one gets lost). Now and then the radio's own acknowledgement of a frame
  // gets lost too: the glove's radio sends the same frame again (retry flag, same sequence
  // number), so the sniffer hears it twice.
  const round = (glove, hand, data, rssiGlove, rssiHand, wakeup) => {
    const msgs = [[0x53], data];
    if (wakeup) msgs.push([0x57, 100, 0]);
    msgs.forEach((p, i) => {
      const f = demoSniffFrame(glove, i ? hand : "FF:FF:FF:FF:FF:FF", p);
      frames.push([f, noise(rssiGlove, 4)]);
      if (i && Math.random() < 0.05) { const again = f.slice(); again[1] |= 0x08; frames.push([again, noise(rssiGlove, 4)]); }
      if (Math.random() > 0.03) frames.push([demoSniffFrame(hand, glove, [0x41, p[0]]), noise(rssiHand, 4)]);
    });
  };
  demo.sniffRound++;
  if (demo.sniffCh === 1) {
    // our glove: all six fingers wave
    round(SNIFF_DEMO.glove, SNIFF_DEMO.hand, [0x44, 0x3F, ...CHANNELS.map((c, i) => u8(wave(i * 0.9, 0.7 + 0.15 * i)))], -46, -53, true);
    // the other group: thumb, index and middle finger, every second round, no WAKEUP
    if (demo.sniffRound % 2 === 0) round(SNIFF_DEMO.foreignGlove, SNIFF_DEMO.foreignHand, [0x44, 0x0D, u8(wave(0, 0.5)), u8(wave(1, 0.9)), u8(wave(2, 0.9))], -72, -77, false);
  } else if (demo.sniffCh === 6 && demo.sniffRound % 3 === 0) {
    round(SNIFF_DEMO.ch6Glove, SNIFF_DEMO.ch6Hand, [0x44, 0x3F, ...CHANNELS.map((c, i) => u8(wave(i, 1.1)))], -81, -84, true);
  }
  const hex = b => b.map(x => x.toString(16).padStart(2, "0")).join(" ");
  for (const [frame, rssi] of frames) {
    demo.sniffFrames++;
    handleLine(`[sniff] t:${Math.round((performance.now() - demo.sniffBoot) * 1000)} ch:${demo.sniffCh} rssi:${rssi} ${hex(frame)}`);
  }
  demo.sniffOther += Math.random() < 0.6 ? 1 : 0;  // beacons of Wi-Fi networks nearby
}

function demoSniffStatus() {
  handleLine(`Sniff: ch:${demo.sniffCh} frames:${demo.sniffFrames} other:${demo.sniffOther} dropped:0`);
}

// ---------------------------------------------------------------------------
// Two-board demo: a made-up robot hand and a made-up test board (as glove),
// connected like real boards. Each has a "serial port" (two streams) and plays
// its firmware: it answers commands and prints the same lines, and the test
// board's values reach the hand over a made-up radio. So everything that only
// happens with two boards (view switching, a board in the background, packets
// from both sides, versions, flashing window) can be tried without hardware.
// ---------------------------------------------------------------------------
const SIM_MAC = { hand: "24:58:7C:E1:0A:3B", bridge: "7C:2C:67:0B:44:10" };
const sim = { boards: [], timer: null, radioTimer: null };

// A port as the page uses it: readable = what the board prints, writable = commands
function simPort(board) {
  let out;
  const readable = new ReadableStream({ start(c) { out = c; } });
  const writable = new WritableStream({ write(chunk) { board.command(new TextDecoder().decode(chunk)); } });
  board.print = line => { try { out.enqueue(encoder.encode(line + "\n")); } catch (e) {} };
  return {
    readable, writable, sim: true,
    getInfo: () => ({ usbVendorId: 0x303A, usbProductId: board.kind === "hand" ? 0x1001 : 0x1002 }),
    async open() {}, async close() { board.closed = true; try { out.close(); } catch (e) {} },
  };
}

// The robot hand (firmware roboter_hand, the servos the demo has picked above the cards)
function simHand() {
  const keys = () => KEYS.filter(k => demo.channels.has(k));
  const h = {
    kind: "hand", log: false, status: false, manual: false, partner: null, speed: null, data: 0, lastData: -1e9,
    linked: false, glove: {}, hand: {}, deg: {}, goal: {},
    limits: Object.fromEntries(KEYS.map(k => [k, { open: 0, closed: 180, std: true }])),
  };
  const val = (k, d) => { const l = h.limits[k], span = (l.closed - l.open) || 1; return (d - l.open) / span; };
  const deg = (k, v) => { const l = h.limits[k]; return l.open + v * (l.closed - l.open); };
  const partnerLine = () => h.partner ? "Partner " + h.partner : "Partner Broadcast (jeder Handschuh)";
  const showLimit = k => { const l = h.limits[k]; h.print(`Grenze ${k} Kanal ${KEYS.indexOf(k)} offen ${l.open.toFixed(1)} zu ${l.closed.toFixed(1)}${l.std ? " (config.h)" : ""}`); };
  const showSpeed = () => h.print(`Tempo ${h.speed ?? CATCH_UP_DEG} Grad/s${h.speed === null ? " (config.h)" : ""}`);
  h.greet = () => {
    for (const l of [`Roboterhand bereit (${keys().length} Servos), Funkkanal 1`, "Firmware: hand " + EXPECTED_FW.hand + ", protocol 2, build demo",
                     "Meine MAC: " + SIM_MAC.hand, partnerLine()]) h.print(l);
  };
  // a DATA from the test board (made-up radio)
  h.receive = (from, values) => {
    if (h.partner && h.partner !== from) return false;
    h.data++; h.lastData = performance.now();
    for (const k of keys()) if (values[k] !== undefined) h.glove[k] = values[k];
    if (!h.linked) { h.linked = true; h.print("Handschuh verbunden: " + from); }
    return true;
  };
  h.command = text => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^([a-zA-Z])(.*)$/.exec(line), c = m[1], rest = m[2].trim();
      if (c === "s" && rest) {
        if (!h.manual) { h.manual = true; h.hand = {}; h.print("Steuerung: von Hand"); }
        for (const [k, w] of rest.split(/\s+/).map(p => p.split(":"))) if (keys().includes(k)) h.hand[k] = clamp01(+w);
      } else if (c === "g") {
        const g = /^(\w*)(?:=(-?[\d.]+),(-?[\d.]+))?$/.exec(rest);
        if (!g || !g[1]) { for (const k of keys()) showLimit(k); continue; }
        if (!keys().includes(g[1])) { h.print(`FEHLER: kein Servo "${g[1]}". Beispiel: gF1=10,170`); continue; }
        h.limits[g[1]] = g[2] === undefined ? { open: 0, closed: 180, std: true }
          : { open: Math.max(0, Math.min(180, +g[2])), closed: Math.max(0, Math.min(180, +g[3])), std: +g[2] === 0 && +g[3] === 180 };
        showLimit(g[1]);
      } else if (c === "b") {
        if (rest && !/^\d/.test(rest)) { h.print(`FEHLER: "${rest}" ist keine Zahl. Beispiel: b150 (Grad pro Sekunde), b0 = config.h`); continue; }
        if (rest) h.speed = +rest <= 0 ? null : Math.max(10, Math.min(600, +rest));
        showSpeed();
      } else if (c === "x") {
        const x = /^(\w+)=(-?[\d.]+)/.exec(rest);
        if (x && keys().includes(x[1])) { h.manual = true; h.hand[x[1]] = val(x[1], Math.max(0, Math.min(180, +x[2]))); }
      } else if (c === "m") {
        h.partner = normalizeMac(rest);
        h.print(partnerLine());
      } else {
        for (const ch of line) {
          if (ch === "U") h.status = true;
          if (ch === "P") h.pulses = true;
          if (ch === "p") h.pulses = !h.pulses;
          if (ch === "D") for (const l of demoHandDiagnose(keys(), k => h.deg[k] ?? 0)) h.print(l);
          if (ch === "l") h.log = !h.log;
          if (ch === "v" && !h.manual) { h.manual = true; h.print("Steuerung: von Hand"); }
          if (ch === "h" && h.manual) { h.manual = false; h.print("Steuerung: Handschuh"); }
          if (ch === "r") { h.manual = false; h.hand = {}; h.print("Reset: Handschuh steuert"); }
          if (ch === "i") {
            for (const l of ["Firmware: hand " + EXPECTED_FW.hand + ", protocol 2, build demo", `MAC ${SIM_MAC.hand}, Funkkanal 1`,
                             `Funk: ${h.linked ? "VERBUNDEN" : "nicht verbunden"}, Handschuh ${SIM_MAC.bridge}`, partnerLine(),
                             "Servotreiber: ok (Demo)", "Steuerung: " + (h.manual ? "von Hand (h = Handschuh)" : "Handschuh")]) h.print(l);
            for (const k of keys()) showLimit(k);
            showSpeed();
          }
        }
      }
    }
  };
  h.step = dt => {
    const now = performance.now();
    if (h.linked && now - h.lastData > 1500) { h.linked = false; h.print("Verbindung zum Handschuh verloren"); }
    const parts = [];
    for (const k of keys()) {
      const v = h.manual ? h.hand[k] : h.glove[k];
      if (v !== undefined) h.goal[k] = deg(k, v);
      h.goal[k] ??= deg(k, 0); h.deg[k] ??= h.goal[k];
      const step = (h.speed ?? CATCH_UP_DEG) * dt;
      h.deg[k] += Math.max(-step, Math.min(step, h.goal[k] - h.deg[k]));
      if (h.glove[k] !== undefined) parts.push(`${k}:${h.glove[k].toFixed(3)}`);
      parts.push(`${k}_Pos:${val(k, h.deg[k]).toFixed(3)} ${k}_Ziel:${val(k, h.goal[k]).toFixed(3)} ${k}_Grad:${h.deg[k].toFixed(1)}` + (h.pulses ? ` ${k}_us:${Math.round(demoPulse(h.deg[k]))}` : ""));
    }
    parts.push(`Verbunden:${h.linked ? 1 : 0} Manuell:${h.manual ? 1 : 0} Test:0 Servotreiber:1 Daten:${h.data}` +
               (h.linked ? ` RSSI:${Math.round(-55 + (Math.random() - 0.5) * 4)}` : "") + " NichtAngekommen:0 Fremd:0");
    if (h.status) h.print(parts.join(" "));
  };
  return h;
}

// The test board as glove (tools/bridge): sends what the sliders say
function simBridge() {
  const b = { kind: "bridge", log: false, sending: true, partner: null, ok: 0, values: Object.fromEntries(KEYS.map(k => [k, 0])) };
  const partnerLine = () => "Bridge partner " + (b.partner ?? "Broadcast (everyone)");
  b.greet = () => {
    for (const l of [`Test bridge ready, radio channel 1, MAC ${SIM_MAC.bridge}`, "Firmware: bridge " + EXPECTED_FW.bridge + ", protocol 2, build demo",
                     "Bridge mode glove: sends the values from the PC to a robot hand", partnerLine()]) b.print(l);
  };
  b.command = text => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("s ")) { for (const [k, w] of line.slice(2).split(/\s+/).map(p => p.split(":"))) if (k in b.values) b.values[k] = clamp01(+w); continue; }
      if (line.startsWith("m")) { b.partner = normalizeMac(line.slice(1)); b.print(partnerLine()); continue; }
      for (const ch of line) {
        if (ch === "x") b.sending = !b.sending;
        if (ch === "l") b.log = !b.log;
        if (ch === "G") b.print("Bridge mode glove: sends the values from the PC to a robot hand");
        if (ch === "i") {
          for (const l of [`MAC ${SIM_MAC.bridge}, radio channel 1`, "Firmware: bridge " + EXPECTED_FW.bridge + ", protocol 2, build demo",
                           "Bridge mode glove: sends the values from the PC to a robot hand", partnerLine(),
                           `Bridge: ACK loss 0 %, muted off, log ${b.log ? "on" : "off"}, sending ${b.sending ? "on" : "off"}`, "Bridge radio: ok, 0 errors"]) b.print(l);
        }
      }
    }
  };
  b.step = () => {
    const parts = Object.entries(b.values).map(([k, v]) => `${k}:${v.toFixed(3)}`);
    const link = b.sending && b.answered && performance.now() - b.answered < 1000;
    b.print(parts.join(" ") + ` Link:${link ? 1 : 0} Ok:${b.ok} Fail:0 Send:${b.sending ? 1 : 0} Rssi:${link ? -47 : 0} Err:0 Foreign:0 Undelivered:0`);
  };
  return b;
}

// One radio round (SYN, DATA, WAKEUP and their ACKs) from the test board to the hand,
// printed by both radio logs when they are on
function simRadioRound() {
  const b = sim.boards.find(x => x.kind === "bridge"), h = sim.boards.find(x => x.kind === "hand");
  if (!b || !b.sending) return;
  const hex = bytes => bytes.map(x => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const hand = h && !h.closed && (!b.partner || b.partner === SIM_MAC.hand) ? h : null;
  let mask = 0;
  const vals = [];
  KEYS.forEach((k, i) => { mask |= 1 << i; vals.push(Math.round(clamp01(b.values[k]) * 255)); });
  const fingers = KEYS.map((k, i) => `${k}:${(vals[i] / 255).toFixed(3)}`).join(" ");
  for (const [bytes, text] of [[[0x53], "SYN"], [[0x44, mask, ...vals], "DATA " + fingers], [[0x57, 100, 0], "WAKEUP 100 ms"]]) {
    const ack = [0x41, bytes[0]], ackText = "ACK " + String.fromCharCode(bytes[0]);
    if (b.log) b.print(`[radio] -> ${hex(bytes)}  ${text}`);
    if (!hand) continue;
    if (hand.log) { hand.print(`[funk] <- ${SIM_MAC.bridge} ${hex(bytes)}  ${text}`); hand.print(`[funk] -> ${hex(ack)}  ${ackText}`); }
    if (b.log) b.print(`[radio] <- ${SIM_MAC.hand} ${hex(ack)}  ${ackText}`);
  }
  if (hand && hand.receive(SIM_MAC.bridge, b.values)) { b.ok++; b.answered = performance.now(); }
}

async function startSimBoards() {
  if (state.source === "demo") stopDemo();
  if (connections.length) return;
  sim.boards = [simHand(), simBridge()];
  let last = performance.now();
  sim.timer = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    for (const b of sim.boards) if (!b.closed) b.step(dt);
    if (sim.boards.every(b => b.closed)) stopSimBoards();
  }, 50);
  sim.radioTimer = setInterval(simRadioRound, 106);
  for (const b of sim.boards) {
    const port = simPort(b);
    const conn = await connect(port);
    if (conn) setTimeout(() => b.greet(), 50);  // like a board that just started
  }
  $("demoZwei").dataset.t = "demoZweiStoppen";  // setTexts keeps it in the chosen language
  $("demoZwei").textContent = t("demoZweiStoppen");
}

function stopSimBoards() {
  clearInterval(sim.timer);
  clearInterval(sim.radioTimer);
  sim.timer = sim.radioTimer = null;
  sim.boards = [];
  $("demoZwei").dataset.t = "demoZwei";
  $("demoZwei").textContent = t("demoZwei");
}

$("demoZwei").onclick = async () => {
  if (sim.timer) {
    for (const c of [...connections]) if (c.port.sim) await disconnectOne(c);
    stopSimBoards();
  } else if (!connections.length) startSimBoards();
};
