"use strict";
// test_tool: start.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function frame() {
  const now = performance.now();
  while (state.history.length && now - state.history[0].t > HISTORY_MS) state.history.shift();
  while (state.lineTimes.length && now - state.lineTimes[0] > 1000) state.lineTimes.shift();
  const smooth = reducedMotion.matches ? 1 : 0.35;
  for (const id in state.value) state.shown[id] += (state.value[id] - state.shown[id]) * smooth;
  for (const id in state.pos) state.disp[id] += (state.pos[id] - state.disp[id]) * smooth;

  const conn = viewConn();
  const st = statusFresh(now) ? state.status : null;
  if (conn && (conn.detected || conn.manual)) {
    if (state.device === "glove") {
      if (CHANNELS.some(c => isFresh(c.id, now))) setStatus("st_verbunden", "ok");
      else if (CHANNELS.some(c => liveMv(c.id, now) !== null)) setStatus("st_unkalibriert", "warn");
      else setStatus("st_keineWerte", "warn");
    } else if (state.device === "hand") {
      if (!st) setStatus("st_keineZeilen", "warn");
      else if (!st.driver) setStatus("st_servotreiber", "fehler");
      else if (st.connected) setStatus("st_handschuh", "ok");
      else setStatus("st_keinHandschuh", "warn");
    } else if ((state.device === "bglove" || state.device === "bhand") && (conn.radioBroken || st?.radioError)) {
      setStatus(conn.radioBroken ? "st_bKeinFunk" : "st_bFunkFehler", "fehler");
    } else if (state.device === "bglove") {
      if (!st) setStatus("st_keineZeilen", "warn");
      else if (!st.sending) setStatus("st_bPause", "warn");
      else if (st.connected) setStatus("st_bHandAntwortet", "ok");
      else setStatus("st_bKeineHand", "warn");
    } else {
      setStatus(CHANNELS.some(c => isFresh(c.id, now)) ? "st_simWerte" : "st_simWartet", CHANNELS.some(c => isFresh(c.id, now)) ? "ok" : "warn");
    }
  }
  if (state.device === "bglove") $("bPause").setAttribute("aria-pressed", st ? !st.sending : false);
  if (state.device === "glove") $("bPause").setAttribute("aria-pressed", !!(viewConn() ?? (state.source === "demo" ? demo : null))?.radioOff);
  if (state.device === "hand") {
    $("mHandschuh").setAttribute("aria-pressed", st ? !st.manual : false);
    $("mManuell").setAttribute("aria-pressed", st ? st.manual : false);
    $("resetHinweis").hidden = !(st && (st.manual || st.test));
    if (st) {
      const text = t(st.test ? "resetTest" : "resetManuell");
      if ($("resetText").textContent !== text) $("resetText").textContent = text;
    }
    if (conn || state.source === "demo") $("test").disabled = !!(st && st.test);
    showTakeOver();
  }
  $("rate").textContent = state.lineTimes.length ? t("zeilenProS", state.lineTimes.length) : "";

  drawHand($("hand"), id => replayValue(id) ?? (sliderView() ? handValue(id, now) : liveValue(id, now)), id => CHANNEL[id].color);
  const visible = updateCards(now);
  $("leer").hidden = !!state.source && visible > 0 || state.source === "demo";
  drawHistory(now);
  showPackets(now);
  tickCalibration(now);
  tickTracking(now);
  tickCamera(now);
  tickCameraInput(now);
  tickTools(now);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
buildCards();
buildDemoChoice();

if (!("serial" in navigator)) {
  $("keinSerial").hidden = false;
  $("verbinden").disabled = true;
} else {
  navigator.serial.addEventListener("disconnect", e => {
    const c = connections.find(c => c.port === e.target);
    if (c) disconnectOne(c);
  });
}

$("verbinden").onclick = () => (connections.length ? disconnect() : connect());
$("verbinden2").onclick = connect;
$("demo").onclick = () => (state.source === "demo" ? stopDemo() : (connections.length ? null : startDemo()));
$("geraet").onchange = e => {
  const d = e.target.value;
  if (connections.length > 1) { setDevice(d, "view"); return; }
  const c = connections[0], wasDemo = state.source === "demo";
  setDevice(d, c ? "manual" : "start", c ?? null);
  if (c) log(t("logErkannt", t("g_" + d)));
  if (wasDemo) startDemo();
};
$("kalibrieren").onclick = openCalibration;
$("info").onclick = () => send("i");
$("mac").onclick = copyMac;
$("partnerSetzen").onclick = setTarget;
$("partnerAlle").onclick = () => send("m\n");
$("partnerUebernehmen").onclick = () => { $("partnerEingabe").value = state.lastGlove; setTarget(); };
$("partnerEingabe").addEventListener("keydown", e => { if (e.key === "Enter") setTarget(); });
$("partnerEingabe").addEventListener("input", e => e.target.removeAttribute("aria-invalid"));
$("logLeeren").onclick = () => { $("log").textContent = ""; };
function sendCommand() {
  const v = $("befehlEingabe").value.trim();
  if (!v) return;
  send(v + "\n");
  $("befehlEingabe").value = "";
}
$("befehlSenden").onclick = sendCommand;
$("befehlEingabe").addEventListener("keydown", e => { if (e.key === "Enter") sendCommand(); });
for (const b of document.querySelectorAll("[data-befehl]")) {
  b.onclick = () => {
    if (b.dataset.befehl === "k") log(t("logKurzKal"));
    send(b.dataset.befehl);
  };
}
for (const b of document.querySelectorAll("[data-griff]")) b.onclick = () => runGrip(b.dataset.griff);
$("test").onclick = () => send("t");
$("bPause").onclick = () => send(state.device === "glove" ? "f" : "x");
$("reset").onclick = $("reset2").onclick = () => send("r");
$("mHandschuh").onclick = () => send("h");
$("mManuell").onclick = () => send("v");
$("paketeAn").onclick = () => setPackets(!packets.recording);
$("paketeLeeren").onclick = () => {
  const on = packets.recording;
  resetPackets();
  packets.recording = on;
};

const mainHand = () => handViews.get($("hand"));
$("explosion").onclick = () => {
  const v = mainHand(); if (!v) return;
  v.explosionTarget = v.explosionTarget ? 0 : 1;
  $("explosion").setAttribute("aria-pressed", !!v.explosionTarget);
  $("zusammen").hidden = !v.explosionTarget && !v.anyPulled();
};
$("loesen").onclick = () => {
  const v = mainHand(); if (!v) return;
  v.unlocked = !v.unlocked;
  $("loesen").setAttribute("aria-pressed", v.unlocked);
  $("handTipp").dataset.t = v.unlocked ? "handTippLoesen" : "handTipp";
  $("handTipp").textContent = t($("handTipp").dataset.t);
};
$("zusammen").onclick = () => {
  const v = mainHand(); if (!v) return;
  v.reassemble();
  $("explosion").setAttribute("aria-pressed", false);
  $("zusammen").hidden = true;
};
$("deckel").onclick = () => {
  handOptions.lid = !handOptions.lid;
  $("deckel").setAttribute("aria-pressed", handOptions.lid);
};
function showTheme() {
  $("thema").textContent = t(document.documentElement.dataset.thema === "dunkel" ? "hell" : "dunkel");
}
$("layoutWahl").value = document.documentElement.dataset.layout;
$("stilWahl").value = document.documentElement.dataset.stil;
for (const [id, key] of [["layoutWahl", "layout"], ["stilWahl", "stil"]]) {
  $(id).onchange = () => {
    document.documentElement.dataset[key] = $(id).value;
    try { localStorage.setItem(key, $(id).value); } catch (e) {}
  };
}
$("thema").onclick = () => {
  const next = document.documentElement.dataset.thema === "dunkel" ? "hell" : "dunkel";
  document.documentElement.dataset.thema = next;
  try { localStorage.setItem("thema", next); } catch (e) {}
  showTheme();
};
$("sprache").onchange = e => {
  language = e.target.value === "de" ? "de" : "en";
  try { localStorage.setItem("sprache", language); } catch (err) {}
  setTexts();
};

// Last board kind (decides the demo until a board is connected)
let startDevice = "glove";
try { startDevice = localStorage.getItem("geraet") || "glove"; } catch (e) {}
$("geraet").addEventListener("change", e => { try { localStorage.setItem("geraet", e.target.value); } catch (err) {} });
setStatus("st_getrennt", "");
setDevice(startDevice, "start");

requestAnimationFrame(frame);
