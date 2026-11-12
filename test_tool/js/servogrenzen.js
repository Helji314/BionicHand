"use strict";
// test_tool: servogrenzen.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Servo limits (robot hand, commands g and x)
// ===========================================================================
const limitEdit = {};      // key -> {open, closed} while changed in the window
let limitAsked = 0;
let followTimer = null, followPending = null;

function openLimits() {
  toggleWindow("grenzenFenster", $("grenzenKnopf"), () => {
    for (const k in limitEdit) delete limitEdit[k];
    limitAsked = performance.now();
    speedEdit = null;
    sendToDevice("hand", "g\n");
    sendToDevice("hand", "b\n");
    buildLimits();
  });
}

function buildLimits() {
  const box = $("grenzenListe");
  const self = boardSelf("hand");
  const limits = self?.limits ?? {};
  const keys = CHANNELS.map(c => c.k).filter(k => limits[k]);
  let msg = "";
  if (!self) msg = t("g_keineHand");
  else if (!keys.length) msg = self.fw?.missing || (self.fw && !fwNew(self)) ? t("g_altFw") : t("g_wartet");
  $("grenzenMeldung").textContent = msg;
  $("grenzenMeldung").dataset.art = msg && msg !== t("g_wartet") ? "warn" : "";
  if (box.dataset.keys !== keys.join() + language) {
    box.dataset.keys = keys.join() + language;
    box.innerHTML = "";
    for (const k of keys) {
      const c = CHANNEL[K_TO_ID[k]];
      const row = document.createElement("div");
      row.className = "grenze";
      row.style.setProperty("--f", c.color);
      row.dataset.k = k;
      const slider = side => `<div class="regler"><span class="klein">${t(side === "open" ? "g_offen" : "g_zu")}</span>
        <input type="range" min="0" max="180" step="1" data-seite="${side}" aria-label="${channelName(c.id)} ${t(side === "open" ? "g_offen" : "g_zu")}">
        <span><input type="number" min="0" max="180" step="1" data-seite="${side}"> °</span>
        <button data-fahre="${side}">${t(side === "open" ? "g_fahreOffen" : "g_fahreZu")}</button></div>`;
      row.innerHTML = `<div class="name"><span class="punkt" style="background:${c.color}"></span>${channelName(c.id)}</div>
        <div style="display:grid;gap:4px">${slider("open")}${slider("closed")}</div>
        <div class="knoepfe2"><span class="klein" data-info></span>
          <label class="schalter" title="${t("g_richtungTitel")}"><input type="checkbox" role="switch" data-richtung> ${t("g_richtung")}</label>
          <button data-std title="${t("g_standardTitel")}">${t("g_standard")}</button>
          <button data-speichern class="haupt">${t("g_speichern")}</button></div>`;
      box.appendChild(row);
      for (const inp of row.querySelectorAll("input[data-seite]")) {
        inp.addEventListener("input", () => {
          const e = limitEdit[k] ??= { ...currentLimit(k) };
          e[inp.dataset.seite] = Math.max(0, Math.min(180, Math.round(+inp.value || 0)));
          if ($("grenzenFolgen").checked) followAngle(k, e[inp.dataset.seite]);
          showLimits();
        });
      }
      for (const b of row.querySelectorAll("[data-fahre]")) b.onclick = () => moveServo(k, currentLimit(k)[b.dataset.fahre]);
      // Direction: reversed = the closed angle is smaller than the open one.
      // Switching swaps both angles; with "move along" the servo goes to the new open angle.
      row.querySelector("[data-richtung]").onchange = () => {
        const l = currentLimit(k);
        limitEdit[k] = { open: l.closed, closed: l.open };
        if ($("grenzenFolgen").checked) followAngle(k, limitEdit[k].open);
        showLimits();
      };
      row.querySelector("[data-std]").onclick = () => { delete limitEdit[k]; sendToDevice("hand", `g${k}\n`, false); };
      row.querySelector("[data-speichern]").onclick = () => saveLimit(k);
    }
  }
  showLimits();
}

const currentLimit = k => limitEdit[k] ?? boardSelf("hand")?.limits?.[k] ?? { open: 0, closed: 180 };
const limitChanged = k => {
  const e = limitEdit[k], b = boardSelf("hand")?.limits?.[k];
  return !!(e && b && (e.open !== b.open || e.closed !== b.closed));
};

// Write the numbers into the rows (not into the field that is being typed in)
function showLimits() {
  const self = boardSelf("hand");
  for (const row of $("grenzenListe").children) {
    const k = row.dataset.k, l = currentLimit(k), b = self?.limits?.[k];
    row.querySelector("[data-richtung]").checked = l.closed < l.open;
    for (const inp of row.querySelectorAll("input[data-seite]")) {
      if (document.activeElement === inp && inp.type === "number") continue;
      const v = String(l[inp.dataset.seite]);
      if (inp.value !== v) inp.value = v;
    }
    const changed = limitChanged(k);
    row.dataset.geaendert = changed ? "ja" : "nein";
    row.querySelector("[data-speichern]").disabled = !changed;
    const deg = state.deg[K_TO_ID[k]];
    row.querySelector("[data-info]").textContent =
      (deg !== undefined ? t("g_jetzt", Math.round(deg)) + " · " : "") + (b ? t(b.std ? "g_konfig" : "g_gespeichert") : "");
  }
  $("grenzenAlle").disabled = !Object.keys(limitEdit).some(limitChanged);
  showSpeed();
}

// Top speed of all servos (command b, firmware 2.1): one row under the limits
let speedEdit = null;  // °/s while changed in the window
const clampSpeed = v => Math.max(10, Math.min(600, Math.round(+v || 0)));
function showSpeed() {
  const self = boardSelf("hand"), s = self?.speed;
  const v = speedEdit ?? s?.deg ?? 300;
  for (const inp of [$("tempoRegler"), $("tempoZahl")]) {
    inp.disabled = !s;
    if (document.activeElement === inp && inp.type === "number") continue;
    if (inp.value !== String(v)) inp.value = String(v);
  }
  const changed = !!(s && speedEdit !== null && speedEdit !== s.deg);
  $("tempoZeile").dataset.geaendert = changed ? "ja" : "nein";
  $("tempoSpeichern").disabled = !changed;
  $("tempoStandard").disabled = !s || s.std;
  const old = self?.fw?.missing || (self?.fw && self.fw.role === "hand" && cmpVersion(self.fw.version, "2.1") < 0);
  const info = !self ? "" : s ? t(s.std ? "g_konfig" : "g_gespeichert") : t(old ? "g_tempoAltFw" : "g_tempoWartet");
  if ($("tempoInfo").textContent !== info) $("tempoInfo").textContent = info;
}
function speedConfirmed() {
  const s = boardSelf("hand")?.speed;
  if (s && speedEdit === s.deg) {
    speedEdit = null;
    if ($("grenzenFenster").open) { $("grenzenMeldung").textContent = t("g_tempoOk"); $("grenzenMeldung").dataset.art = "ok"; }
  }
  if ($("grenzenFenster").open) showSpeed();
}
for (const inp of [$("tempoRegler"), $("tempoZahl")]) {
  inp.addEventListener("input", () => { speedEdit = clampSpeed(inp.value); showSpeed(); });
}
$("tempoSpeichern").onclick = () => { if (speedEdit !== null) sendToDevice("hand", `b${speedEdit}\n`, false); };
$("tempoStandard").onclick = () => { speedEdit = null; sendToDevice("hand", "b0\n", false); };

// While dragging: the servo follows, at most every 80 ms (the last value always arrives)
function followAngle(k, deg) {
  followPending = [k, deg];
  if (followTimer) return;
  const tick = () => {
    if (!followPending) { followTimer = null; return; }
    moveServo(...followPending);
    followPending = null;
    followTimer = setTimeout(tick, 80);
  };
  tick();
}
const moveServo = (k, deg) => sendToDevice("hand", `x${k}=${Math.round(deg)}\n`);

function saveLimit(k) {
  const l = currentLimit(k);
  sendToDevice("hand", `g${k}=${l.open},${l.closed}\n`, false);
}
function limitConfirmed(k) {
  const e = limitEdit[k], b = boardSelf("hand")?.limits?.[k];
  if (e && b && e.open === b.open && e.closed === b.closed) {
    delete limitEdit[k];
    if ($("grenzenFenster").open) { $("grenzenMeldung").textContent = t("g_ok", channelName(K_TO_ID[k])); $("grenzenMeldung").dataset.art = "ok"; }
  }
  if ($("grenzenFenster").open) buildLimits();
}

$("grenzenKnopf").onclick = openLimits;
$("grenzenAlle").onclick = () => { for (const k of Object.keys(limitEdit)) if (limitChanged(k)) saveLimit(k); };
$("grenzenZurueck").onclick = () => sendToDevice("hand", "r", false);
