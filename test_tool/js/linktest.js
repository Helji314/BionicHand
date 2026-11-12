"use strict";
// test_tool: linktest.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Link check (glove command L, robot hand status line with Daten: and RSSI:)
// ===========================================================================
const link = {
  running: false, start: 0, end: 0, duration: 60000,
  samples: [],      // glove: [{t, ok, fail, sent, resent, acks, rtt, rttMax, round, rssi, rssiMin}]
  hand: [],         // robot hand: [{t, data (per s), rssi}]
  marks: [],
  handLast: null,   // {t, count, rssiSum, rssiN}
  asked: 0,
};

// "[link] ok:10 fail:0 sent:30 ..." from the glove
function linkLine(text, self, now) {
  const m = /^\[link\] (.*)$/.exec(text);
  if (!m) return false;
  self.linkOn = true;
  self.lastLink = now;
  const d = {};
  for (const part of m[1].split(/\s+/)) {
    const p = /^(\w+):(-?\d+(?:\.\d+)?)$/.exec(part);
    if (p) d[p[1]] = +p[2];
  }
  if (link.running) {
    link.samples.push({
      t: now - link.start, ok: d.ok ?? 0, fail: d.fail ?? 0, sent: d.sent ?? 0, resent: d.resent ?? 0, acks: d.acks ?? 0,
      rtt: d.rtt_us !== undefined ? d.rtt_us / 1000 : null, rttMax: d.rtt_max_us !== undefined ? d.rtt_max_us / 1000 : null,
      round: d.round_us !== undefined ? d.round_us / 1000 : null, rssi: d.rssi ?? null, rssiMin: d.rssi_min ?? null,
    });
  }
  return true;
}

// The robot hand's status line: DATA counter and signal strength
function linkHand(d, now) {
  if (d.Daten === undefined) return;
  const h = link.handLast ??= { t: now, count: d.Daten, rssiSum: 0, rssiN: 0 };
  if (d.RSSI !== undefined) { h.rssiSum += d.RSSI; h.rssiN++; }
  if (now - h.t >= 1000) {
    if (link.running && d.Daten >= h.count) {
      link.hand.push({ t: now - link.start, data: (d.Daten - h.count) / ((now - h.t) / 1000), rssi: h.rssiN ? h.rssiSum / h.rssiN : null });
    }
    link.handLast = { t: now, count: d.Daten, rssiSum: 0, rssiN: 0 };
  }
}

function setLinkReport(on) {
  const self = boardSelf("glove");
  if (!self) return;
  const now = performance.now();
  const isOn = !!self.linkOn && now - (self.lastLink ?? 0) < 2500;
  if (on !== isOn) sendToDevice("glove", "L");
  self.linkOn = on;
  if (!on) self.lastLink = 0;
}

function startLink() {
  const glove = boardSelf("glove"), hand = boardSelf("hand");
  if (!glove && !hand) { linkMessage(t("l_keinHs"), "warn"); return; }
  Object.assign(link, { running: true, start: performance.now(), samples: [], hand: [], marks: [], handLast: null,
                        duration: +$("linkDauer").value * 1000, asked: performance.now() });
  if (glove) setLinkReport(true);
  linkMessage(glove ? t("l_wartet") : t("l_nurHand"), glove ? "" : "warn");
  showLinkMarks();
  showLink(performance.now());
}

function stopLink() {
  if (!link.running) return;
  link.running = false;
  link.end = performance.now();
  setLinkReport(false);
  const v = linkVerdict();
  linkMessage(v.text, v.kind);
  showLink(performance.now());
}

function linkMessage(text, kind = "") {
  $("linkMeldung").textContent = text;
  $("linkMeldung").dataset.art = kind;
}

const sum = (a, f) => a.reduce((s, x) => s + (f(x) ?? 0), 0);
const avg = (a, f) => { const v = a.map(f).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

function linkTotals(samples, hand) {
  const ok = sum(samples, s => s.ok), fail = sum(samples, s => s.fail), sent = sum(samples, s => s.sent), resent = sum(samples, s => s.resent);
  const acks = sum(samples, s => s.acks);
  const rtt = acks ? sum(samples, s => (s.rtt ?? 0) * s.acks) / acks : null;
  const rttMax = samples.reduce((m, s) => s.rttMax !== null ? Math.max(m ?? 0, s.rttMax) : m, null);
  const secs = samples.length || 1;
  return { ok, fail, sent, resent, rtt, rttMax, perS: ok / secs, rssi: avg(samples, s => s.rssi),
           rssiHand: avg(hand, h => h.rssi), dataHand: avg(hand, h => h.data) };
}

function signalWord(dbm) {
  if (dbm === null) return "";
  return t(dbm >= -60 ? "sig_stark" : dbm >= -72 ? "sig_gut" : dbm >= -82 ? "sig_schwach" : "sig_sehrSchwach");
}
const signalKind = dbm => dbm === null ? "" : dbm >= -72 ? "ok" : dbm >= -82 ? "warn" : "fehler";

function linkVerdict() {
  const s = linkTotals(link.samples, link.hand);
  const n = s.ok + s.fail;
  if (!n) return { text: boardSelf("glove") ? t("l_keineDaten") : t("l_nurHand"), kind: "warn" };
  const lost = s.fail / n, resend = s.sent ? s.resent / s.sent : 0;
  if (lost === 0 && resend < 0.02) return { text: t("l_urteilGut", n, s.ok), kind: "ok" };
  if (lost < 0.02 && resend < 0.15) return { text: t("l_urteilOk", n, s.ok), kind: "warn" };
  return { text: t("l_urteilSchlecht", n, s.ok), kind: "fehler" };
}

const pct = (a, b) => b ? (100 * a / b).toLocaleString(language, { maximumFractionDigits: 1 }) + " %" : "–";
const ms = v => v === null ? "–" : v.toLocaleString(language, { maximumFractionDigits: 1 }) + " ms";
const dbm = v => v === null || v === undefined ? "–" : Math.round(v) + " dBm";

function showLink(now) {
  if (!$("linkFenster").open) return;
  const glove = boardSelf("glove");
  $("linkStart").textContent = t(link.running ? "l_stopp" : "l_start");
  $("linkStart").disabled = !link.running && !glove && !boardSelf("hand");
  $("linkMarkieren").disabled = !link.running;
  $("linkCsv").disabled = !link.samples.length && !link.hand.length;
  const elapsed = (link.running ? now : link.end) - link.start;
  $("linkZeit").textContent = link.start ? fmtTime(elapsed) + (link.duration ? " / " + fmtTime(link.duration) : "") : "";
  if (link.running && link.duration && elapsed >= link.duration) stopLink();
  if (link.running) {
    if (glove && !link.samples.length && now - link.asked > 4000) linkMessage(glove.fw && !fwNew(glove) || glove.fw?.missing ? t("l_altFw") : t("l_keineDaten"), "warn");
    else if (link.samples.length && $("linkMeldung").textContent !== t("l_laeuft")) linkMessage(t("l_laeuft"));
  }
  // tiles: the last 5 s while measuring, the whole run afterwards
  const recent = a => link.running ? a.filter(x => x.t > elapsed - 5000) : a;
  const s = linkTotals(recent(link.samples), recent(link.hand));
  const n = s.ok + s.fail;
  const tiles = [
    ["l_k_durchlaeufe", link.samples.length ? s.perS.toLocaleString(language, { maximumFractionDigits: 1 }) : "–", ""],
    ["l_k_verloren", pct(s.fail, n), !n ? "" : s.fail === 0 ? "ok" : s.fail / n < 0.02 ? "warn" : "fehler"],
    ["l_k_wiederholt", pct(s.resent, s.sent), !s.sent ? "" : s.resent / s.sent < 0.02 ? "ok" : s.resent / s.sent < 0.15 ? "warn" : "fehler"],
    ["l_k_rtt", ms(s.rtt), ""],
    ["l_k_rttMax", ms(s.rttMax), ""],
    ["l_k_signalHs", dbm(s.rssi), signalKind(s.rssi), signalWord(s.rssi)],
    ["l_k_signalHand", dbm(s.rssiHand), signalKind(s.rssiHand), signalWord(s.rssiHand)],
    ["l_k_daten", s.dataHand === null ? "–" : s.dataHand.toLocaleString(language, { maximumFractionDigits: 1 }), ""],
  ];
  const box = $("linkKacheln");
  if (box.children.length !== tiles.length || box.dataset.sprache !== language) {
    box.dataset.sprache = language;
    box.innerHTML = tiles.map(() => `<div class="kachel"><div class="klein"></div><div class="wert"></div><div class="klein"></div></div>`).join("");
  }
  tiles.forEach(([key, value, kind, note], i) => {
    const el = box.children[i];
    el.children[0].textContent = t(key);
    el.children[1].textContent = value;
    el.children[2].textContent = note ?? "";
    el.dataset.art = kind;
  });
  drawLinkChart(elapsed);
}

function drawLinkChart(elapsed) {
  const canvas = $("linkKurve");
  const { ctx, w, h } = prepare(canvas);
  const left = 34, right = 40, top = 8, bottom = 18;
  const span = Math.max(link.duration || 0, elapsed, 10000);
  const x = tm => left + (w - left - right) * tm / span;
  const rttMax = Math.max(10, ...link.samples.map(s => s.rttMax ?? s.rtt ?? 0)) * 1.1;
  const yRtt = v => top + (h - top - bottom) * (1 - v / rttMax);
  const yDb = v => top + (h - top - bottom) * (1 - (v + 100) / 70);  // -100..-30 dBm
  ctx.font = "11px " + css("--schrift");
  ctx.fillStyle = css("--muted");
  ctx.strokeStyle = css("--gitter");
  ctx.lineWidth = 1;
  for (const v of [-90, -70, -50]) {
    ctx.beginPath(); ctx.moveTo(left, yDb(v)); ctx.lineTo(w - right, yDb(v)); ctx.stroke();
    ctx.fillText(v + "", w - right + 4, yDb(v) + 4);
  }
  ctx.fillText(Math.round(rttMax) + " ms", 0, top + 8);
  ctx.fillText("0", left - 12, h - bottom + 4);
  ctx.fillText(fmtTime(span), w - right - 24, h - 4);
  // lost rounds
  ctx.fillStyle = css("--fehler");
  for (const s of link.samples) if (s.fail) ctx.fillRect(x(s.t) - 1.5, top, 3, h - top - bottom);
  const line = (points, color, width = 2) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    let started = false;
    for (const [px, py] of points) {
      if (py === null) { started = false; continue; }
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  line(link.samples.map(s => [x(s.t), s.rtt === null ? null : yRtt(s.rtt)]), css("--akzent"));
  line(link.samples.map(s => [x(s.t), s.rssi === null ? null : yDb(s.rssi)]), css("--ok"));
  line(link.hand.map(s => [x(s.t), s.rssi === null ? null : yDb(s.rssi)]), css("--warn"));
}

function markLink() {
  const elapsed = performance.now() - link.start;
  const last = a => a.filter(x => x.t > elapsed - 5000);
  const s = linkTotals(last(link.samples), last(link.hand));
  link.marks.push({ name: $("linkMarke").value.trim() || String(link.marks.length + 1), t: elapsed, ...s });
  $("linkMarke").value = "";
  showLinkMarks();
}
function showLinkMarks() {
  const table = $("linkMarken");
  table.hidden = !link.marks.length;
  table.tBodies[0].innerHTML = link.marks.map(m => `<tr><td></td><td class="n">${dbm(m.rssi)}</td><td class="n">${dbm(m.rssiHand)}</td>
    <td class="n">${pct(m.ok, m.ok + m.fail)}</td><td class="n">${pct(m.resent, m.sent)}</td><td class="n">${ms(m.rtt)}</td></tr>`).join("");
  [...table.tBodies[0].rows].forEach((r, i) => { r.cells[0].textContent = link.marks[i].name; });  // name is user text
}

function linkCsv() {
  const rows = [["seconds", "rounds_ok", "rounds_failed", "sent", "resent", "rtt_ms", "rtt_max_ms", "round_ms", "rssi_glove_dbm", "rssi_hand_dbm", "data_hand_per_s"]];
  const times = [...new Set([...link.samples, ...link.hand].map(s => Math.round(s.t / 1000)))].sort((a, b) => a - b);
  for (const sec of times) {
    const s = link.samples.find(x => Math.round(x.t / 1000) === sec) ?? {};
    const h = link.hand.find(x => Math.round(x.t / 1000) === sec) ?? {};
    rows.push([sec, s.ok, s.fail, s.sent, s.resent, s.rtt?.toFixed(2), s.rttMax?.toFixed(2), s.round?.toFixed(2), s.rssi, h.rssi?.toFixed(0), h.data?.toFixed(1)]);
  }
  if (link.marks.length) {
    rows.push([], ["position", "rssi_glove_dbm", "rssi_hand_dbm", "rounds_ok", "rounds_failed", "sent", "resent", "rtt_ms"]);
    for (const m of link.marks) rows.push([`"${m.name.replace(/"/g, '""')}"`, m.rssi?.toFixed(0), m.rssiHand?.toFixed(0), m.ok, m.fail, m.sent, m.resent, m.rtt?.toFixed(2)]);
  }
  download(`link-check-${stamp()}.csv`, rows.map(r => r.map(v => v ?? "").join(",")).join("\n"), "text/csv");
}

$("linkKnopf").onclick = () => toggleWindow("linkFenster", $("linkKnopf"), () => {
  if (!link.running && !link.samples.length) linkMessage(boardSelf("glove") ? "" : boardSelf("hand") ? t("l_nurHand") : t("l_keinHs"), boardSelf("glove") ? "" : "warn");
  showLink(performance.now());
});
$("linkStart").onclick = () => (link.running ? stopLink() : startLink());
$("linkMarkieren").onclick = markLink;
$("linkMarke").addEventListener("keydown", e => { if (e.key === "Enter" && link.running) markLink(); });
$("linkCsv").onclick = linkCsv;
$("linkFenster").addEventListener("close", stopLink);
