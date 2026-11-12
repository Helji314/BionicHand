"use strict";
// test_tool: mitschnitt.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Capture for Wireshark, and the test bridge as sniffer
// ===========================================================================
// Every radio message the page sees is also kept (the last CAPTURE_MAX) so it can
// be saved as a pcapng file for Wireshark (button "Save for Wireshark" in the
// radio packets panel). Two formats (contract C2 of the diagnostic tools round,
// read by protocol/wireshark/handfunk.lua):
//   radio-<stamp>.pcapng: the radio log lines of any board (PACKET_RE in
//     funkpakete.js), link type 147 USER0, 10-byte pseudo header + payload
//   sniff-<stamp>.pcapng: the frames of the test bridge as sniffer, link type
//     127 radiotap (channel + signal), then the 802.11 frame without FCS
//
// Board kind "bsniff": the test bridge (bridge 1.2, command S) listens to all
// ESP-NOW traffic on one channel (k<1..13>) and sends nothing. It prints
//   [sniff] t:12345678 ch:1 rssi:-48 d0 00 00 00 ff ff ff ff ff ff 40 4c ...
//   Sniff: ch:1 frames:1234 other:56 dropped:0          (once per second)
// The page decodes each frame (source, destination, payload), counts it in the
// radio packets panel, lists every sender, and fills the finger cards with the
// DATA of one sender (picked in the sender list; first a glove of ours).
// ===========================================================================
DEVICES.push("bsniff");

Object.assign(TEXTS.en, {
  g_bsniff: "Bridge as sniffer", kurz_bsniff: "Sniffer",
  b_quelle_bsniff: "From bridge.ino (repo tools, firmware 1.2). The test board listens to all ESP-NOW traffic on one channel and sends nothing.",
  bAlsSniffer: "Sniff instead", bAlsSnifferTitel: "Sends S: the test board listens to all ESP-NOW traffic on one channel and sends nothing (bridge firmware 1.2)",
  wireshark: "Save for Wireshark",
  w_titelLog: n => `Saves the last ${n} radio messages of the radio log (Record) as radio-….pcapng. Wireshark shows what is in them with the handfunk dissector (repo protocol, folder wireshark).`,
  w_titelSniff: n => `Saves the last ${n} frames the sniffer heard (Record) as sniff-….pcapng: 802.11 with channel and signal strength. Wireshark shows what is in them with the handfunk dissector (repo protocol, folder wireshark).`,
  w_gespeichert: (n, name) => `${n} packets saved for Wireshark: ${name}`,
  p_gehoert: "heard by the sniffer",
  paketeLeerSniffAus: "Click Record: counts every ESP-NOW message the sniffer hears and keeps it for Wireshark.",
  paketeLeerSniffWarten: ch => `Listening on channel ${ch ?? "?"} – no ESP-NOW message yet. Is a board switched on, on this channel?`,
  sniffKanal: "Channel", sniffKanalTitel: "Sends k + number: the sniffer listens on this radio channel (1 to 13, saved on the bridge). The boards of this project use channel 1.",
  s_tabelle: "Senders the sniffer heard", s_sender: "Sender", s_proS: "per s", s_rssi: "dBm", s_typen: "Messages", s_an: "To",
  s_eigen: "ours", s_fremd: "foreign", s_alle: "everyone",
  s_eigenTitel: "A board this page knows (connected here before, or a radio partner), or one that talks to it",
  s_fremdTitel: "A board this page doesn't know: probably another group on the same channel",
  s_zeileTitel: "Click: the finger cards show the DATA of this sender",
  s_wiederholt: n => `↻${n}`, s_wiederholtTitel: "↻ = frames the radio sent again because no ACK came (retry flag, same sequence number). They are counted like the others.",
  s_status: (ch, frames, other, dropped) => `Channel ${ch}: ${frames} ESP-NOW frames, ${other} other Wi-Fi frames` + (dropped ? `, ${dropped} lines dropped (serial too slow).` : ", none dropped."),
  s_keinStatus: "No status line from the sniffer yet (\"Sniff: …\", once per second). Bridge firmware 1.2 or newer?",
  s_auswahl: mac => `Finger cards: the DATA that ${mac} sends. Click another row to pick a different sender.`,
  s_auswahlOhneData: mac => `${mac} sends no DATA (a robot hand?), so the finger cards stay empty. Click the row of a glove.`,
  s_keineAuswahl: "The finger cards show the DATA of one sender; the first glove heard is picked.",
});
Object.assign(TEXTS.de, {
  g_bsniff: "Bridge als Sniffer", kurz_bsniff: "Sniffer",
  b_quelle_bsniff: "Aus bridge.ino (Repo tools, Firmware 1.2). Das Testboard hört allen ESP-NOW-Funk auf einem Kanal mit und sendet nichts.",
  bAlsSniffer: "Stattdessen mithören", bAlsSnifferTitel: "Sendet S: das Testboard hört allen ESP-NOW-Funk auf einem Kanal mit und sendet nichts (Bridge-Firmware 1.2)",
  wireshark: "Für Wireshark speichern",
  w_titelLog: n => `Speichert die letzten ${n} Funknachrichten aus dem Funk-Log (Aufzeichnen) als radio-….pcapng. Was drin steht, zeigt Wireshark mit dem handfunk-Dissector (Repo protocol, Ordner wireshark).`,
  w_titelSniff: n => `Speichert die letzten ${n} Rahmen, die der Sniffer gehört hat (Aufzeichnen), als sniff-….pcapng: 802.11 mit Kanal und Signalstärke. Was drin steht, zeigt Wireshark mit dem handfunk-Dissector (Repo protocol, Ordner wireshark).`,
  w_gespeichert: (n, name) => `${n} Pakete für Wireshark gespeichert: ${name}`,
  p_gehoert: "vom Sniffer gehört",
  paketeLeerSniffAus: "Auf Aufzeichnen klicken: zählt jede ESP-NOW-Nachricht, die der Sniffer hört, und hebt sie für Wireshark auf.",
  paketeLeerSniffWarten: ch => `Hört auf Kanal ${ch ?? "?"} – noch keine ESP-NOW-Nachricht. Ist ein Board an, auf diesem Kanal?`,
  sniffKanal: "Kanal", sniffKanalTitel: "Sendet k + Zahl: der Sniffer hört auf diesem Funkkanal (1 bis 13, wird auf der Bridge gespeichert). Die Boards dieses Projekts nutzen Kanal 1.",
  s_tabelle: "Sender, die der Sniffer gehört hat", s_sender: "Sender", s_proS: "pro s", s_rssi: "dBm", s_typen: "Nachrichten", s_an: "An",
  s_eigen: "unseres", s_fremd: "fremd", s_alle: "alle",
  s_eigenTitel: "Ein Board, das diese Seite kennt (war hier schon verbunden, oder ist Funkpartner), oder eines, das mit ihm funkt",
  s_fremdTitel: "Ein Board, das diese Seite nicht kennt: wahrscheinlich eine andere Gruppe auf demselben Kanal",
  s_zeileTitel: "Klick: die Fingerkarten zeigen die DATA dieses Senders",
  s_wiederholt: n => `↻${n}`, s_wiederholtTitel: "↻ = Rahmen, die der Funk nochmal geschickt hat, weil kein ACK kam (Retry-Bit, gleiche Folgenummer). Sie werden mitgezählt.",
  s_status: (ch, frames, other, dropped) => `Kanal ${ch}: ${frames} ESP-NOW-Rahmen, ${other} andere WLAN-Rahmen` + (dropped ? `, ${dropped} Zeilen verworfen (seriell zu langsam).` : ", nichts verworfen."),
  s_keinStatus: "Noch keine Statuszeile vom Sniffer („Sniff: …“, einmal pro Sekunde). Bridge-Firmware 1.2 oder neuer?",
  s_auswahl: mac => `Fingerkarten: die DATA, die ${mac} sendet. Andere Zeile anklicken, um einen anderen Sender zu wählen.`,
  s_auswahlOhneData: mac => `${mac} sendet keine DATA (eine Roboterhand?), deshalb bleiben die Fingerkarten leer. Die Zeile eines Handschuhs anklicken.`,
  s_keineAuswahl: "Die Fingerkarten zeigen die DATA eines Senders; der erste gehörte Handschuh wird gewählt.",
});
// texts that differ per board kind
TEXTS.en.fingerTipp.bsniff = "The DATA one sender sends (picked under Radio packets)";
TEXTS.de.fingerTipp.bsniff = "Die DATA, die ein Sender schickt (unter Funkpakete gewählt)";
TEXTS.en.verlaufTipp.bsniff = "DATA of the picked sender";
TEXTS.de.verlaufTipp.bsniff = "DATA des gewählten Senders";

// ---------------------------------------------------------------------------
// Capture buffers and the pcapng writer
// ---------------------------------------------------------------------------
const CAPTURE_MAX = 20000;
const capture = {
  log: [],     // [{ms, dir, board, mac, bytes}]: radio log lines (C2b)
  sniff: [],   // [{ms, ch, rssi, frame}]: sniffer frames (C2a)
};
// pseudo header byte 2: which board printed the radio log line
const LOG_BOARD = { glove: 0, hand: 1, sim: 2, bglove: 3, bhand: 4 };
const wallMs = now => performance.timeOrigin + now;   // PC wall clock when the line arrived

function keepCapture(list, entry) {
  list.push(entry);
  if (list.length > CAPTURE_MAX + 500) list.splice(0, list.length - CAPTURE_MAX);
}
function resetCapture() { capture.log = []; capture.sniff = []; }
const macBytes = mac => mac ? mac.split(":").map(h => parseInt(h, 16)) : [0, 0, 0, 0, 0, 0];

// From packetLine: one binary radio log line (JSON lines of old firmware are skipped)
function captureLog(device, dir, mac, bytes, now) {
  keepCapture(capture.log, { ms: wallMs(now), dir: dir === "tx" ? 0 : 1, board: LOG_BOARD[device] ?? 0, mac: macBytes(mac), bytes: Uint8Array.from(bytes) });
}

// pcapng: section header, one interface (if_tsresol = µs), one enhanced packet block per packet
function pcapng(linktype, list) {
  const pad = n => (n + 3) & ~3;
  let size = 28 + 20;
  for (const p of list) size += 32 + pad(p.length);
  const buf = new Uint8Array(size), v = new DataView(buf.buffer);
  let o = 0;
  const u32 = x => { v.setUint32(o, x, true); o += 4; }, u16 = x => { v.setUint16(o, x, true); o += 2; };
  u32(0x0A0D0D0A); u32(28); u32(0x1A2B3C4D); u16(1); u16(0); u32(0xFFFFFFFF); u32(0xFFFFFFFF); u32(28);  // SHB, section length unknown (-1)
  u32(1); u32(20); u16(linktype); u16(0); u32(65535); u32(20);                                          // IDB
  for (const p of list) {
    const len = 32 + pad(p.length), us = Math.round(p.ms * 1000);
    u32(6); u32(len); u32(0); u32(Math.floor(us / 4294967296)); u32(us % 4294967296); u32(p.length); u32(p.length);
    buf.set(p, o); o += pad(p.length);
    u32(len);
  }
  return buf;
}

// C2b: version 1, direction, logging board, reserved, peer MAC, payload
function logRecord(e) {
  const p = new Uint8Array(10 + e.bytes.length);
  p.set([1, e.dir, e.board, 0, ...e.mac]);
  p.set(e.bytes, 10);
  p.ms = e.ms;
  return p;
}
// C2a: radiotap (version 0, length 13, present = channel + dBm antenna signal), then the 802.11 frame
function sniffRecord(e) {
  const p = new Uint8Array(13 + e.frame.length), freq = 2407 + 5 * e.ch;
  p.set([0, 0, 13, 0, 0x28, 0, 0, 0, freq & 255, freq >> 8, 0x80, 0x00, e.rssi & 255]);
  p.set(e.frame, 13);
  p.ms = e.ms;
  return p;
}

const sniffView = () => state.device === "bsniff";
function saveCapture() {
  const sniffing = sniffView();
  const list = (sniffing ? capture.sniff : capture.log).slice(-CAPTURE_MAX);
  if (!list.length) return;
  const name = `${sniffing ? "sniff" : "radio"}-${stamp()}.pcapng`;
  download(name, pcapng(sniffing ? 127 : 147, list.map(sniffing ? sniffRecord : logRecord)), "application/x-pcapng");
  log(t("w_gespeichert", list.length, name));
}

function showCapture() {
  const n = Math.min(CAPTURE_MAX, (sniffView() ? capture.sniff : capture.log).length);
  const b = $("wiresharkSpeichern"), title = t(sniffView() ? "w_titelSniff" : "w_titelLog", n);
  b.disabled = !n;
  if (b.title !== title) b.title = title;
}

// ---------------------------------------------------------------------------
// Sniffer lines
// ---------------------------------------------------------------------------
const SNIFF_RE = /^\[sniff\] t:(\d+) ch:(\d+) rssi:(-?\d+) ((?:[0-9A-Fa-f]{2} )*[0-9A-Fa-f]{2})\s*$/;
const SNIFF_STATUS_RE = /^Sniff: ch:(\d+) frames:(\d+) other:(\d+) dropped:(\d+)/;
const SNIFF_MODE_RE = /^Bridge mode sniffer\b.*?\bchannel (\d+)|^Bridge sniff channel (\d+)/;  // the second: k in another mode
const BROADCAST_MAC = "FF:FF:FF:FF:FF:FF";
const SNIFF_WINDOW_MS = 2000;

const sniff = {
  senders: {},      // mac -> {mac, times, count, rssi, types, dst, last, values, dataTime, seq, repeats}
  selected: null,   // sender whose DATA fills the finger cards
  auto: true,       // picked by the page (until a row is clicked)
  channel: null,
  status: null,     // {ch, frames, other, dropped, time}
  error: null,      // {text, time}: last "ERROR: ..." of the sniffer (wrong channel, m in sniffer mode)
  undecoded: 0,     // frames that were no ESP-NOW frame
  known: null, knownTime: 0,
};
function resetSniff() {
  Object.assign(sniff, { senders: {}, selected: null, auto: true, undecoded: 0, known: null });
}

const macText = (f, at) => f.slice(at, at + 6).map(x => x.toString(16).toUpperCase().padStart(2, "0")).join(":");

// ESP-NOW frame (C1): 24-byte MAC header (addr1 = destination, addr2 = source),
// category 0x7F, OUI 18:FE:34, 4 random bytes, vendor element 0xDD, length,
// OUI 18:FE:34, type 4, version, payload
function decodeEspNow(f) {
  if (f.length < 39 || f[0] !== 0xD0 || f[24] !== 0x7F || f[32] !== 0xDD || f[37] !== 0x04) return null;
  if (f[25] !== 0x18 || f[26] !== 0xFE || f[27] !== 0x34 || f[34] !== 0x18 || f[35] !== 0xFE || f[36] !== 0x34) return null;
  const n = f[33] - 5;
  if (n < 0 || 39 + n > f.length) return null;
  return { dst: macText(f, 4), src: macText(f, 10), seq: (f[22] | f[23] << 8) >> 4, payload: f.slice(39, 39 + n) };
}

// DATA: 'D', finger mask, one byte per finger in the mask (repo protocol)
function dataValues(p) {
  const out = {};
  let i = 2;
  CHANNELS.forEach((c, bit) => { if (p[1] & (1 << bit) && i < p.length) out[c.k] = p[i++] / 255; });
  return out;
}

// MACs this page knows: connected boards, their partners, every board with a
// settings backup in this browser (versionen.js), and the made-up pair in the demo.
function knownMacs(now) {
  if (sniff.known && now - sniff.knownTime < 2000) return sniff.known;
  const set = new Set();
  const add = m => { if (m) set.add(String(m).toUpperCase()); };
  for (const c of connections) { add(c.mac); add(c.target); add(c.lastGlove); }
  add(state.target); add(state.lastGlove);
  if (state.source === "demo") { add(SNIFF_DEMO.glove); add(SNIFF_DEMO.hand); }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sicherung:")) add(k.slice(10));
    }
  } catch (e) {}
  set.delete(BROADCAST_MAC);
  sniff.known = set; sniff.knownTime = now;
  return set;
}
const isOurs = (s, known) => known.has(s.mac) || (s.dst !== BROADCAST_MAC && known.has(s.dst));

// Called by handleLine for every line. Returns true if the line was a sniffer line.
// device = the board kind that printed it, shown = it is the one on screen (only
// then it fills the finger cards).
function sniffLine(text, now, device, tag, shown) {
  const mode = SNIFF_MODE_RE.exec(text);
  if (mode) { sniff.channel = +(mode[1] ?? mode[2]); return false; }   // still goes to the log
  // 'ERROR: "x" is not a channel 1..13. Example: k6', 'ERROR: mode sniffer has no partner (m), ...'
  if (device === "bsniff" && /^ERROR: /.test(text)) { sniff.error = { text, time: now }; return false; }
  const st = SNIFF_STATUS_RE.exec(text);
  if (st) {
    sniff.status = { ch: +st[1], frames: +st[2], other: +st[3], dropped: +st[4], time: now };
    sniff.channel = +st[1];
    return logPacket(tag + text);
  }
  const m = SNIFF_RE.exec(text);
  if (!m) return false;
  const frame = m[4].split(" ").map(h => parseInt(h, 16));
  const ch = +m[2], rssi = +m[3];
  sniff.channel = ch;
  // The sniffer always prints: Record (switched on by the first frame) decides
  // whether the frames are counted and kept for Wireshark
  if (!packets.recording && !packets.userOff) packets.recording = true;
  if (packets.recording) keepCapture(capture.sniff, { ms: wallMs(now), ch, rssi, frame: Uint8Array.from(frame) });
  const e = decodeEspNow(frame);
  if (!e) { sniff.undecoded++; return logPacket(tag + text); }
  const s = sniff.senders[e.src] ??= { mac: e.src, times: [], count: 0, rssi: null, types: new Set(), dst: null, last: 0, values: null, dataTime: 0, seq: -1, repeats: 0 };
  s.times.push(now); s.count++; s.rssi = rssi; s.dst = e.dst; s.last = now;
  // The radio repeats a frame nobody acknowledged (retry flag, same sequence number):
  // counted like every frame, but the sender's row says how many were repeats
  if (frame[1] & 0x08 && e.seq === s.seq) s.repeats++;
  s.seq = e.seq;
  const { type, fingers } = packetType(e.payload);
  s.types.add(type);
  if (packets.recording) countPacket("bsniff", type, "luft", e.payload.length, fingers, now);
  if (type === "data") {
    s.values = dataValues(e.payload); s.dataTime = now;
    // the page picks a sender: the first glove heard, one of ours before a foreign one
    const cur = sniff.senders[sniff.selected];
    if (sniff.auto && cur !== s) {
      const known = knownMacs(now);
      if (!cur || !cur.dataTime || now - cur.dataTime > SNIFF_WINDOW_MS || (!isOurs(cur, known) && isOurs(s, known))) sniff.selected = s.mac;
    }
    if (shown && sniff.selected === s.mac) takeGlove(s.values, now);
  }
  return logPacket(tag + text);
}

// "SYN DATA WAKEUP", "ACK S D W": the message types a sender sent
function typeText(types) {
  const order = x => { const i = PACKET_TYPES.indexOf(x); return i < 0 ? 99 : i; };
  const list = [...types].sort((a, b) => order(a) - order(b));
  const acks = list.filter(x => x.startsWith("ack ")).map(x => x.slice(4, 5).toUpperCase());
  return [...list.filter(x => !x.startsWith("ack ")).map(x => x.toUpperCase()), ...(acks.length ? ["ACK " + acks.join(" ")] : [])].join(" ");
}

// From showPackets (about 4 times per second)
function showSniff(now) {
  showCapture();
  if (!sniffView()) return;
  const known = knownMacs(now);
  const list = Object.values(sniff.senders);
  for (const s of list) while (s.times.length && now - s.times[0] > SNIFF_WINDOW_MS) s.times.shift();
  list.sort((a, b) => isOurs(b, known) - isOurs(a, known));   // ours first, else in the order heard (rows don't jump)
  let html = "";
  for (const s of list) {
    const ours = isOurs(s, known);
    const to = s.dst === BROADCAST_MAC ? t("s_alle") : "…" + s.dst.slice(9);   // last 3 bytes, the whole MAC in the tooltip
    html += `<tr data-mac="${s.mac}" aria-selected="${s.mac === sniff.selected}" data-leer="${s.times.length ? "nein" : "ja"}" title="${t("s_zeileTitel")}">
      <td><span class="mac">${s.mac}</span> <span class="gruppe" data-art="${ours ? "eigen" : "fremd"}" title="${t(ours ? "s_eigenTitel" : "s_fremdTitel")}">${t(ours ? "s_eigen" : "s_fremd")}</span></td>
      <td class="n">${fmt(s.times.length / (SNIFF_WINDOW_MS / 1000))}</td><td class="n">${s.rssi}</td>
      <td class="typ">${typeText(s.types)}${s.repeats ? ` <span class="klein" title="${t("s_wiederholtTitel")}">${t("s_wiederholt", s.repeats)}</span>` : ""}</td><td class="mac" title="${s.dst}">${to}</td></tr>`;
  }
  const body = $("sniffZeilen");
  if (body.dataset.html !== html) { body.innerHTML = html; body.dataset.html = html; }
  $("sniffTabelle").hidden = !list.length;

  const st = sniff.status && now - sniff.status.time < 3000 ? sniff.status : null;
  const err = sniff.error && now - sniff.error.time < 5000 ? sniff.error.text : null;
  const stText = err ?? (st ? t("s_status", st.ch, st.frames.toLocaleString(language), st.other.toLocaleString(language), st.dropped) : state.source ? t("s_keinStatus") : "");
  const stEl = $("sniffStatus");
  if (stEl.textContent !== stText) stEl.textContent = stText;
  stEl.dataset.art = err ? "fehler" : st && st.dropped ? "warn" : "";

  const sel = sniff.senders[sniff.selected];
  const selText = !list.length ? "" : !sel ? t("s_keineAuswahl") : sel.dataTime ? t("s_auswahl", sel.mac) : t("s_auswahlOhneData", sel.mac);
  if ($("sniffAuswahl").textContent !== selText) $("sniffAuswahl").textContent = selText;

  const k = $("sniffKanal");
  k.disabled = !(viewConn() || state.source === "demo");
  if (sniff.channel && document.activeElement !== k && k.value !== String(sniff.channel)) k.value = String(sniff.channel);
}

// A click on a sender: its DATA goes to the finger cards
$("sniffZeilen").onclick = e => {
  const tr = e.target.closest("tr[data-mac]");
  if (!tr || tr.dataset.mac === sniff.selected) return;
  sniff.selected = tr.dataset.mac;
  sniff.auto = false;
  resetValues();
  packets.shown = 0;
  showPackets(performance.now());
};
$("sniffKanal").onchange = e => { sniff.status = null; send("k" + e.target.value + "\n"); };
$("wiresharkSpeichern").onclick = saveCapture;
