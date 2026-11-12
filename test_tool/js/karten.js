"use strict";
// test_tool: karten.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ---------------------------------------------------------------------------
// Finger cards: one card for every board (the robot hand's card). What differs per board:
// - robot hand / bridge as glove (sliderView): servo position, slider, glove value as a mark in the bar
// - glove / simulator / bridge as hand: calibrated value (or the voltage before calibration), raw voltages
const cards = {};

function buildCards() {
  const box = $("karten");
  for (const c of CHANNELS) {
    const el = document.createElement("div");
    el.className = "karte";
    el.style.setProperty("--f", c.color);
    el.innerHTML = `
      <div class="name"><span class="punkt" style="background:${c.color}"></span><span data-t="kanal_${c.k}"></span></div>
      <div class="zahl">–</div>
      <div class="balken mit-marke"><div style="background:${c.color}"></div><span class="hs" hidden></span></div>
      <div class="regler"><span class="klein" data-t="offen"></span>
        <input type="range" min="0" max="100" step="1" data-t-aria="kanal_${c.k}"><span class="klein" data-t="zu"></span></div>
      <div class="roh"></div>`;
    box.appendChild(el);
    const card = {
      el, value: el.querySelector(".zahl"), bar: el.querySelector(".balken div"), mark: el.querySelector(".hs"),
      sliderRow: el.querySelector(".regler"), slider: el.querySelector("input"), raw: el.querySelector(".roh"),
      shown: false,   // robot hand: shown once the hand reports this finger
      last: 0, dragging: false,
    };
    card.slider.addEventListener("input", () => { stopGrip(); setFingers({ [c.k]: card.slider.value / 100 }); });
    card.slider.addEventListener("pointerdown", () => { card.dragging = true; });
    for (const ev of ["pointerup", "pointercancel", "change"]) {
      card.slider.addEventListener(ev, () => { card.dragging = false; card.last = performance.now(); });
    }
    cards[c.id] = card;
  }
}

// Robot hand: servo position, target, glove value
function servoCard(c, card, now) {
  const fresh = posFresh(c.id, now);
  if (state.posTime[c.id] !== undefined) card.shown = true;
  const hs = gloveFresh(c.id, now);
  let raw = "";
  if (fresh) {
    const goal = state.goal[c.id];
    const moving = Math.abs(goal - state.pos[c.id]) > 0.01;
    raw = state.device === "bglove" ? t("bGesendet")
      : t("rohHand", Math.round(state.deg[c.id]), moving ? Math.round(goal * 100) : null, hs ? Math.round(state.glove[c.id] * 100) : null);
    // the slider follows the target, unless it is being moved right now
    if (!card.dragging && now - card.last > 800) card.slider.value = Math.round(goal * 100);
  }
  card.slider.disabled = !fresh;
  return { hidden: !card.shown, fresh, value: fresh ? Math.round(state.pos[c.id] * 100) + " %" : "–",
           fill: fresh ? state.disp[c.id] : 0, mark: hs ? state.glove[c.id] : null, raw };
}

// Glove (and simulator): calibrated value; before calibration the voltage
function sensorCard(c, now) {
  const fresh = isFresh(c.id, now);
  const mv = freshEntry(state.mv[c.id], now);
  const comp = freshEntry(state.comp[c.id], now);
  // With a board connected, only the sensors it actually has get a card.
  const hidden = !!(state.source && state.source !== "demo" && !state.seen[c.id]);
  let fill = 0, value = "–", raw = "";
  const rawText = mv === null ? "" : t("roh", Math.round(mv), comp === null ? null : Math.round(comp));
  if (fresh) {
    value = Math.round(state.value[c.id] * 100) + " %";
    raw = state.device === "sim" || state.device === "bhand" ? t("perFunk") : rawText;
    fill = state.shown[c.id];
  } else if (mv !== null) {
    const main = comp ?? mv;
    value = Math.round(main) + " mV";
    raw = rawText + " · " + t("nichtKalibriert");
    fill = clamp01(main / MAX_MV);
  } else if (state.source) {
    raw = t("keinSignal");
  }
  return { hidden, fresh: fresh || mv !== null, value, fill, mark: null, raw };
}

function updateCards(now) {
  const slider = sliderView();
  let visible = 0;
  for (const c of CHANNELS) {
    const card = cards[c.id];
    const v = slider ? servoCard(c, card, now) : sensorCard(c, now);
    card.el.hidden = v.hidden;
    if (!v.hidden) visible++;
    card.sliderRow.hidden = !slider;
    card.el.dataset.frisch = v.fresh ? "ja" : "nein";
    if (card.value.textContent !== v.value) card.value.textContent = v.value;
    card.bar.style.width = (v.fill * 100).toFixed(1) + "%";
    card.mark.hidden = v.mark === null;
    if (v.mark !== null) card.mark.style.left = (v.mark * 100).toFixed(1) + "%";
    if (card.raw.textContent !== v.raw) card.raw.textContent = v.raw;
  }
  return visible;
}

// Set fingers (sliders and grips) -> "s F1:0.500 F0:1.000". While dragging, at
// most every 50 ms; the last value always arrives.
const pending = {};
let sendTimer = null;
function setFingers(values) {
  const now = performance.now();
  for (const [k, v] of Object.entries(values)) {
    const id = K_TO_ID[k];
    if (!posFresh(id, now)) continue;  // the hand doesn't have this finger
    pending[k] = v;
    cards[id].last = now;
    cards[id].slider.value = Math.round(v * 100);
  }
  if (!sendTimer) sendTimer = setTimeout(sendPending, 0);
}
function sendPending() {
  const parts = Object.entries(pending).map(([k, v]) => `${k}:${v.toFixed(3)}`);
  for (const k in pending) delete pending[k];
  if (parts.length) {
    send("s " + parts.join(" ") + "\n", true);
    sendTimer = setTimeout(() => { sendTimer = null; if (Object.keys(pending).length) sendPending(); }, 50);
  } else sendTimer = null;
}

// ---------------------------------------------------------------------------
// Grips with start times: each finger is sent at its own time (GRIPS, changes
// from the window "Grip timing" kept in this browser under "griffZeiten").
// A new grip or a moved slider cancels what is still waiting.
// ---------------------------------------------------------------------------
let gripEdits = {};
try { gripEdits = JSON.parse(localStorage.getItem("griffZeiten")) || {}; } catch (e) {}
const gripOf = name => Object.fromEntries(Object.entries(GRIPS[name]).map(([k, d]) => [k, { ...d, ...gripEdits[name]?.[k] }]));
const gripRun = { timers: [], name: null };

function stopGrip() {
  gripRun.timers.forEach(clearTimeout);
  gripRun.timers = [];
  gripRun.name = null;
}

function runGrip(name) {
  stopGrip();
  const steps = {};
  for (const [k, { v, ms }] of Object.entries(gripOf(name))) (steps[ms] ??= {})[k] = v;
  const last = Math.max(...Object.keys(steps).map(Number));
  gripRun.name = name;
  for (const [ms, values] of Object.entries(steps)) gripRun.timers.push(setTimeout(() => setFingers(values), +ms));
  gripRun.timers.push(setTimeout(() => { gripRun.timers = []; gripRun.name = null; }, last + 1));
}

function saveGripEdits() {
  try { localStorage.setItem("griffZeiten", JSON.stringify(gripEdits)); } catch (e) {}
}

// The window: one row per finger with position (%) and start time (ms)
let gripShown = "faust";
function buildGrips() {
  for (const b of $("griffWahl").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.wert === gripShown));
  const box = $("griffListe"), grip = gripOf(gripShown);
  box.innerHTML = "";
  const now = performance.now();
  const span = Math.max(1000, ...Object.values(grip).map(d => d.ms));
  for (const c of CHANNELS) {
    const d = grip[c.k];
    if (!d) continue;
    const row = document.createElement("div");
    row.className = "griff-zeile";
    row.style.setProperty("--f", c.color);
    row.dataset.k = c.k;
    // fingers the board doesn't report are skipped when the grip runs
    row.dataset.fehlt = state.source && !posFresh(c.id, now) ? "ja" : "nein";
    row.dataset.geaendert = gripEdits[gripShown]?.[c.k] ? "ja" : "nein";
    row.innerHTML = `<span class="name"><span class="punkt"></span>${channelName(c.id)}</span>
      <label class="klein">${t("griffZiel")} <input type="number" min="0" max="100" step="5" data-feld="v" value="${Math.round(d.v * 100)}"> %</label>
      <label class="klein">${t("griffStart")} <input type="number" min="0" max="${GRIP_MAX_MS}" step="50" data-feld="ms" value="${d.ms}"> ms</label>
      <div class="zeitachse" title="${t("griffStart")} ${d.ms} ms"><span style="left:${(100 * d.ms / span).toFixed(1)}%"></span></div>`;
    for (const inp of row.querySelectorAll("input")) {
      inp.addEventListener("change", () => {
        const raw = Math.round(+inp.value || 0);
        const value = inp.dataset.feld === "v" ? Math.max(0, Math.min(100, raw)) / 100 : Math.max(0, Math.min(GRIP_MAX_MS, raw));
        const e = ((gripEdits[gripShown] ??= {})[c.k] ??= {});
        e[inp.dataset.feld] = value;
        // only keep what differs from the built-in grip
        for (const f of ["v", "ms"]) if (e[f] === GRIPS[gripShown][c.k][f]) delete e[f];
        if (!Object.keys(e).length) delete gripEdits[gripShown][c.k];
        if (!Object.keys(gripEdits[gripShown]).length) delete gripEdits[gripShown];
        saveGripEdits();
        buildGrips();
      });
    }
    box.appendChild(row);
  }
  $("griffStandard").disabled = !gripEdits[gripShown];
  const missing = state.source ? CHANNELS.filter(c => grip[c.k] && !posFresh(c.id, now)).map(c => channelName(c.id)) : [];
  $("griffMeldung").textContent = missing.length && missing.length < CHANNELS.length ? t("griffFehlt", missing.join(", ")) : "";
}

$("griffWahl").addEventListener("click", e => {
  const b = e.target.closest("button[data-wert]");
  if (!b) return;
  gripShown = b.dataset.wert;
  buildGrips();
});
$("griffStandard").onclick = () => { delete gripEdits[gripShown]; saveGripEdits(); buildGrips(); };
// Export / import as a file, to take the timings to another computer.
// The file holds all grips with every finger, so it can be read on its own.
$("griffExport").onclick = () => {
  const grips = Object.fromEntries(Object.keys(GRIPS).map(name => [name, gripOf(name)]));
  download(`grip-timing-${stamp()}.json`, JSON.stringify({ format: "grip-timing", version: 1, grips }, null, 1), "application/json");
};
$("griffImport").onclick = () => $("griffDatei").click();
$("griffDatei").onchange = async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.format !== "grip-timing" || typeof data.grips !== "object") throw new Error();
    // keep only known grips and fingers with sane numbers, stored as differences to GRIPS
    const edits = {};
    for (const [name, fingers] of Object.entries(data.grips)) {
      if (!GRIPS[name] || typeof fingers !== "object") continue;
      for (const [k, d] of Object.entries(fingers)) {
        const base = GRIPS[name][k];
        if (!base || typeof d !== "object") continue;
        const e2 = {};
        if (Number.isFinite(d.v) && Math.max(0, Math.min(1, d.v)) !== base.v) e2.v = Math.max(0, Math.min(1, d.v));
        if (Number.isFinite(d.ms) && Math.round(Math.max(0, Math.min(GRIP_MAX_MS, d.ms))) !== base.ms) e2.ms = Math.round(Math.max(0, Math.min(GRIP_MAX_MS, d.ms)));
        if (Object.keys(e2).length) (edits[name] ??= {})[k] = e2;
      }
    }
    gripEdits = edits;
    saveGripEdits();
    buildGrips();
    $("griffMeldung").textContent = t("griffImportiert", file.name);
  } catch (err) {
    $("griffMeldung").textContent = t("griffImportFehler", file.name);
  }
};
$("griffProbieren").onclick = () => runGrip(gripShown);
for (const b of document.querySelectorAll(".griffe-knopf")) {
  b.onclick = () => toggleWindow("griffeFenster", b, buildGrips);
}
$("griffeFenster").addEventListener("close", () => {
  for (const b of document.querySelectorAll(".griffe-knopf")) b.setAttribute("aria-pressed", "false");
});

// Servos the robot hand demo has: checkboxes above the cards (remembered)
function buildDemoChoice() {
  for (const c of CHANNELS) {
    const label = document.createElement("label");
    label.style.setProperty("--f", c.color);
    label.innerHTML = `<input type="checkbox"><span data-t="kanal_${c.k}"></span>`;
    const box = label.querySelector("input");
    box.checked = demo.channels.has(c.k);
    box.onchange = () => {
      if (box.checked) demo.channels.add(c.k);
      else {
        demo.channels.delete(c.k);
        for (const f of ["pos", "goal", "deg", "glove", "disp", "posTime", "gloveTime"]) delete state[f][c.id];
        cards[c.id].shown = false;
      }
      try { localStorage.setItem("demoServos", JSON.stringify([...demo.channels])); } catch (e) {}
    };
    $("demoAuswahl").appendChild(label);
  }
}

// ---------------------------------------------------------------------------
// History of the last 10 s.
// Glove: solid = bend, dashed = raw voltage, dotted = compensated.
// Robot hand: solid = servo, dashed = glove value received over radio.
// ---------------------------------------------------------------------------
// distance along each dashed line per history point, see drawHistory
const dashAlong = new WeakMap();
function drawHistory(now) {
  const { ctx, w, h } = prepare($("verlauf"));
  const left = 34, right = 8, top = 8, bottom = 20;
  const bw = w - left - right, bh = h - top - bottom;
  const xOf = time => left + bw * (1 - (now - time) / HISTORY_MS);
  const yOf = v => top + bh * (1 - v);

  ctx.font = "11px " + css("--schrift");
  ctx.fillStyle = css("--muted");
  ctx.strokeStyle = css("--gitter");
  ctx.lineWidth = 1;
  for (const v of [0, 0.5, 1]) {
    ctx.beginPath(); ctx.moveTo(left, yOf(v)); ctx.lineTo(w - right, yOf(v)); ctx.stroke();
    ctx.fillText(v * 100 + "%", 2, yOf(v) + 4);
  }
  for (let s = 0; s <= 10; s += 2) {
    ctx.fillText(s === 0 ? t("jetzt") : `−${s} s`, xOf(now - s * 1000) - (s === 0 ? 26 : 12), h - 4);
  }

  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  // Dashes are measured along the line (a steep stretch gets as many dashes as a flat
  // one) and stay on the data: each point keeps its distance along the line from the
  // moment it was first drawn (dashAlong). The canvas' own setLineDash would restart
  // the pattern at the oldest point, which leaves the chart every frame, so the dashes
  // would jitter.
  const line = (c, field, dash) => {
    ctx.setLineDash([]);
    ctx.strokeStyle = c.color;
    ctx.beginPath();
    const period = dash ? dash[0] + dash[1] : 0, key = field + ":" + c.id;
    let last = null;
    for (const p of state.history) {
      const v = p[field]?.[c.id];
      if (v === undefined) continue;
      if (last && p.t - last.t > 300) last = null;  // gap = no data, break the line
      const pt = { t: p.t, x: xOf(p.t), y: yOf(v) };
      if (!dash) {
        if (last) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y);
      } else {
        let along = dashAlong.get(p);
        if (!along) dashAlong.set(p, along = {});
        pt.s = along[key] ??= last ? last.s + Math.hypot(pt.x - last.x, pt.y - last.y) : 0;
        if (last && pt.s > last.s) {
          // split the segment last -> pt at the dash boundaries (measured along the line)
          const at = d => { const u = (d - last.s) / (pt.s - last.s); return [last.x + (pt.x - last.x) * u, last.y + (pt.y - last.y) * u]; };
          let s0 = last.s;
          while (s0 < pt.s) {
            const phase = (s0 % period + period) % period;
            const on = phase < dash[0];
            const s1 = Math.min(pt.s, s0 + (on ? dash[0] : period) - phase + 1e-6);
            if (on) { ctx.moveTo(...at(s0)); ctx.lineTo(...at(s1)); }
            s0 = s1;
          }
        }
      }
      last = pt;
    }
    ctx.stroke();
  };
  const has = (c, field) => state.history.some(p => p[field]?.[c.id] !== undefined);
  for (const c of CHANNELS) {
    if (sliderView()) {
      line(c, "pos");
      if (has(c, "hs")) line(c, "hs", [5, 4]);
    } else {
      line(c, "w");
      if (has(c, "mv")) line(c, "mv", [5, 4]);
      if (has(c, "comp")) line(c, "comp", [1, 3]);
    }
  }
  ctx.setLineDash([]);
}
