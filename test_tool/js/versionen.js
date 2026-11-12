"use strict";
// test_tool: versionen.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Firmware version check
// ===========================================================================
// Every firmware prints "Firmware: glove 2.0, protocol 2, build 1a2b3c4" at start
// and with "i". Older firmware prints nothing like it.
// EXPECTED_FW = the newest version per board kind (FIRMWARE_VERSION in each repo):
// a board with an older one gets a warning with a "Flash firmware" button.
// Bump the entry of a board when its firmware's version goes up.
const EXPECTED_FW = { glove: "2.3", sim: "2.0", hand: "2.4", bridge: "1.2" };
// The tools (servo limits, link check, replay over radio) need at least this version.
const FW_FEATURES = "2.0";
const FW_RE = /^Firmware: ([a-z]+) (\d+(?:\.\d+)*), protocol (\d+)(?:, build (\S+))?/;
// The firmware a board kind runs: the test bridge is one firmware for all three of its modes.
const fwRoleOf = device => (device === "bglove" || device === "bhand" || device === "bsniff" ? "bridge" : device);
const FW_WAIT_MS = 4000;  // after detection: this long for the version line, then the firmware counts as old

function cmpVersion(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
const fwRole = r => (r === "simulator" ? "sim" : r);
const fwNew = self => !!(self?.fw && !self.fw.missing && (!EXPECTED_FW[self.fw.role] || cmpVersion(self.fw.version, FW_FEATURES) >= 0));

// Called for every line: version line, old JSON radio log, greeting after a restart
function versionLine(text, self, conn, now) {
  const m = FW_RE.exec(text);
  if (m) {
    self.fw = { role: fwRole(m[1]), version: m[2], protocol: +m[3], build: m[4] || "" };
    showVersions();
    return;
  }
  if (/^(?:\[(?:radio|funk)\] )?(?:->|<-) .*\{/.test(text) && !self.jsonProtocol) { self.jsonProtocol = true; showVersions(); }
  if (conn && /^(Sensor glove|Roboterhand bereit|Robot simulator ready)/.test(text)) {
    // the board (re)started: its version line follows right after the greeting
    conn.fw = null; conn.jsonProtocol = false; conn.fwCheckAt = now + FW_WAIT_MS;
  }
}

// From the main loop: a detected board that never said its version has old firmware.
function checkVersions(now) {
  for (const c of connections) {
    if (!c.device || c.fw || !(c.detected || c.manual)) continue;
    c.fwCheckAt ??= now + FW_WAIT_MS;
    if (now > c.fwCheckAt) { c.fw = { missing: true }; showVersions(); }
  }
}

function showVersions() {
  const boards = state.source === "demo" ? [{ self: state, device: state.device }]
    : connections.filter(c => c.device).map(c => ({ self: c, device: c.device }));
  const msgs = [];
  let error = false;
  for (const { self, device } of boards) {
    const name = deviceName(device), fw = self.fw, role = fwRoleOf(device);
    const want = EXPECTED_FW[role];
    if (fw?.missing && want) msgs.push(t("v_fehlt", name, want));
    else if (fw && !fw.missing && want && EXPECTED_FW[fw.role] && cmpVersion(fw.version, EXPECTED_FW[fw.role]) < 0) msgs.push(t("v_alt", name, fw.version, EXPECTED_FW[fw.role]));
    if (fw && !fw.missing && want && EXPECTED_FW[fw.role] && fw.role !== role) msgs.push(t("v_rolle", name, t("rolle_" + fw.role)));
    if (self.jsonProtocol) { msgs.push(t("v_json", name)); error = true; }
  }
  const known = boards.filter(b => b.self.fw && !b.self.fw.missing);
  if (known.length === 2 && known[0].self.fw.protocol !== known[1].self.fw.protocol) {
    msgs.push(t("v_protokoll", deviceName(known[0].device), known[0].self.fw.protocol, deviceName(known[1].device), known[1].self.fw.protocol));
    error = true;
  }
  $("versionHinweis").hidden = !msgs.length;
  $("versionHinweis").dataset.art = error ? "fehler" : "";
  $("versionText").textContent = msgs.join(" ");
  // the version of each board, small in the tool bar
  $("versionen").textContent = boards.map(({ self, device }) => {
    const fw = self.fw;
    const v = !fw ? "" : fw.missing ? t("fwFehlt") : t("fw", fw.version) + (fw.build && fw.build !== "local" ? " · " + fw.build : "");
    return v ? (boards.length > 1 ? t("kurz_" + device) + ": " : "") + v : "";
  }).filter(Boolean).join("   ");
}
$("versionFlash").onclick = () => openFlash();  // openFlash is in js/flashen.js

// ===========================================================================
// Settings backup: what the boards print with "i" (calibration, limits,
// radio partner) is kept per board MAC on this computer, so it can be sent
// back after a full flash or to undo a bad calibration.
// ===========================================================================
// glove "i":  "  ThumbFlex  GPIO4  straight     12 mV  bent   2100 mV  ok"
const CAL_LINE_RE = /^\s*(\S+)\s+GPIO\d+\s+straight\s+(-?\d+(?:\.\d+)?) mV\s+bent\s+(-?\d+(?:\.\d+)?) mV/;
// robot hand "i" / "g": "Grenze F1 Kanal 1 offen 10.0 zu 170.0 (config.h)"
const LIMIT_RE = /^Grenze (\S+) Kanal (\d+) offen (-?\d+(?:\.\d+)?) zu (-?\d+(?:\.\d+)?)( \(config\.h\))?/;
// robot hand "i" / "b" (firmware 2.1): "Tempo 300 Grad/s (config.h)"
const TEMPO_RE = /^Tempo (\d+(?:\.\d+)?) Grad\/s( \(config\.h\))?/;

function settingsLine(text, device, self) {
  let changed = pinLine(text, device, self);
  if (device === "glove") {
    const c = CAL_LINE_RE.exec(text);
    if (c) { (self.calib ??= {})[c[1]] = { straight: +c[2], bent: +c[3] }; changed = true; }
    const saved = /^CAL (\S+) straight (-?\d+) bent (-?\d+)/.exec(text);
    if (saved) { (self.calib ??= {})[saved[1]] = { straight: +saved[2], bent: +saved[3] }; changed = true; }
  } else if (device === "hand") {
    const g = LIMIT_RE.exec(text);
    if (g) {
      (self.limits ??= {})[g[1]] = { channel: +g[2], open: +g[3], closed: +g[4], std: !!g[5] };
      changed = true;
      limitConfirmed(g[1]);
    }
    const sp = TEMPO_RE.exec(text);
    if (sp) {
      self.speed = { deg: +sp[1], std: !!sp[2] };
      changed = true;
      speedConfirmed();
    }
  }
  if (changed) storeBackup(self, device);
}

function backupKey(self) { return self.mac ? "sicherung:" + self.mac : null; }
function storeBackup(self, device) {
  const key = backupKey(self);
  if (!key || state.source === "demo") return;
  const b = { device, time: Date.now(), target: self.target ?? null };
  if (device === "glove" && self.calib) b.calib = self.calib;
  if (device === "hand" && self.limits) b.limits = Object.fromEntries(Object.entries(self.limits).filter(([, l]) => !l.std));
  if (device === "hand" && self.speed && !self.speed.std) b.speed = self.speed.deg;
  try { localStorage.setItem(key, JSON.stringify(b)); } catch (e) {}
}
function loadBackup(mac) {
  try { return mac ? JSON.parse(localStorage.getItem("sicherung:" + mac)) : null; } catch (e) { return null; }
}
// Commands that put a backup back, and a short description of it
function restoreCommands(b) {
  const cmds = [], what = [];
  if (b?.calib) {
    const e = Object.entries(b.calib).filter(([, c]) => Math.abs(c.bent - c.straight) >= 1);
    for (const [name, c] of e) cmds.push(`c${name}=${Math.round(c.straight)},${Math.round(c.bent)}\n`);
    if (e.length) what.push(t("s_kalib", e.length));
  }
  if (b?.limits) {
    const e = Object.entries(b.limits);
    for (const [k, l] of e) cmds.push(`g${k}=${l.open},${l.closed}\n`);
    if (e.length) what.push(t("s_grenzen", e.length));
  }
  if (b?.speed) { cmds.push(`b${b.speed}\n`); what.push(t("s_tempo")); }
  if (b?.target) { cmds.push("m" + b.target + "\n"); what.push(t("s_partner")); }
  return { cmds, what: what.join(", ") };
}
async function restoreBackup(device, b) {
  const { cmds, what } = restoreCommands(b);
  for (const c of cmds) {
    await sendToDevice(device, c, false);
    await new Promise(r => setTimeout(r, 150));
  }
  if (cmds.length) log(t("s_wiederhergestellt", what));
}
