"use strict";
// test_tool: pins.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Pin assignment (glove command P, firmware 2.3; robot hand command K, firmware 2.4)
// ===========================================================================
// Glove: which GPIO each sensor is on ("-" = not connected).
// Robot hand: which HW-170 channel (0..15) each servo is on, plus SDA/SCL.
// Saving restarts the board; it then prints its pins again.
const pinEdit = {};  // key -> text while changed in the window

// The board this window is about: the glove if one is shown/connected, else the hand.
function pinDevice() {
  if (state.source === "demo") return ["glove", "hand"].includes(state.device) ? state.device : null;
  return boardSelf("glove") ? "glove" : boardSelf("hand") ? "hand" : null;
}
const pinCommand = device => device === "glove" ? "P" : "K";

function openPins() {
  toggleWindow("pinsFenster", $("pinsKnopf"), () => {
    for (const k in pinEdit) delete pinEdit[k];
    const d = pinDevice();
    if (d) sendToDevice(d, pinCommand(d) + "\n");
    buildPins();
  });
}

// Lines: glove "Pin F1 GPIO34 saved" / "Pin S0 - default",
//        hand  "Belegung F1 Kanal 5 gespeichert" / "Belegung SDA 19 standard"
const PIN_RE = /^Pin (\S+) (?:GPIO(\d+)|-) (default|saved)$/;
const PIN_TEXT_RE = /^Pins: analog pins on this board: (.+)$/;
const BELEGUNG_RE = /^Belegung (\S+) (?:Kanal )?(?:(\d+)|-) (standard|gespeichert)$/;
function pinLine(text, device, self) {
  const m = device === "glove" ? PIN_RE.exec(text) : device === "hand" ? BELEGUNG_RE.exec(text) : null;
  if (m) {
    (self.pins ??= {})[m[1]] = { value: m[2] === undefined ? "-" : m[2], saved: m[3] === "saved" || m[3] === "gespeichert" };
    if (pinEdit[m[1]] === self.pins[m[1]].value) delete pinEdit[m[1]];
    if ($("pinsFenster").open) buildPins();
    return true;
  }
  const a = device === "glove" && PIN_TEXT_RE.exec(text);
  if (a) { self.analogPins = a[1]; if ($("pinsFenster").open) buildPins(); return true; }
  return false;
}

function buildPins() {
  const box = $("pinsListe");
  const device = pinDevice(), self = device && boardSelf(device);
  const pins = self?.pins ?? {};
  const keys = Object.keys(pins);
  let msg = "";
  if (!device) msg = t("p_keinBoard");
  else if (!keys.length) msg = self?.fw && (self.fw.missing || cmpVersion(self.fw.version, device === "glove" ? "2.3" : "2.4") < 0) ? t("p_altFw") : t("p_wartet");
  $("pinsMeldung").textContent = msg;
  $("pinsMeldung").dataset.art = msg && msg !== t("p_wartet") ? "warn" : "";
  $("pinsText").textContent = device ? t(device === "glove" ? "p_textGlove" : "p_textHand", self?.analogPins) : "";
  const sig = device + keys.join() + language;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = "";
    for (const k of keys) {
      const id = K_TO_ID[k];
      const row = document.createElement("label");
      row.className = "pin-zeile";
      row.dataset.k = k;
      const name = id ? channelName(id) : k;
      row.innerHTML = `<span class="name">${id ? `<span class="punkt" style="background:${CHANNEL[id].color}"></span>` : ""}${name} <span class="klein">${k}</span></span>
        <input type="text" inputmode="numeric" size="4" spellcheck="false" aria-label="${name}">
        <span class="klein" data-info></span>`;
      const inp = row.querySelector("input");
      inp.addEventListener("input", () => { pinEdit[k] = inp.value.trim(); showPins(); });
      box.appendChild(row);
    }
  }
  showPins();
}

function showPins() {
  const device = pinDevice(), self = device && boardSelf(device);
  const pins = self?.pins ?? {};
  let changed = 0;
  for (const row of $("pinsListe").children) {
    const k = row.dataset.k, p = pins[k];
    if (!p) continue;
    const inp = row.querySelector("input");
    const v = pinEdit[k] ?? p.value;
    if (document.activeElement !== inp) inp.value = v;
    const isChanged = pinEdit[k] !== undefined && pinEdit[k] !== p.value;
    if (isChanged) changed++;
    const bad = isChanged && !pinValid(device, k, v);
    inp.classList.toggle("falsch", bad);
    row.querySelector("[data-info]").textContent = bad ? t("p_ungueltig", device, k)
      : isChanged ? t("p_geaendert") : p.saved ? t("p_gespeichert") : t("p_standard");
  }
  const anyBad = [...$("pinsListe").querySelectorAll("input.falsch")].length > 0;
  $("pinsSpeichern").disabled = !changed || anyBad;
  $("pinsStandard").disabled = !device || !Object.values(pins).some(p => p.saved);
}

const isI2c = k => k === "SDA" || k === "SCL";
function pinValid(device, k, v) {
  if (v === "-") return device === "glove" || !isI2c(k);
  if (!/^\d+$/.test(v)) return false;
  return device === "hand" && !isI2c(k) ? +v <= 15 : +v < 255;
}

function savePins() {
  const device = pinDevice();
  if (!device) return;
  const parts = Object.entries(pinEdit).filter(([k, v]) => v !== boardSelf(device)?.pins?.[k]?.value).map(([k, v]) => `${k}=${v}`);
  if (!parts.length) return;
  if (!confirm(t("p_neustart"))) return;
  sendToDevice(device, `${pinCommand(device)}${parts.join(" ")}\n`, false);
}
function resetPins() {
  const device = pinDevice();
  if (!device || !confirm(t("p_neustart"))) return;
  for (const k in pinEdit) delete pinEdit[k];
  sendToDevice(device, `${pinCommand(device)}reset\n`, false);
}

$("pinsKnopf").dataset.fenster = "pinsFenster";
$("pinsKnopf").onclick = openPins;
$("pinsSpeichern").onclick = savePins;
$("pinsStandard").onclick = resetPins;
