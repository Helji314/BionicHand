"use strict";
// test_tool: kalibrierung.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Calibration wizard
// ===========================================================================
// The page measures from the raw values the glove streams (compensated mV if
// available) and sends the result back with "c<name>=<straight>,<bent>".
const PREPARE_MS = 3000, PREPARE_AUTO_MS = 4000, MEASURE_MS = 3000, NEXT_DELAY_MS = 1300;
const NOISY_MV = 30;  // standard deviation at rest above this: check the wiring

// The same wizard calibrates the test hand's camera mapping (cal.camera, opened from
// "Camera as glove"): the camera's smoothed bends are scaled to 0..MAX_MV, so the same
// steps, thresholds and drawings work; the result is saved as the camera mapping.
const calMv = (id, now) => {
  if (!cal.camera) return liveMv(id, now);
  const v = track.smooth?.[id];
  return v === undefined || performance.now() - track.handTime > 1000 ? null : v * MAX_MV;
};
const calUnit = v => cal.camera ? Math.round(v / MAX_MV * 100) + " %" : Math.round(v) + " mV";
const calNum = v => cal.camera ? Math.round(v / MAX_MV * 100) : Math.round(v);
const noisyLimit = () => cal.camera ? 0.03 * MAX_MV : NOISY_MV;
const CAL_CAMERA_TEXTS = new Set(["speichern", "k_intro", "k_introText", "k_keineDaten", "k_tippIntro", "s_faustText", "s_offen2Text",
  "u_keineDaten", "u_zurueck", "u_schwach", "u_gespeichert", "e_sensor", "e_gerade", "e_gebeugt", "k_alt"]);
function ct(key, ...values) { return t(cal.camera && CAL_CAMERA_TEXTS.has(key) ? "kc_" + key : key, ...values); }

const cal = {
  steps: [], ids: [], index: 0,
  phase: "intro",          // intro | ready | prepare | measure | done | results | saving
  phaseStart: 0,
  autoStarted: false,      // countdown started by itself: a bit longer to read
  samples: {},
  open1: {}, open2: {}, bent: {}, fist: {}, thumbPose: {},
  stepState: {},           // step id -> "fertig" | "warn"
  verdict: null,
  returnToResults: false,
  confirmed: new Set(),
  finished: false,
  timer: null,
};

function presentChannels() {
  const now = performance.now();
  return CHANNELS.filter(c => calMv(c.id, now) !== null).map(c => c.id);
}

// Step texts are looked up when shown, so switching the language works mid-calibration.
function stepTexts(s) {
  if (s.kind === "open") return [ct("s_offen"), ct("s_offenTitel"), ct("s_offenText")];
  if (s.kind === "fist") return [ct("s_faust"), ct("s_faustTitel"), ct("s_faustText")];
  if (s.kind === "open2") return [ct("s_offen2"), ct("s_offen2Titel"), ct("s_offen2Text")];
  if (s.kind === "results") return [ct("s_ergebnis"), ct(cal.finished ? "s_gespeichertTitel" : "s_ergebnisTitel"), ct("s_ergebnisText")];
  if (s.kind === "bend") {
    if (s.id === "ringPinky") return [ct("s_ringKlein"), ct("b_ringPinky"), ct("bt_ringPinky")];
    const name = channelName(s.id);
    if (s.id === "thumbFlex" || s.id === "thumbOpp") return [name, ct("b_" + s.id), ct("bt_" + s.id)];
    return [name, ct("b_finger", name), ct("bt_finger", name)];
  }
  return ["", "", ""];
}

// thumb steps: the other thumb value, recorded too in camera mode
const THUMB_OTHER = { thumbFlex: "thumbOpp", thumbOpp: "thumbFlex" };

// How far the 3D hand in the step picture bends a finger whose tip touches the palm
const PALM_TOUCH_POSE = 0.8;

function buildSteps(ids) {
  const steps = [{ id: "intro", kind: "intro" }];
  steps.push({ id: "open", kind: "open", channels: ids, pose: {} });
  // Fingertip to the palm without curling the finger in. That is 100 %; a curled-in
  // finger (fist) reads further and is held at 100 %. Index, middle and ring finger reach
  // the palm on their own. The little finger can't (shared tendons): it goes together with
  // the ring finger, and only its own value is taken there (the ring finger has its step).
  for (const id of ["index", "middle", "ring"]) {
    if (ids.includes(id)) steps.push({ id, kind: "bend", channels: [id], pose: { [id]: PALM_TOUCH_POSE } });
  }
  if (ids.includes("pinky")) {
    steps.push({ id: "ringPinky", kind: "bend", channels: ["pinky"], pose: { ring: PALM_TOUCH_POSE, pinky: PALM_TOUCH_POSE } });
  }
  if (ids.includes("thumbFlex")) steps.push({ id: "thumbFlex", kind: "bend", channels: ["thumbFlex"], pose: { thumbFlex: 1 } });
  if (ids.includes("thumbOpp")) steps.push({ id: "thumbOpp", kind: "bend", channels: ["thumbOpp"], pose: { thumbOpp: 1, pinky: 0.35 } });
  const fistIds = ids.filter(id => id !== "thumbOpp");
  if (fistIds.length > 1) {
    steps.push({ id: "fist", kind: "fist", channels: fistIds, pose: { index: 1, middle: 1, ring: 1, pinky: 1, thumbFlex: 1 } });
  }
  steps.push({ id: "open2", kind: "open2", channels: ids, pose: {} });
  steps.push({ id: "results", kind: "results" });
  return steps;
}

function openCalibration(camera = false) {
  cal.camera = camera === true;
  // camera mode: every finger the test board sends; glove: the sensors that stream values
  const ids = cal.camera ? CHANNELS.filter(c => state.source === "demo" || posFresh(c.id)).map(c => c.id) : presentChannels();
  // Before: what the glove has saved now (from "i"), or the camera mapping, to compare in the results
  const self = boardSelf("glove");
  const before = cal.camera
    ? Object.fromEntries(CHANNELS.filter(c => camMap.data?.[c.id]).map(c => [c.id, { straight: camMap.data[c.id].open * MAX_MV, bent: camMap.data[c.id].closed * MAX_MV }]))
    : { ...(self?.calib ?? {}) };
  Object.assign(cal, { steps: buildSteps(ids), ids, allIds: ids, index: 0, open1: {}, open2: {}, bent: {}, fist: {}, thumbPose: {}, noise: {},
    stepState: {}, verdict: null, returnToResults: false, finished: false, before });
  $("live").dataset.step = "";
  setPhase("intro");
  $("kal").showModal();
}

function closeCalibration() {
  clearTimeout(cal.timer);
  if ($("kal").open) $("kal").close();
}

const step = () => cal.steps[cal.index];

function setPhase(phase) {
  clearTimeout(cal.timer);
  cal.phase = phase;
  cal.phaseStart = performance.now();
  if (phase === "measure") cal.samples = Object.fromEntries(step().channels.map(id => [id, []]));
  renderCalibration();
}

function startCountdown(auto) {
  cal.autoStarted = auto;
  setPhase("prepare");
}

function goTo(index, autoStart = false) {
  cal.index = index;
  const s = step();
  if (s.kind === "results") setPhase("results");
  else if (s.kind === "intro") setPhase("intro");
  else if (autoStart) startCountdown(true);
  else setPhase("ready");
}

function next() {
  if (cal.returnToResults) {
    cal.returnToResults = false;
    goTo(cal.steps.length - 1);
    return;
  }
  goTo(Math.min(cal.index + 1, cal.steps.length - 1), $("auto").checked);
}

// Intro: which sensors to calibrate (e.g. only the one that was replaced)
function buildSensorChoice() {
  const box = $("kalAuswahl");
  $("kalAuswahlBox").hidden = cal.phase !== "intro" || cal.allIds.length < 2;
  if ($("kalAuswahlBox").hidden) return;
  if (box.dataset.ids !== cal.allIds.join() + language) {
    box.dataset.ids = cal.allIds.join() + language;
    box.innerHTML = "";
    for (const id of cal.allIds) {
      const l = document.createElement("label");
      l.style.setProperty("--f", CHANNEL[id].color);
      l.innerHTML = `<input type="checkbox" value="${id}"> ${channelName(id)}`;
      l.querySelector("input").onchange = () => {
        cal.ids = cal.allIds.filter(x => box.querySelector(`input[value="${x}"]`).checked);
        cal.steps = buildSteps(cal.ids);
        renderCalibration();
      };
      box.appendChild(l);
    }
  }
  for (const inp of box.querySelectorAll("input")) inp.checked = cal.ids.includes(inp.value);
}

// Calibration that this page saved earlier for this glove (settings backup), if it differs from the glove's
function storedCalibration() {
  const self = boardSelf("glove");
  if (!self?.mac || state.source === "demo") return null;
  // the newest backup (e.g. after a full flash erased the calibration), else the one from before the last calibration
  let older = null;
  try { older = JSON.parse(localStorage.getItem("sicherung-alt:" + self.mac)); } catch (e) {}
  for (const b of [loadBackup(self.mac), older]) {
    if (!b?.calib || !Object.keys(b.calib).length) continue;
    const same = Object.entries(b.calib).every(([n, c]) => cal.before[n] && Math.round(cal.before[n].straight) === Math.round(c.straight) && Math.round(cal.before[n].bent) === Math.round(c.bent));
    if (!same) return b;
  }
  return null;
}

// Phase clock, driven from the animation loop.
function tickCalibration(now) {
  if (!$("kal").open) return;
  const s = step();
  const elapsed = now - cal.phaseStart;
  if (cal.phase === "prepare") {
    const total = cal.autoStarted ? PREPARE_AUTO_MS : PREPARE_MS;
    $("uhrZahl").textContent = Math.max(1, Math.ceil((total - elapsed) / 1000));
    $("fortschritt").firstElementChild.style.width = (Math.min(1, elapsed / total) * 100) + "%";
    if (elapsed >= total) setPhase("measure");
  } else if (cal.phase === "measure") {
    for (const id of s.channels) {
      const v = calMv(id, now);
      if (v !== null) cal.samples[id].push(v);
    }
    // camera, thumb steps: also record the other thumb value (see saveCameraMapping)
    const other = cal.camera && THUMB_OTHER[s.id];
    if (other) {
      const v = calMv(other, now);
      if (v !== null) (cal.samples[other] ??= []).push(v);
    }
    $("uhrZahl").textContent = Math.max(1, Math.ceil((MEASURE_MS - elapsed) / 1000));
    $("fortschritt").firstElementChild.style.width = (Math.min(1, elapsed / MEASURE_MS) * 100) + "%";
    if (elapsed >= MEASURE_MS) evaluateStep();
  }
  if (["ready", "prepare", "measure", "done"].includes(cal.phase)) updateLiveRows(now);
  if (cal.phase === "results") updateTryBars(now);
  drawPose(now);
}

const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

// Strongest bend that was held for a while: the 90th percentile of the distance
// from "straight", so a single spike doesn't count.
function heldExtreme(samples, open) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => Math.abs(a - open) - Math.abs(b - open));
  return sorted[Math.floor((sorted.length - 1) * 0.9)];
}

function finalOpen(id) {
  const a = cal.open1[id], b = cal.open2[id];
  return a === undefined ? b : b === undefined ? a : (a + b) / 2;
}

function grade(travel) {
  if (travel === null || travel === undefined) return ["n_fehlt", "fehler"];
  if (travel >= GOOD_TRAVEL_MV) return ["n_gut", "ok"];
  if (travel >= MIN_TRAVEL_MV) return ["n_brauchbar", "warn"];
  return ["n_wenig", "fehler"];
}

const names = ids => ids.map(channelName).join(", ");

// The verdict is stored as text key + arguments, so it follows a language switch.
function evaluateStep() {
  const s = step();
  const missing = s.channels.filter(id => !cal.samples[id].length);
  let verdict;
  if (missing.length) {
    verdict = { key: "u_keineDaten", args: [missing], kind: "fehler" };
  } else if (s.kind === "open" || s.kind === "open2") {
    const store = s.kind === "open" ? cal.open1 : cal.open2;
    const shaky = [], noisy = [];
    for (const id of s.channels) {
      const v = cal.samples[id];
      store[id] = median(v);
      if (Math.max(...v) - Math.min(...v) > (cal.camera ? 0.08 * MAX_MV : 150)) shaky.push(id);
      // noise at rest: standard deviation (a loose wire or a bad solder joint shows here)
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
      cal.noise[id] = Math.max(cal.noise[id] ?? 0, sd);
      if (sd > noisyLimit()) noisy.push(id);
    }
    if (shaky.length) verdict = { key: "u_gewackelt", args: [shaky], kind: "warn" };
    else if (noisy.length) verdict = { key: "u_rauschen", args: [noisy], kind: "warn" };
    else if (s.kind === "open2") {
      const drift = s.channels.filter(id => {
        const travel = cal.bent[id] === undefined ? null : Math.abs(cal.bent[id] - cal.open1[id]);
        return travel && Math.abs(cal.open2[id] - cal.open1[id]) > 0.25 * travel;
      });
      verdict = drift.length ? { key: "u_drift", args: [drift], kind: "warn" } : { key: "u_zurueck", args: [], kind: "ok" };
    } else verdict = { key: "u_ruhe", args: [], kind: "ok" };
  } else {
    const weak = [];
    for (const id of s.channels) {
      const open = cal.open1[id] ?? 0;
      // camera: the median of the held pose (single frames where the tracker over- or
      // undershoots would otherwise set the range); glove: the strongest bend that was held
      const v = cal.camera ? median(cal.samples[id]) : heldExtreme(cal.samples[id], open);
      // The finger's own step (fingertip to the palm) sets 100 %. The fist only fills in a
      // finger without its own step; otherwise it is a check: it should read about 100 % or more.
      if (s.kind === "fist") cal.fist[id] = v;
      if (THUMB_OTHER[s.id] && cal.samples[THUMB_OTHER[s.id]]?.length) {
        cal.thumbPose[s.id] = { thumbFlex: median(cal.samples.thumbFlex), thumbOpp: median(cal.samples.thumbOpp) };
      }
      if (cal.bent[id] === undefined || s.kind === "bend") cal.bent[id] = v;
      if (Math.abs(cal.bent[id] - open) < MIN_TRAVEL_MV) weak.push(id);
    }
    verdict = weak.length ? { key: "u_schwach", args: [weak], kind: "fehler" }
      : s.kind === "fist" ? { key: "u_hubFaust", args: ["fist", s.channels], kind: "ok" }
      : { key: "u_hub", args: ["travel", s.channels], kind: "ok" };
  }
  cal.stepState[s.id] = verdict.kind === "ok" ? "fertig" : "warn";
  cal.verdict = verdict;
  setPhase("done");
  if (verdict.kind === "ok" && $("auto").checked) cal.timer = setTimeout(next, NEXT_DELAY_MS);
}

function verdictText(v) {
  if (v.args[0] === "travel") {
    const parts = v.args[1].map(id => `${channelName(id)} ${calUnit(Math.abs(cal.bent[id] - (cal.open1[id] ?? 0)))}`).join(", ");
    return ct(v.key, parts);
  }
  if (v.args[0] === "fist") {
    // the fist in % of the finger's range (open -> fingertip at the palm)
    const parts = v.args[1].map(id => {
      const open = cal.open1[id] ?? 0, range = cal.bent[id] - open;
      return `${channelName(id)} ${range ? Math.round((cal.fist[id] - open) / range * 100) : "–"} %`;
    }).join(", ");
    return ct(v.key, parts);
  }
  return ct(v.key, ...v.args.map(a => Array.isArray(a) ? names(a) : a));
}

// ---------- rendering ----------
function renderCalibration() {
  const s = step();
  const p = cal.phase;
  const measuring = ["ready", "prepare", "measure", "done"].includes(p);
  const [, title, text] = stepTexts(s);

  $("schritte").innerHTML = "";
  cal.steps.forEach((st, i) => {
    if (st.kind === "intro") return;
    const li = document.createElement("li");
    li.textContent = stepTexts(st)[0];
    li.dataset.zustand = i === cal.index ? "jetzt" : cal.stepState[st.id] || "";
    $("schritte").appendChild(li);
  });

  $("uhr").hidden = !(p === "prepare" || p === "measure");
  $("fortschritt").hidden = !(p === "prepare" || p === "measure");
  $("ergebnis").hidden = p !== "results" && p !== "saving";
  $("live").hidden = !measuring;
  $("autoZeile").hidden = !measuring;
  $("urteil").textContent = "";
  $("urteil").dataset.art = "";
  $("kalZweit").hidden = true;
  $("kalHaupt").hidden = false;
  $("kalHaupt").disabled = false;
  $("kalAbbrechen").hidden = false;
  $("kalAbbrechen").textContent = ct("abbrechen");

  buildSensorChoice();
  const stored = p === "intro" && !cal.camera ? storedCalibration() : null;
  $("kalWiederherstellen").hidden = !stored;
  if (stored) $("kalWiederherstellen").title = ct("k_wiederherstellenTitel") + " · " + ct("k_gesichert", new Date(stored.time).toLocaleString(language));
  if (p === "intro") {
    $("kalTitel").textContent = ct("k_intro");
    if (!cal.allIds.length) {
      $("kalText").textContent = ct("k_keineDaten");
      $("kalHaupt").hidden = true;
    } else {
      $("kalText").textContent = ct("k_introText", cal.steps.length - 2, (cal.ids.length ? cal.ids : cal.allIds).map(id => channelName(id).toLowerCase()).join(", "));
      $("kalHaupt").textContent = ct("starten");
      $("kalHaupt").disabled = !cal.ids.length;
    }
    $("kalTipp").textContent = ct("k_tippIntro");
  } else if (measuring) {
    $("kalTitel").textContent = title;
    $("kalText").textContent = text;
    $("kalTipp").textContent = ct(s.kind === "bend" || s.kind === "fist" ? "k_tippBeugen" : "k_tippOffen");
    buildLiveRows(s);
    if (p === "ready") {
      $("kalHaupt").textContent = ct("messen");
      if (cal.index > 1) { $("kalZweit").hidden = false; $("kalZweit").textContent = ct("zurueck"); }
    } else if (p === "prepare") {
      $("uhrText").textContent = ct("uhrBereit");
      $("fortschritt").firstElementChild.style.background = css("--muted");
      $("kalHaupt").textContent = ct("bereitMachen");
      $("kalHaupt").disabled = true;
    } else if (p === "measure") {
      $("uhrText").textContent = ct("uhrMessen");
      $("fortschritt").firstElementChild.style.background = s.channels.length === 1 ? CHANNEL[s.channels[0]].color : css("--akzent");
      $("kalHaupt").textContent = ct("misst");
      $("kalHaupt").disabled = true;
    } else if (p === "done") {
      $("urteil").textContent = verdictText(cal.verdict);
      $("urteil").dataset.art = cal.verdict.kind;
      const ok = cal.verdict.kind === "ok";
      $("kalHaupt").textContent = ct(ok ? (cal.returnToResults ? "zurueckZumErgebnis" : "weiter") : "nochmal");
      $("kalZweit").hidden = ok;
      $("kalZweit").textContent = ct("trotzdem");
    }
  } else if (p === "results" || p === "saving") {
    $("kalTitel").textContent = title;
    $("kalText").textContent = text;
    $("kalTipp").textContent = ct("k_tippLive");
    buildResults();
    if (cal.finished) {
      $("kalHaupt").textContent = ct("schliessen");
      $("kalAbbrechen").hidden = true;
    } else {
      $("kalHaupt").textContent = ct(p === "saving" ? "speichert" : state.source === "demo" && !cal.camera ? "demoFertig" : "speichern");
      $("kalHaupt").disabled = p === "saving" || !cal.ids.some(id => cal.bent[id] !== undefined);
      $("kalAbbrechen").textContent = ct("verwerfen");
    }
    if (cal.verdict && cal.verdict.final) {
      $("urteil").textContent = ct(cal.verdict.key);
      $("urteil").dataset.art = cal.verdict.kind;
    }
  }
  drawPose(performance.now());
}

let liveRows = {};
function buildLiveRows(s) {
  const box = $("live");
  if (box.dataset.step === s.id + language) return;
  box.dataset.step = s.id + language;
  box.innerHTML = "";
  liveRows = {};
  for (const id of s.channels) {
    const row = document.createElement("div");
    row.className = "live-zeile";
    row.innerHTML = `<span>${channelName(id)}</span>
      <div class="spur"><div class="fuellung" style="background:${CHANNEL[id].color}"></div><div class="marke" hidden></div></div>
      <span class="klein">–</span>`;
    box.appendChild(row);
    liveRows[id] = { fill: row.querySelector(".fuellung"), mark: row.querySelector(".marke"), num: row.querySelector(".klein") };
  }
}

function updateLiveRows(now) {
  for (const [id, r] of Object.entries(liveRows)) {
    const v = calMv(id, now);
    r.fill.style.width = v === null ? "0" : (clamp01(v / MAX_MV) * 100) + "%";
    r.num.textContent = v === null ? ct("keinSignal") : calUnit(v);
    const open = cal.open1[id];
    r.mark.hidden = open === undefined;
    if (open !== undefined) r.mark.style.left = (clamp01(open / MAX_MV) * 100) + "%";
  }
}

let tryBars = {};
function buildResults() {
  const box = $("ergebnis");
  const rows = cal.ids.map(id => {
    const open = finalOpen(id), bent = cal.bent[id];
    const travel = bent === undefined || open === undefined ? null : Math.abs(bent - open);
    const old = cal.camera ? cal.before[id] : cal.before[state.sensorName[id] || CHANNEL[id].keys[0]] ?? cal.before[CHANNEL[id].k];
    const oldText = old && Math.abs(old.bent - old.straight) >= 1 ? `${calNum(old.straight)}–${calNum(old.bent)}` : "–";
    const noise = cal.noise[id];
    const [key, kind] = grade(travel);
    const stepIndex = cal.steps.findIndex(s => s.kind === "bend" && s.channels.includes(id));
    const redo = stepIndex > 0 && !cal.finished
      ? `<button data-redo="${stepIndex}" title="${ct("e_nochmalTitel")}">${ct("e_nochmal")}</button>` : "";
    return `<tr>
      <td>${channelName(id)}</td>
      <td class="n">${open === undefined ? "–" : calNum(open)}</td>
      <td class="n">${bent === undefined ? "–" : calNum(bent)}</td>
      <td class="n klein">${oldText}</td>
      <td class="n" ${noise > noisyLimit() ? 'style="color:var(--warn)"' : ""}>${noise === undefined ? "–" : "±" + calNum(noise)}</td>
      <td class="note" data-art="${kind}">${ct(key)}</td>
      <td><div class="probe" data-id="${id}"><div class="spur"><div class="fuellung" style="background:${CHANNEL[id].color}"></div></div><span class="klein n">–</span></div></td>
      <td>${redo}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `<table class="ergebnis">
    <thead><tr><th>${ct("e_sensor")}</th><th class="n">${ct("e_gerade")}</th><th class="n">${ct("e_gebeugt")}</th><th class="n">${ct("k_alt")}</th><th class="n">${ct("k_rauschen")}</th><th>${ct("e_hub")}</th><th>${ct("e_probe")}</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  tryBars = {};
  for (const el of box.querySelectorAll(".probe")) {
    tryBars[el.dataset.id] = { fill: el.querySelector(".fuellung"), num: el.querySelector(".n") };
  }
  for (const b of box.querySelectorAll("[data-redo]")) {
    b.onclick = () => { cal.returnToResults = true; cal.verdict = null; goTo(Number(b.dataset.redo)); };
  }
}

// Preview with the new numbers, before they are saved.
function previewValue(id, now) {
  const open = finalOpen(id), bent = cal.bent[id], v = calMv(id, now);
  if (open === undefined || bent === undefined || v === null || Math.abs(bent - open) < 1) return null;
  return clamp01((v - open) / (bent - open));
}

function updateTryBars(now) {
  for (const [id, r] of Object.entries(tryBars)) {
    const v = previewValue(id, now);
    r.fill.style.width = v === null ? "0" : (v * 100) + "%";
    r.num.textContent = v === null ? "–" : Math.round(v * 100) + " %";
  }
}

// Pose drawing: the target pose, with the movement played in slowly before measuring.
function drawPose(now) {
  if (!$("kal").open) return;
  const canvas = $("kalHand");
  const s = step();
  if (cal.phase === "results" || cal.phase === "saving") {
    drawHand(canvas, id => cal.ids.includes(id) ? previewValue(id, now) : null, id => CHANNEL[id].color);
    return;
  }
  const pose = s.pose || {};
  let amount = 1;
  const elapsed = now - cal.phaseStart;
  if (!reducedMotion.matches) {
    if (cal.phase === "ready" || cal.phase === "intro") {
      const loop = (elapsed % 3200) / 3200;  // bend in, hold, release, rest
      const lin = loop < 0.25 ? loop / 0.25 : loop < 0.7 ? 1 : loop < 0.9 ? 1 - (loop - 0.7) / 0.2 : 0;
      amount = 0.5 - 0.5 * Math.cos(Math.PI * lin);
    } else if (cal.phase === "prepare") {
      amount = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, elapsed / 900));
    }
  }
  if (cal.phase === "intro") {
    drawHand(canvas, id => cal.ids.includes(id) ? 0.35 * amount : 0, id => cal.ids.includes(id) ? CHANNEL[id].color : null);
    return;
  }
  drawHand(canvas, id => (pose[id] ?? 0) * amount, id => pose[id] ? CHANNEL[id].color : null);
}

// ---------- saving ----------
async function saveCalibration() {
  if (cal.camera) { saveCameraMapping(); return; }
  if (state.source === "demo") { closeCalibration(); return; }
  const ids = cal.ids.filter(id => cal.bent[id] !== undefined && finalOpen(id) !== undefined);
  const sensor = id => state.sensorName[id] || CHANNEL[id].keys[0];
  // keep the calibration from before, so it can be put back ("Restore saved calibration")
  const self = boardSelf("glove");
  if (self?.mac && Object.keys(cal.before).length) {
    try { localStorage.setItem("sicherung-alt:" + self.mac, JSON.stringify({ device: "glove", time: Date.now(), calib: cal.before })); } catch (e) {}
  }
  cal.confirmed = new Set();
  cal.verdict = null;
  setPhase("saving");
  for (const id of ids) {
    await send(`c${sensor(id)}=${Math.round(finalOpen(id))},${Math.round(cal.bent[id])}\n`);
    await new Promise(r => setTimeout(r, 120));
  }
  const start = performance.now();
  const check = () => {
    if (ids.every(id => cal.confirmed.has(sensor(id)))) {
      cal.finished = true;
      cal.verdict = { key: "u_gespeichert", kind: "ok", final: true };
      setPhase("results");
    } else if (performance.now() - start > 3000) {
      cal.verdict = { key: "u_keineAntwort", kind: "fehler", final: true };
      setPhase("results");
    } else {
      setTimeout(check, 100);
    }
  };
  check();
}

$("kalHaupt").onclick = () => {
  const p = cal.phase;
  if (p === "intro") goTo(1);
  else if (p === "ready") startCountdown(false);
  else if (p === "done") {
    if (cal.verdict.kind === "ok") next();
    else startCountdown(false);
  } else if (p === "results") {
    if (cal.finished) closeCalibration(); else saveCalibration();
  }
};
$("kalZweit").onclick = () => {
  if (cal.phase === "ready") goTo(cal.index - 1);
  else if (cal.phase === "done") next();
};
$("kalAbbrechen").onclick = closeCalibration;
$("kalWiederherstellen").onclick = () => {
  const b = storedCalibration();
  if (b) restoreBackup("glove", { calib: b.calib });
  closeCalibration();
  setTimeout(() => sendToDevice("glove", "i"), 1200);
};
// Camera mode: the result becomes the camera mapping (open = bend 0, bent = bend 1 per finger)
function saveCameraMapping() {
  const data = { ...(camMap.data ?? {}) };
  for (const id of cal.ids) {
    const open = finalOpen(id), bent = cal.bent[id];
    if (open === undefined || bent === undefined || Math.abs(bent - open) < MIN_TRAVEL_MV) continue;
    // a little inside the measured range: the robot hand reaches 0 % and 100 % without
    // having to repeat the calibration poses exactly (8 % at the open end, 15 % at the bent end)
    const span = bent - open;
    data[id] = { open: (open + 0.08 * span) / MAX_MV, closed: (bent - 0.15 * span) / MAX_MV };
  }
  // Thumb: the camera sees tucking in and opposing as a mix of both values (opposing
  // also reads as a half-tucked thumb, tucking in moves the tip across the palm). The
  // two thumb steps measure that mix; its inverse turns it back into "tuck in" and
  // "oppose" (mapCamera). Without both steps an old thumb mix would not fit any more.
  delete data.thumb;
  const tuck = cal.thumbPose.thumbFlex, opp = cal.thumbPose.thumbOpp;
  const f0 = finalOpen("thumbFlex"), o0 = finalOpen("thumbOpp");
  if (tuck && opp && f0 !== undefined && o0 !== undefined) {
    const a = (tuck.thumbFlex - f0) / MAX_MV, b = (opp.thumbFlex - f0) / MAX_MV;
    const c = (tuck.thumbOpp - o0) / MAX_MV, d = (opp.thumbOpp - o0) / MAX_MV;
    const det = a * d - b * c;
    // only when the two poses really differ (otherwise the inverse blows up noise)
    if (a > 0.05 && d > 0.05 && det > 0.25 * a * d) {
      data.thumb = { f0: f0 / MAX_MV, o0: o0 / MAX_MV, m: [[d / det, -b / det], [-c / det, a / det]] };
    }
  }
  data.time = Date.now();
  camMap.data = data;
  try { localStorage.setItem("kamMapping", JSON.stringify(data)); } catch (e) {}
  cal.finished = true;
  cal.verdict = { key: "u_gespeichert", kind: "ok", final: true };
  setPhase("results");
}

$("kal").addEventListener("close", () => { clearTimeout(cal.timer); $("live").dataset.step = ""; });
