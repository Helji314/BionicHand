"use strict";
// test_tool: funkpakete.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Radio packets
// ===========================================================================
// Radio log lines of the three firmwares (binary format, repo protocol): the
// payload byte for byte in hex, then what it means.
//   glove:      [radio] -> 44 05 1F 80  DATA F0:0.122 F1:0.502
//               [radio] <- 58:E6:C5:F8:99:1C 41 44  ACK D
//   robot hand: [funk] <- 40:4C:CA:12:34:56 53  SYN       [funk] -> 41 53  ACK S
//   simulator:  <- 53                                     -> 41 53  ACK S
// The number of hex bytes is the size of the ESP-NOW payload.
// Older firmware printed JSON instead ({"typ":"syn"} ...): still understood.
const PACKET_RE = /^(?:\[(?:radio|funk)\] )?(->|<-) (?:([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}) )?((?:[0-9A-Fa-f]{2} )*[0-9A-Fa-f]{2}(?=\s|$)|\{.*)/;
const BIN_TYPES = { 0x53: "syn", 0x44: "data", 0x57: "wakeup" };  // 'S' 'D' 'W'; ACK = 'A' (0x41) + type
const ESPNOW_OVERHEAD = 43;   // bytes per frame around the payload: MAC header 24, category/OUI/random 8, vendor element 7, FCS 4
const AIR_PREAMBLE_US = 192;  // 802.11b long preamble at 1 Mbit/s (ESP-NOW default rate)
const PACKET_WINDOW_MS = 2000;
const PACKET_TYPES = ["syn", "ack syn", "data", "ack data", "wakeup", "ack wakeup"];

const packets = {
  recording: false,        // the user wants to see packets
  userOff: false,          // the user clicked Stop (the sniffer keeps printing, so don't switch on by itself)
  events: [],              // [{t, key, bytes}] within PACKET_WINDOW_MS
  rows: {},                // key -> {side, type, dir, last, min, max, count}
  lost: 0, givenUp: 0,
  lastData: null,          // {bytes, fingers}
  error: null,             // {text, time}: last radio error a board reported
  shown: 0,
};

function resetPackets() {
  Object.assign(packets, { events: [], rows: {}, lost: 0, givenUp: 0, lastData: null, error: null, recording: false });
  resetCapture();   // js/mitschnitt.js: the Wireshark buffers and the sniffer's senders
  resetSniff();
  showPackets(performance.now());
}

// Returns true if the line was a radio log line (then it is not a data line).
// device = which board printed it, self = its connection (or state in the demo).
function packetLine(text, now, device, self, tag) {
  const m = PACKET_RE.exec(text);
  if (!m) {
    // other radio log lines: not delivered / given up / dropped on purpose
    let other = true;
    // The test bridge reports radio errors ("[radio] ERROR send failed: ...") even
    // without its log: always show them, they explain an empty packets panel.
    if (/^\[radio\] ERROR/.test(text)) {
      packets.error = { text, time: now };
      self.lastPacket = now;
      log(tag + text);
      return true;
    }
    if (/^\[radio\]\s+not delivered/.test(text)) packets.lost++;
    else if (/^\[radio\] no ACK/.test(text)) packets.givenUp++;
    else if (!/^\s*\(ACK \w+ dropped on purpose\)|^\s*round \d+ done|^\[(radio|funk)\]/.test(text)) other = false;
    if (!other) return false;
    self.lastPacket = now;
    return logPacket(tag + text);
  }
  self.lastPacket = now;
  // Lines arrive although we didn't ask: the board's radio log was already on.
  if (!packets.recording) packets.recording = true;
  const payload = m[3];
  // "->" = the board sent it, "<-" = it received it
  const dir = m[1] === "->" ? "tx" : "rx";
  const side = device || "glove";
  let type = "?", fingers = null, bytes;
  if (payload.startsWith("{")) {
    bytes = encoder.encode(payload).length;
    try {
      const j = JSON.parse(payload);
      type = j.typ === "ack" ? "ack " + j.auf : String(j.typ);
      if (j.typ === "data" && j.finger) fingers = Object.keys(j.finger).length;
    } catch (e) {}
  } else {
    const b = payload.split(" ").map(h => parseInt(h, 16));
    bytes = b.length;
    ({ type, fingers } = packetType(b));
    captureLog(side, dir, m[2], b, now);   // for "Save for Wireshark" (js/mitschnitt.js)
  }
  countPacket(side, type, dir, bytes, fingers, now);
  return logPacket(tag + text);
}

// Type of a binary payload ("syn", "ack data", ...) and, for DATA, how many fingers it has
function packetType(b) {
  let type = "?", fingers = null;
  if (b[0] === 0x41 && BIN_TYPES[b[1]]) type = "ack " + BIN_TYPES[b[1]];
  else if (BIN_TYPES[b[0]]) type = BIN_TYPES[b[0]];
  if (type === "data" && b.length >= 2) fingers = [0, 1, 2, 3, 4, 5].filter(i => b[1] & (1 << i)).length;
  return { type, fingers };
}

// Count one message. side = board that logged it ("bsniff": heard by the sniffer),
// dir = "tx" (it sent it), "rx" (it received it) or "luft" (sniffer: heard on the air).
function countPacket(side, type, dir, bytes, fingers, now) {
  const key = side + " " + type + " " + dir;
  const row = packets.rows[key] ??= { side, type, dir, last: 0, min: Infinity, max: 0, count: 0 };
  row.last = bytes;
  row.min = Math.min(row.min, bytes);
  row.max = Math.max(row.max, bytes);
  row.count++;
  packets.events.push({ t: now, key, bytes });
  // The format comparison shows the DATA going from the glove to the hand (sent by a
  // glove, or received by a hand), not any DATA that happened to come last
  // glove (and simulator), the sniffer hears every DATA, and every DATA goes from a glove to a hand.
  const gloveToHand = dir === "luft" || (dir === "tx" ? side === "glove" || side === "bglove" : side === "hand" || side === "sim" || side === "bhand");
  if (fingers !== null && gloveToHand) packets.lastData = { bytes, fingers };
}

function logPacket(text) {
  if ($("paketeImLog").checked) log(text);
  return true;
}

// Switch recording on/off, on every connected board. The radio log "l" is a
// toggle in the firmware, so it is only sent when that board's log is not
// already in the wanted state (radio lines arriving = on; the simulator says it).
// The bridge as sniffer prints every frame anyway: it gets no "l".
function setPackets(on) {
  const now = performance.now();
  if (state.source === "demo") {
    if (demo.radioLog !== on) demoCommand("l");
  } else {
    for (const c of connections) {
      if (c.device === "bsniff") continue;
      const isOn = c.logOn !== null && c.logOn !== undefined && c.device !== "glove" && c.device !== "hand" ? c.logOn : now - c.lastPacket < 1500;
      if (on !== isOn) { sendTo(c, "l", true); c.weSwitchedLogOn = on; c.lastPacket = on ? now : 0; }
    }
  }
  packets.recording = on;
  packets.userOff = !on;
  showPackets(now);
}

function fmt(n) { return n >= 100 ? Math.round(n).toLocaleString(language) : n.toLocaleString(language, { maximumFractionDigits: 1 }); }
const airUs = bytes => AIR_PREAMBLE_US + (ESPNOW_OVERHEAD + bytes) * 8;

// Panel, rewritten about 4 times per second
function showPackets(now) {
  if (now - packets.shown < 250 && packets.shown) return;
  packets.shown = now;
  while (packets.events.length && now - packets.events[0].t > PACKET_WINDOW_MS) packets.events.shift();

  const on = packets.recording;
  $("paketeAn").setAttribute("aria-pressed", on);
  $("paketeAn").textContent = t(on ? "paketeAus" : "paketeAn");
  const keys = Object.keys(packets.rows).sort((a, b) => {
    const ia = PACKET_TYPES.indexOf(packets.rows[a].type), ib = PACKET_TYPES.indexOf(packets.rows[b].type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const twoSides = new Set(keys.map(k => packets.rows[k].side)).size > 1;
  $("paketeTabelle").hidden = !keys.length;
  const radioError = packets.error && now - packets.error.time < 5000 ? packets.error.text : null;
  $("paketeLeer").hidden = !!keys.length && !radioError;
  if (radioError) $("paketeLeer").textContent = t("paketeFunkFehler", radioError.replace(/^\[radio\] ERROR /, ""));
  else if (!keys.length) {
    $("paketeLeer").textContent = !state.source ? t("paketeLeerGetrennt")
      : state.device === "bsniff" ? t(on ? "paketeLeerSniffWarten" : "paketeLeerSniffAus", sniff.channel)
      : t(on ? "paketeLeerWarten" : "paketeLeerAus");
  }

  const secs = PACKET_WINDOW_MS / 1000;
  const perKey = {};
  for (const e of packets.events) {
    const p = perKey[e.key] ??= { n: 0, b: 0 };
    p.n++; p.b += e.bytes;
  }
  let html = "", totN = 0, totB = 0, totCount = 0, airTotal = 0;
  for (const key of keys) {
    const r = packets.rows[key], p = perKey[key] ?? { n: 0, b: 0 };
    totN += p.n; totB += p.b; totCount += r.count;
    airTotal += p.n * airUs(p.n ? p.b / p.n : 0);
    const arrow = r.dir === "tx" ? "→" : r.dir === "luft" ? "↔" : "←";
    html += `<tr data-leer="${p.n ? "nein" : "ja"}" title="${t(r.dir === "tx" ? "p_gesendet" : r.dir === "luft" ? "p_gehoert" : "p_empfangen")}">
      <td>${twoSides ? `<span class="klein">${t("kurz_" + r.side)}</span> ` : ""}<span class="pfeil">${arrow}</span> <span class="typ">${r.type.toUpperCase()}</span></td>
      <td class="n">${r.last}</td><td class="n">${r.min === r.max ? r.min : r.min + "–" + r.max}</td>
      <td class="n">${fmt(p.n / secs)}</td><td class="n">${fmt(p.b / secs)}</td><td class="n">${r.count}</td></tr>`;
  }
  if ($("paketeZeilen").dataset.html !== html) { $("paketeZeilen").innerHTML = html; $("paketeZeilen").dataset.html = html; }
  $("paketeSummeRate").textContent = fmt(totN / secs);
  $("paketeSummeBps").textContent = fmt(totB / secs);
  $("paketeSummeAnzahl").textContent = totCount;

  const lost = t("p_verloren", packets.lost, packets.givenUp);
  // With glove and robot hand connected: how many of the glove's packets reached the hand
  let delivery = "";
  if (twoSides) {
    const rate = (side, dir) => packets.events.filter(e => { const r = packets.rows[e.key]; return r.side === side && r.dir === dir; }).length;
    const sent = rate("glove", "tx") + rate("bglove", "tx"), got = rate("hand", "rx") + rate("sim", "rx") + rate("bhand", "rx");
    if (sent) delivery = " " + t("p_zugestellt", Math.min(100, Math.round(got / sent * 100)));
  }
  // with two boards every packet shows up twice (sent + received): count the air once
  const half = twoSides ? 2 : 1;
  $("paketeLuft").textContent = keys.length
    ? t("p_luft", fmt(totN / half / secs), fmt((totB + totN * ESPNOW_OVERHEAD) / half / secs), fmt(airTotal / half / secs / 1000))
      + (lost ? " " + lost + "." : "") + delivery
    : "";

  // The last DATA in other formats: binary = 1 byte type + 1 byte bit mask "which fingers" + values
  const d = packets.lastData;
  $("vergleich").hidden = !d;
  if (d) {
    const rows = [["p_float", 2 + 4 * d.fingers], ["p_u8", 2 + d.fingers]];
    const max = Math.max(...rows.map(r => r[1]));
    const html2 = `<div class="klein">${t("p_vergleich", d.fingers)}</div>` + rows.map(([k, b]) =>
      `<div class="vz"><span>${t(k)}</span><div class="spur"><div style="width:${(b / max * 100).toFixed(1)}%"></div></div>` +
      `<span class="n klein">${b} B</span></div>`).join("") +
      `<div class="klein">${t("p_vergleichTipp", d.bytes)}</div>`;
    if ($("vergleich").dataset.html !== html2) { $("vergleich").innerHTML = html2; $("vergleich").dataset.html = html2; }
  }
  showSniff(now);   // sender list of the bridge as sniffer, Wireshark button (js/mitschnitt.js)
}
