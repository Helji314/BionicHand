"use strict";
// test_tool: verbindung.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ---------------------------------------------------------------------------
// Which board? setDevice switches the whole page over.
// ---------------------------------------------------------------------------
// Lines that only one of the firmwares prints (greeting, answer to "i", data lines, radio log)
const SIGNS = [
  // test bridge: the line says which side it plays right now (switches with G / H / S)
  { device: "bsniff", re: /^Bridge mode sniffer|^\[sniff\] t:\d|^Sniff: ch:\d/ },
  { device: "bglove", re: /^Bridge mode glove/ },
  { device: "bhand",  re: /^Bridge mode hand/ },
  { device: "sim",   re: /^Robot simulator ready|^ACK loss \d|^Firmware: simulator / },
  { device: "glove", re: /^Sensor glove|^Radio: |^Creep compensation|^\[radio\]|^\[link\]|^Target |^Firmware: glove |\b\w+_mV:\d/ },
  { device: "hand",  re: /^Roboterhand bereit|^Funk: |^Servotreiber: |^Steuerung: |^\[funk\]|^Partner |^Grenze |^Firmware: hand |\b[FS]\d_Pos:|\bVerbunden:\d/ },
];

function recognise(text) {
  for (const s of SIGNS) if (s.re.test(text)) return s.device;
  return null;
}

// Up to two boards can be connected at the same time (usually glove + robot
// hand). Each connection finds out on its own what it is; the select at the
// top left picks which one the page shows ("view"). Data of both is kept, so
// the packets panel can compare what the glove sent with what the hand got.
const connections = [];   // [{port, reader, reading, readPromise, chain, device, detected, manual, timer, mac, target, lastGlove, logOn}]
const viewConn = () => connections.find(c => c.device === state.device) ?? (connections.length === 1 ? connections[0] : null);
const connOf = device => connections.find(c => c.device === device);

// Switch the page to a board kind. how: "auto" (detected), "manual" (picked in the
// select), "view" (just look at another connected board), "start".
function setDevice(device, how, conn = null) {
  if (!DEVICES.includes(device)) device = "glove";
  const changed = device !== state.device;
  if (changed && state.source === "demo") stopDemo();
  if (conn) {
    conn.device = device;
    conn.detected = how === "auto";
    conn.manual = how === "manual";
    // Ask the board for its stream: values + raw (glove), status lines (robot hand).
    // "A"/"R"/"U" only switch on, never off, and the other board ignores them.
    if (device === "glove") sendTo(conn, "AR", true);
    if (device === "hand") sendTo(conn, "U", true);
    // The test bridge plays whichever side is picked (G = glove, H = hand, S = sniffer)
    const mode = { bglove: "G", bhand: "H", bsniff: "S" }[device];
    if (conn.bridge && how === "manual" && mode) sendTo(conn, mode, true);
  }
  // With two boards, a newly detected one doesn't steal the view
  if (!conn || connections.length < 2 || !connOf(state.device) || connOf(state.device) === conn) state.device = device;
  document.body.dataset.device = state.device;
  $("geraet").value = state.device;
  if (changed && connections.length < 2 && state.device === device) {
    if (!conn) resetValues();
    if ($("kal").open) closeCalibration();
  }
  // looking at the other of two boards: drop the cards and status of the one before
  if (changed && how === "view") resetValues();
  showView();
}

// Everything that depends on which board is shown
function showView() {
  const c = viewConn();
  if (c?.mac) showMac(c.mac); else $("mac").hidden = true;
  state.target = c ? c.target : state.source === "demo" ? state.target : undefined;
  state.lastGlove = c ? c.lastGlove : state.lastGlove;
  setTexts();
  setControls();
}

function showDetection() {
  const el = $("erkannt");
  const c = viewConn();
  const key = !c ? "" : c.detected ? "erkannt" : c.manual ? "vonHandGewaehlt" : "erkenne";
  el.textContent = (key ? t(key) : "") + (connections.length > 1 ? " · " + t("zweiBoards") : "");
  el.dataset.auto = c?.detected ? "ja" : "nein";
  // with two boards, only those two can be picked
  for (const o of $("geraet").options) o.disabled = connections.length > 1 && !connOf(o.value);
}

// Forget all values (new board or new demo)
function resetValues() {
  for (const f of ["value", "shown", "time", "mv", "comp", "sensorName", "seen", "pos", "goal", "deg", "posTime", "disp", "glove", "gloveTime"]) state[f] = {};
  state.status = null;
  state.history = [];
  state.lineTimes = [];
  state.target = undefined;
  state.lastGlove = null;
  for (const c of Object.values(cards)) { c.shown = false; c.last = 0; }
  showTarget();
}

// ---------------------------------------------------------------------------
// Reading serial lines
// ---------------------------------------------------------------------------
// Data lines ("Index:0.512 Index_mV:1234 ..." or "F0:0.512 F0_Pos:0.480 ...") are
// shown in the cards; radio messages go to the packets panel; everything else
// (messages, calibration text, info) goes to the log.
// conn = the connection the line came from (null in the demo: then it is the shown board).
function handleLine(line, conn = null) {
  const text = line.trim();
  if (text === "") return;
  const now = performance.now();

  if (conn) {
    const d = recognise(text);
    // A greeting means the board just started: then it may also be a different board.
    const greeting = /ready|bereit/.test(text);
    const bridgeMode = d === "bglove" || d === "bhand" || d === "bsniff";
    if (bridgeMode) conn.bridge = true;
    // the bridge says its mode again after every switch (G / H / S): follow it
    const bridgeSwitch = conn.bridge && d && d !== conn.device && bridgeMode;
    if (d && (!conn.detected || (greeting && d !== conn.device) || bridgeSwitch) && (!conn.manual || bridgeSwitch)) {
      clearTimeout(conn.timer);
      setDevice(d, "auto", conn);
      log(t("logErkannt", t("g_" + d)));
    }
  }
  const device = conn ? conn.device : state.device;
  const self = conn ?? state;   // where MAC, partner and log state of this board are kept
  // with two boards, every log line says where it came from
  const tag = conn && connections.length > 1 && device ? `[${t("kurz_" + device)}] ` : "";

  versionLine(text, self, conn, now);
  // wiring check answers ("Diagnose: ..." robot hand, "Check: ..." glove): js/signale.js keeps them, the log shows them
  if (signalLine(text, device, now)) { log(tag + line); return; }
  signalLinkLine(text, device, now);
  if (linkLine(text, self, now)) return;
  if (sniffLine(text, now, device, tag, !conn || conn === viewConn())) return;   // bridge as sniffer (js/mitschnitt.js)
  if (packetLine(text, now, device, self, tag)) return;
  const linkReply = /^Link statistics (ON|OFF)/.exec(text);
  if (linkReply) self.linkOn = linkReply[1] === "ON";

  const mac = /\bMAC:? ([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/.exec(text);
  if (mac) self.mac = mac[1].toUpperCase();
  settingsLine(text, device, self);
  if (device === "glove") {
    const target = /^(?:Target|Ziel) (.+)$/.exec(text);
    if (target) self.target = /^(Broadcast|every)/i.test(target[1]) ? null : target[1].toUpperCase();
    const saved = /^(?:CAL|KAL) (\S+)/.exec(text);
    if (saved) cal.confirmed.add(saved[1]);
    const radio = /^Radio (ON|OFF)\b/.exec(text);  // command f
    if (radio) self.radioOff = radio[1] === "OFF";
    const creep = /^Creep compensation (on|off)\b/i.exec(text);
    if (creep) { self.creep = creep[1].toLowerCase() === "on"; showCreep(); }
  } else if (device === "hand") {
    const partner = /^Partner (.+)$/.exec(text);
    if (partner) self.target = partner[1].startsWith("Broadcast") ? null : partner[1].toUpperCase();
    const glove = /^Handschuh verbunden: ([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/.exec(text);
    if (glove) self.lastGlove = glove[1].toUpperCase();
  } else if (device === "sim") {
    const sim = /^ACK loss (\d+) %, muted (\w+), log (\w+)/.exec(text);
    if (sim) self.logOn = sim[3] === "on";
  } else if (device === "bglove" || device === "bhand") {
    const partner = /^Bridge partner (.+)$/.exec(text);
    if (partner) self.target = partner[1].startsWith("Broadcast") ? null : partner[1].toUpperCase();
    const settings = /^Bridge: ACK loss (\d+) %, muted (\w+), log (\w+), sending (\w+)/.exec(text);
    if (settings) { self.logOn = settings[3] === "on"; self.muted = settings[2] === "on"; }
    const radio = /^Bridge radio: (ok|ERROR)/.exec(text);
    if (radio) self.radioBroken = radio[1] === "ERROR";
  }
  if (!conn || conn === viewConn()) {
    if (self.mac) showMac(self.mac);
    state.target = self.target; state.lastGlove = self.lastGlove;
    showTarget();
  }

  const data = {};
  for (const part of text.split(/\s+/)) {
    const m = /^([A-Za-z]\w*):(-?\d+(?:\.\d+)?)$/.exec(part);
    if (!m) { log(tag + line); return; }
    data[m[1]] = parseFloat(m[2]);
  }
  // every number goes into the Signals window (js/signale.js), also _raw / _us streams the cards ignore
  signalFeed(data, now, device);
  // Radio trouble counters of every board, also the one in the background (robot
  // hand 2.2: NichtAngekommen/Fremd, test bridge 1.1: Undelivered/Foreign)
  const undelivered = data.NichtAngekommen ?? data.Undelivered, foreign = data.Fremd ?? data.Foreign;
  if (undelivered !== undefined || foreign !== undefined) self.diag = { undelivered: undelivered ?? 0, foreign: foreign ?? 0, device, time: now };
  // With two boards only the shown one fills the cards and the status: the robot
  // hand and the test bridge would otherwise overwrite each other every line
  // (the mode flickered between Glove and Manual). A glove in the background still
  // counts for recording, a robot hand for the link check.
  const shown = !conn || conn === viewConn();
  if (device === "hand") takeHand(data, now, shown);
  else if (!shown && (device === "bglove" || device === "bhand" || !sliderView())) return;
  else if (device === "bglove") takeBridgeGlove(data, now);
  else {
    takeGlove(data, now);
    if (device === "bhand" && data.Link !== undefined) {
      state.status = { connected: !!data.Link, rssi: data.Rssi, data: data.Data, foreign: data.Foreign, ...radioErrors(data.Err, now) };
      state.statusTime = now;
    }
  }
}

// Test bridge: Err = number of sends that failed. radioError = it went up within the last 2 s.
function radioErrors(err, now) {
  const prev = state.status?.err ?? 0, since = state.status?.errTime ?? 0;
  const errTime = err !== undefined && err > prev ? now : since;
  return { err: err ?? 0, errTime, radioError: !!errTime && now - errTime < 2000 };
}

// Under the radio packets: messages the other board never heard, and messages
// ignored because they came from a board that is not the partner (counted by the
// firmware since its start). "The hand doesn't answer" then shows which side it is.
function showRadioTrouble(now) {
  const boards = state.source === "demo" ? [state] : connections;
  const msgs = [];
  for (const b of boards) {
    const d = b.diag;
    if (!d || now - d.time > 3000) continue;
    const name = deviceName(d.device ?? state.device);
    if (d.undelivered) msgs.push(t(d.device === "hand" || d.device === "bhand" ? "p_ackVerloren" : "p_nichtGehoert", name, d.undelivered));
    if (d.foreign) msgs.push(t("p_ignoriert", name, d.foreign));
  }
  const text = msgs.join(" ");
  if ($("paketeDiagnose").textContent !== text) $("paketeDiagnose").textContent = text;
  $("paketeDiagnose").hidden = !text;
}

// Test bridge as glove: "F0:0.500 S0:0.000 ... Link:1 Ok:12 Fail:0 Send:1 Rssi:-48 Err:0 Foreign:0 Undelivered:0"
// The values are what it sends; they go into the slider cards like servo positions.
function takeBridgeGlove(d, now) {
  const point = { t: now, pos: {} };
  let any = false;
  for (const { k, id } of CHANNELS) {
    if (d[k] === undefined) continue;
    state.pos[id] = state.goal[id] = clamp01(d[k]);
    state.posTime[id] = now;
    if (state.disp[id] === undefined) state.disp[id] = state.pos[id];
    point.pos[id] = state.pos[id]; any = true;
  }
  if (d.Link !== undefined) {
    state.status = { connected: !!d.Link, sending: d.Send !== 0, ok: d.Ok, fail: d.Fail, rssi: d.Rssi, ...radioErrors(d.Err, now) };
    state.statusTime = now;
  }
  if (any) { state.history.push(point); state.lineTimes.push(now); }
}

// Glove (and simulator): "Index:0.512 Index_mV:1234 Index_comp:2100"
function takeGlove(data, now) {
  const point = { t: now, w: {}, mv: {}, comp: {} };
  let any = false;
  for (const [key, value] of Object.entries(data)) {
    const suffix = /_(mV|comp|ausgl)$/.exec(key);
    const base = suffix ? key.slice(0, suffix.index) : key;
    const id = KEY_TO_CHANNEL[base];
    if (!id) continue;
    if (!/^[FS]\d$/.test(base)) state.sensorName[id] = base;  // the glove's own sensor name
    state.seen[id] = true;
    any = true;
    if (!suffix) {
      state.value[id] = clamp01(value);
      state.time[id] = now;
      if (state.shown[id] === undefined) state.shown[id] = state.value[id];
      point.w[id] = state.value[id];
    } else if (suffix[1] === "mV") {
      state.mv[id] = { value, time: now };
      point.mv[id] = clamp01(value / MAX_MV);
    } else {
      state.comp[id] = { value, time: now };
      point.comp[id] = clamp01(value / MAX_MV);
    }
  }
  if (any) { state.history.push(point); state.lineTimes.push(now); recordFrame("glove", point.w, now); }
}

// Robot hand (command "U"): "F0:0.512 F0_Pos:0.480 F0_Ziel:0.500 F0_Grad:86.4 ... Verbunden:1 Manuell:0 Test:0 Servotreiber:1"
// F0 = value from the glove, _Pos = servo position 0..1, _Ziel = where it is going.
// shown = false: another board is on screen, only the link check and the recording get the line.
function takeHand(d, now, shown = true) {
  const point = { t: now, pos: {}, hs: {} };
  let any = false;
  for (const { k, id } of CHANNELS) {
    if (d[k] !== undefined) {
      point.hs[id] = clamp01(d[k]);
      if (shown) { state.glove[id] = point.hs[id]; state.gloveTime[id] = now; any = true; }
    }
    if (shown && d[k + "_Pos"] !== undefined) {
      state.pos[id] = clamp01(d[k + "_Pos"]);
      state.goal[id] = clamp01(d[k + "_Ziel"] ?? d[k + "_Pos"]);
      state.deg[id] = d[k + "_Grad"];
      state.posTime[id] = now;
      if (state.disp[id] === undefined) state.disp[id] = state.pos[id];
      point.pos[id] = state.pos[id]; any = true;
    }
  }
  if (shown && d.Verbunden !== undefined) {
    state.status = { connected: !!d.Verbunden, manual: !!d.Manuell, test: !!d.Test, driver: !!d.Servotreiber };
    state.statusTime = now;
  }
  linkHand(d, now);
  if (any) { state.history.push(point); state.lineTimes.push(now); }
  recordFrame("hand", point.hs, now);
}

function showMac(mac) {
  const el = $("mac");
  el.textContent = "MAC " + mac;
  el.dataset.mac = mac;
  el.hidden = false;
}

function copyMac() {
  const mac = $("mac").dataset.mac;
  if (!mac) return;
  const asArray = "{" + mac.split(":").map(b => "0x" + b).join(", ") + "}";
  navigator.clipboard.writeText(asArray).then(() => log(t("logMacKopiert") + asArray), () => log("MAC: " + asArray));
}

function showTarget() {
  $("partner").textContent = state.target === undefined ? "–" : state.target === null ? t("broadcast") : state.target;
}

function showTakeOver() {
  const l = state.lastGlove;
  $("uebernehmenZeile").hidden = !state.source || !l || l === state.target;
  $("letzterHandschuh").textContent = l || "";
}

// ---------------------------------------------------------------------------
// Serial connection (Web Serial, Chrome/Edge only). Up to two boards at once.
// ---------------------------------------------------------------------------
const MAX_BOARDS = 2;

// Buttons that talk to the board work when the shown board is connected; in the
// robot hand demo too (the demo plays the firmware).
function setControls() {
  const on = !!viewConn() || (state.source === "demo" && sliderView());
  for (const el of document.querySelectorAll("[data-seriell]")) el.disabled = !on;
  $("kalibrieren").disabled = !(viewConn() || state.source === "demo");
  $("kamKalibrieren").disabled = $("kalibrieren").disabled || !navigator.mediaDevices?.getUserMedia && state.source !== "demo";
  $("paketeAn").disabled = !state.source;
  $("verbinden").textContent = t(connections.length ? "trennen" : "verbinden");
  $("verbinden2").hidden = connections.length !== 1;
  showDetection();
}

// openPort: a port that is already open (after flashing), otherwise the browser asks.
async function connect(openPort = null) {
  if (state.source === "demo") stopDemo();
  if (connections.length >= MAX_BOARDS) return null;
  let port = openPort instanceof Event ? null : openPort;
  try {
    if (!port) {
      port = await navigator.serial.requestPort();
      if (connections.some(c => c.port === port)) return null;  // that one is already open
      await port.open({ baudRate: 115200 });
    }
  } catch (e) {
    if (e.name !== "NotFoundError") {
      setStatus("st_fehlerOeffnen", "fehler");
      log(t("logFehler") + e.message + (navigator.platform.includes("Linux") ? t("logLinux") : ""));
    }
    return null;
  }
  const conn = { port, reader: null, reading: true, readPromise: null, chain: Promise.resolve(),
                 device: null, detected: false, manual: false, timer: null, mac: null, target: undefined,
                 lastGlove: null, logOn: null, weSwitchedLogOn: false, lastPacket: 0, since: performance.now() };
  if (!connections.length) { resetValues(); resetPackets(); packets.userOff = false; }
  connections.push(conn);
  state.source = "serial";
  setControls();
  if (connections.length === 1) setStatus("st_erkennen", "warn");
  log(t("logVerbunden"));
  conn.readPromise = readLoop(conn);
  // "i" makes every board introduce itself (both firmwares answer it, nothing changes).
  // If nothing comes back, ask once more; after that the board can be picked by hand.
  setTimeout(() => sendTo(conn, "i", true), 300);
  conn.timer = setTimeout(() => {
    if (!connections.includes(conn) || conn.detected || conn.manual) return;
    sendTo(conn, "i", true);
    conn.timer = setTimeout(() => {
      if (connections.includes(conn) && !conn.detected && !conn.manual) setStatus("st_unbekannt", "fehler");
    }, 2500);
  }, 2500);
  return conn;
}

async function readLoop(conn) {
  const decoder = new TextDecoderStream();
  const done = conn.port.readable.pipeTo(decoder.writable).catch(() => {});
  conn.reader = decoder.readable.getReader();
  let rest = "";
  try {
    while (conn.reading) {
      const { value, done: end } = await conn.reader.read();
      if (end) break;
      rest += value;
      const lines = rest.split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) handleLine(l, conn);
    }
  } catch (e) {
    log(t("logLesefehler") + e.message);
  } finally {
    conn.reader.releaseLock();
    await done;
  }
  if (conn.reading) setTimeout(() => disconnectOne(conn), 0);  // device was unplugged
}

// Writes are queued per board so several commands in a row never fight over the port.
function sendTo(conn, text, quiet = false) {
  conn.chain = conn.chain.then(async () => {
    if (!conn.port.writable) return;
    const writer = conn.port.writable.getWriter();
    try {
      await writer.write(encoder.encode(text));
      if (!quiet) log((connections.length > 1 && conn.device ? `[${t("kurz_" + conn.device)}] ` : "") + "> " + text.trim());
    } finally {
      writer.releaseLock();
    }
  }).catch(e => log(t("logSendefehler") + e.message));
  return conn.chain;
}

// Commands go to the board that is shown. In the demo they go to the made-up board.
function send(text, quiet = false) {
  if (state.source === "demo") {
    demoCommand(text);
    if (!quiet) log("> " + text.trim());
    return Promise.resolve();
  }
  const conn = viewConn();
  return conn ? sendTo(conn, text, quiet) : Promise.resolve();
}

async function disconnectOne(conn) {
  if (!connections.includes(conn)) return;
  clearTimeout(conn.timer);
  if (conn.port.writable) {
    // Leave the board as we found it: radio log off again, and the robot hand
    // back to the glove (not possible when the cable is already out)
    if (conn.weSwitchedLogOn && performance.now() - conn.lastPacket < 1500) sendTo(conn, "l", true);
    if (conn.linkOn && performance.now() - (conn.lastLink ?? 0) < 2500) sendTo(conn, "L", true);
    if (playActive() && play.target === conn.device) stopPlay();
    if (conn.device === "hand" && state.status && (state.status.manual || state.status.test)) sendTo(conn, "r");
    await conn.chain;
  }
  connections.splice(connections.indexOf(conn), 1);
  conn.reading = false;
  try { if (conn.reader) await conn.reader.cancel(); } catch (e) {}
  try { await conn.readPromise; } catch (e) {}  // finish reading first, or the port stays locked
  try { await conn.port.close(); } catch (e) {}
  log(t("logGetrennt") + (conn.device ? " " + t("g_" + conn.device) : ""));
  if (!connections.length) {
    state.source = null;
    state.target = undefined;
    state.lastGlove = null;
    packets.recording = false;
    setStatus("st_getrennt", "");
  } else if (connections[0].device) {
    setDevice(connections[0].device, "view");
  }
  if (rec.recording && !recordSource()) stopRecording();
  showView();
  showTarget();
  showVersions();
}

async function disconnect() {
  for (const c of [...connections]) await disconnectOne(c);
}

// ---------------------------------------------------------------------------
// Radio partner (MAC of the other side)
// ---------------------------------------------------------------------------
// Accepts 58:E6:C5:F8:99:1C, 58-e6-..., 58E6C5F8991C and {0x58, 0xE6, ...}.
function normalizeMac(text) {
  const hex = text.replace(/0x/gi, "").replace(/[\s:,{}-]/g, "");
  if (!/^[0-9a-f]{12}$/i.test(hex)) return null;
  return hex.toUpperCase().match(/../g).join(":");
}

function setTarget() {
  const input = $("partnerEingabe");
  const mac = normalizeMac(input.value);
  input.setAttribute("aria-invalid", mac ? "false" : "true");
  if (!mac) { log(t("logKeineMac") + input.value); return; }
  input.value = mac;
  send("m" + mac + "\n");
}
