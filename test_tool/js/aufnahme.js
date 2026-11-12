"use strict";
// test_tool: aufnahme.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Record and replay
// ===========================================================================
const KEYS = CHANNELS.map(c => c.k);
const rec = {
  recording: false, start: 0, frames: [], source: "",
  data: null,   // finished or opened recording: {format, version, created, source, keys, frames: [[ms, v...]]}
  name: "",
};
// playing: runs; paused: holds the frame at pos (3D view and board keep that position); neither: stopped
const play = { playing: false, paused: false, t0: 0, pos: 0, index: 0, lastSend: 0, target: "view", values: {} };
const playActive = () => play.playing || play.paused;

// Frames come from the glove lines (takeGlove) or, with only the robot hand connected, from its status lines.
function recordFrame(kind, values, now) {
  if (!rec.recording || kind !== rec.source) return;
  const v = {};
  for (const [id, x] of Object.entries(values)) v[CHANNEL[id].k] = x;
  if (Object.keys(v).length) rec.frames.push({ t: now - rec.start, v });
}

function recordSource() {
  if (state.source === "demo") return state.device === "hand" ? "hand" : "glove";
  if (connOf("glove")) return "glove";
  if (connOf("hand")) return "hand";
  if (connOf("sim")) return "glove";
  return "";
}

function startRecording() {
  const src = recordSource();
  if (!src) { playMessage(t("a_keineQuelle"), "warn"); return; }
  stopPlay();
  Object.assign(rec, { recording: true, start: performance.now(), frames: [], source: src });
  playMessage("");
  showRecording();
}

function stopRecording() {
  if (!rec.recording) return;
  rec.recording = false;
  if (rec.frames.length) {
    const keys = KEYS.filter(k => rec.frames.some(f => f.v[k] !== undefined));
    rec.data = {
      format: "prothese-aufnahme", version: 1, created: new Date().toISOString(),
      source: state.source === "demo" ? "demo" : rec.source, keys,
      frames: rec.frames.map(f => [Math.round(f.t), ...keys.map(k => f.v[k] === undefined ? null : +f.v[k].toFixed(3))]),
    };
    rec.name = "";
  }
  showRecording();
}

const recDuration = d => d?.frames.length ? d.frames[d.frames.length - 1][0] : 0;

function showRecording() {
  const now = performance.now();
  $("aufnahmeLaeuft").textContent = rec.recording ? "● " + fmtTime(now - rec.start) : play.playing ? "▶ " + fmtTime(play.pos) : play.paused ? "❚❚ " + fmtTime(play.pos) : "";
  if (!$("aufnahmeFenster").open) return;
  $("aufnehmen").textContent = t(rec.recording ? "a_stoppen" : "a_starten");
  const src = rec.recording ? rec.source : recordSource();
  $("aufnahmeQuelle").textContent = !src ? t("a_keineQuelle") : state.source === "demo" ? t("a_quelleDemo") : t(src === "hand" ? "a_quelleHand" : "a_quelleGlove");
  const d = rec.data;
  $("aufnahmeInfo").textContent = rec.recording ? t("a_info", fmtTime(now - rec.start), rec.frames.length, "")
    : d ? t("a_info", fmtTime(recDuration(d)), d.frames.length, d.keys.map(k => channelName(K_TO_ID[k])).join(", ")) + (rec.name ? " · " + rec.name : "")
    : t("a_leer");
  $("aufnahmeSpeichern").disabled = !d || rec.recording;
  $("abspielen").disabled = !d || rec.recording;
  $("abspielen").textContent = t(play.playing ? "a_pause" : "a_abspielen");
  $("abspielStopp").disabled = !playActive();
  $("abspielPos").disabled = !d || rec.recording;
  const dur = recDuration(d);
  if (document.activeElement !== $("abspielPos")) $("abspielPos").value = dur ? Math.round(1000 * play.pos / dur) : 0;
  $("abspielZeit").textContent = fmtTime(play.pos) + " / " + fmtTime(dur);
  for (const o of $("abspielZiel").options) {
    if (o.value !== "view") o.disabled = !boardSelf(o.value);
  }
  if ($("abspielZiel").selectedOptions[0]?.disabled) $("abspielZiel").value = "view";
}

function playMessage(text, kind = "") {
  $("abspielMeldung").textContent = text;
  $("abspielMeldung").dataset.art = kind;
}

function startPlay() {
  const d = rec.data;
  if (!d) return;
  const target = $("abspielZiel").value;
  if (target !== "view" && !boardSelf(target)) { playMessage(t("a_zielFehlt_" + target), "warn"); return; }
  if (target === "glove" && boardSelf("glove").fw && !fwNew(boardSelf("glove"))) { playMessage(t("a_altFw"), "warn"); return; }
  const dur = recDuration(d);
  if (play.pos >= dur) play.pos = 0;
  if (play.paused && play.target !== target) stopPlay();
  Object.assign(play, { playing: true, paused: false, t0: performance.now() - play.pos / speed(), index: 0, lastSend: 0, target, values: {} });
  playMessage(t(target === "hand" ? "a_hinweisHand" : target === "glove" ? "a_hinweisFunk" : "a_hinweisAnsicht"));
  showRecording();
}
const speed = () => +$("abspielTempo").value || 1;

// Stop: back to the start, the board goes back to the glove
function stopPlay() {
  if (!playActive()) return;
  play.playing = play.paused = false;
  if (play.target === "hand") sendToDevice("hand", "h");  // the glove controls again
  play.values = {};
  play.pos = 0;
  showRecording();
}

// Pause: keep the current frame in the 3D view and on the board
function pausePlay() {
  if (!play.playing) return;
  play.playing = false;
  play.paused = true;
  play.values = valuesAt(rec.data, play.pos);
  play.lastSend = 0;  // send the held position right away
  showRecording();
}

// Value of every finger at play.pos (linear between the frames)
function valuesAt(d, pos) {
  const f = d.frames;
  let i = 0, lo = 0, hi = f.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (f[mid][0] <= pos) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
  const u = b[0] > a[0] ? Math.min(1, Math.max(0, (pos - a[0]) / (b[0] - a[0]))) : 0;
  const out = {};
  d.keys.forEach((k, j) => {
    const x = a[j + 1], y = b[j + 1];
    if (x === null && y === null) return;
    out[k] = x === null ? y : y === null ? x : x + (y - x) * u;
  });
  return out;
}

// From the main loop
function tickPlay(now) {
  if (rec.recording || play.playing) showRecording();
  if (!playActive()) return;
  const d = rec.data, dur = recDuration(d);
  if (play.playing) {
    play.pos = (now - play.t0) * speed();
    if (play.pos > dur) {
      if ($("abspielSchleife").checked && dur > 0) { play.t0 = now; play.pos = 0; }
      else { play.pos = dur; pausePlay(); }  // the end: hold the last frame
    }
  }
  play.values = valuesAt(d, play.pos);
  // paused: the robot hand keeps its last "s" anyway, so only resend it twice a second;
  // the glove needs it at least every 0.5 s or its sensors take over
  // to the board: 20 per second to the robot hand, 10 per second to the glove (it holds them 0.5 s)
  const every = play.target === "glove" ? 100 : play.paused ? 500 : 50;
  if (play.target !== "view" && now - play.lastSend >= every) {
    play.lastSend = now;
    const parts = Object.entries(play.values).map(([k, v]) => `${k}:${clamp01(v).toFixed(3)}`).join(" ");
    if (play.target === "hand") sendToDevice("hand", "s " + parts + "\n");
    else sendToDevice("glove", "p" + parts + "\n");
  }
}
// The 3D view shows the replay (only for "3D view only"; otherwise the board's real reaction)
const replayValue = id => playActive() && play.target === "view" && play.values[CHANNEL[id].k] !== undefined ? play.values[CHANNEL[id].k] : undefined;

function openRecording(file) {
  file.text().then(text => {
    let d;
    try { d = JSON.parse(text); } catch (e) { d = null; }
    const ok = d && d.format === "prothese-aufnahme" && Array.isArray(d.keys) && Array.isArray(d.frames) &&
      d.keys.every(k => KEYS.includes(k)) && d.frames.every(f => Array.isArray(f) && f.length === d.keys.length + 1 && typeof f[0] === "number");
    if (!ok) { playMessage(t("a_fehlerDatei"), "fehler"); return; }
    stopPlay();
    rec.data = d; rec.name = file.name; play.pos = 0;
    playMessage(t("a_geladen", file.name), "ok");
    showRecording();
  });
}

$("aufnahmeKnopf").onclick = () => toggleWindow("aufnahmeFenster", $("aufnahmeKnopf"), showRecording);
$("aufnehmen").onclick = () => (rec.recording ? stopRecording() : startRecording());
$("aufnahmeSpeichern").onclick = () => download(`recording-${stamp()}.json`, JSON.stringify(rec.data), "application/json");
$("aufnahmeLaden").onclick = () => $("aufnahmeDatei").click();
$("aufnahmeDatei").onchange = e => { if (e.target.files[0]) openRecording(e.target.files[0]); e.target.value = ""; };
$("abspielen").onclick = () => (play.playing ? pausePlay() : startPlay());
$("abspielStopp").onclick = () => stopPlay();
// Closing the window ends a pause, so a held frame doesn't hide the live values
$("aufnahmeFenster").addEventListener("close", () => { if (play.paused) stopPlay(); });
$("abspielPos").oninput = e => {
  const dur = recDuration(rec.data);
  play.pos = dur * e.target.value / 1000;
  if (play.playing) play.t0 = performance.now() - play.pos / speed();
  else {
    // scrubbing while stopped: hold that frame like a pause, so the view (or board) shows it
    if (!play.paused) { const pos = play.pos; startPlay(); play.pos = pos; pausePlay(); }
    play.values = valuesAt(rec.data, play.pos);
    play.lastSend = 0;
    showRecording();
  }
};
$("abspielTempo").onchange = () => { if (play.playing) play.t0 = performance.now() - play.pos / speed(); };
$("abspielZiel").onchange = () => {
  if (!playActive()) return;
  const wasPaused = play.paused, pos = play.pos;
  stopPlay();
  play.pos = pos;
  startPlay();
  if (wasPaused) pausePlay();
};
