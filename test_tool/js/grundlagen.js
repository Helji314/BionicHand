"use strict";
// test_tool: grundlagen.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Prosthesis test tool: one page for the sensor glove and the robot hand.
//
// After connecting, the page sends "i" (info; both boards understand it and
// nothing else changes) and looks at the answer and at the lines the board
// streams. From that it knows which board it is talking to and adapts:
//   glove      (repo ansteuerung_Gruppe1, sensor_glove): sensors, calibration
//   robot hand (repo ansteuerung_hand, roboter_hand):    servos, sliders, grips
//   simulator  (ansteuerung_Gruppe1, tools/robot_simulator): values received over radio
//   test bridge (this repo, bridge/bridge.ino): a bare ESP32-C6 that plays
//     "bglove" = the glove: the sliders here go over radio to a real robot hand
//     "bhand"  = the robot hand: answers a real glove, shows what arrived
// The board can also be picked by hand at the top left (and decides which demo runs).
//
// Radio packets: both firmwares print every ESP-NOW message with the radio log
// ("l"): "[radio] -> {...}" on the glove, "[funk] <- MAC {...}" on the robot hand.
// The text between the braces is exactly the payload that goes over the air, so
// its length is the packet size in bytes. The packets panel counts them.
// ===========================================================================

// ---------------------------------------------------------------------------
// Fingers. k = key in the radio protocol (repo protocol), id = name in this page.
// keys = all names the glove can use for it: its sensor names, old German names
// and the protocol keys (robot simulator).
// ---------------------------------------------------------------------------
const CHANNELS = [
  { k: "F0", id: "thumbFlex", keys: ["ThumbFlex", "DaumenEin", "F0"], color: "#e8590c" },
  { k: "S0", id: "thumbOpp",  keys: ["ThumbOpp", "DaumenOpp", "S0"],  color: "#d6336c" },
  { k: "F1", id: "index",     keys: ["Index", "Zeige", "F1"],         color: "#1c7ed6" },
  { k: "F2", id: "middle",    keys: ["Middle", "Mittel", "F2"],       color: "#0ca678" },
  { k: "F3", id: "ring",      keys: ["Ring", "F3"],                   color: "#7048e8" },
  { k: "F4", id: "pinky",     keys: ["Pinky", "Klein", "F4"],         color: "#f59f00" },
];
const CHANNEL = Object.fromEntries(CHANNELS.map(c => [c.id, c]));
const K_TO_ID = Object.fromEntries(CHANNELS.map(c => [c.k, c.id]));
const KEY_TO_CHANNEL = {};
for (const c of CHANNELS) for (const k of c.keys) KEY_TO_CHANNEL[k] = c.id;

// Grips for the robot hand (protocol keys): v = 0 straight .. 1 bent, ms = start time.
// The fingers start in that order, so a pose ends right: for a fist the fingers
// close first and the thumb closes over them afterwards (all at once, the thumb
// runs into the fingers and the collision protection stops it there). Fingers
// the hand doesn't have are skipped. Editable in the window "Grip timing".
const GRIPS = {
  offen:   { F0: { v: 0, ms: 0 },   S0: { v: 0, ms: 300 },   F1: { v: 0, ms: 300 },   F2: { v: 0, ms: 300 },   F3: { v: 0, ms: 300 },   F4: { v: 0, ms: 300 } },
  faust:   { F0: { v: 1, ms: 600 }, S0: { v: 0, ms: 0 },     F1: { v: 1, ms: 0 },     F2: { v: 1, ms: 0 },     F3: { v: 1, ms: 0 },     F4: { v: 1, ms: 0 } },
  zeigen:  { F0: { v: 1, ms: 600 }, S0: { v: 0.3, ms: 0 },   F1: { v: 0, ms: 0 },     F2: { v: 1, ms: 0 },     F3: { v: 1, ms: 0 },     F4: { v: 1, ms: 0 } },
  greifen: { F0: { v: 0.5, ms: 400 }, S0: { v: 1, ms: 0 },   F1: { v: 0.6, ms: 200 }, F2: { v: 0.6, ms: 200 }, F3: { v: 0.6, ms: 200 }, F4: { v: 0.6, ms: 200 } },
};
const GRIP_MAX_MS = 3000;

const FRESH_MS = 600;      // a value counts as current for this long
const HISTORY_MS = 10000;
const MAX_MV = 3300;       // raw values: 0..3.3 V
const MIN_TRAVEL_MV = 200; // the glove rejects sensors with less travel than this
const GOOD_TRAVEL_MV = 600;
const DEVICES = ["glove", "hand", "sim", "bglove", "bhand"];
// Views with slider cards (servo/value cards) instead of the glove's sensor cards
const sliderView = (device = state.device) => device === "hand" || device === "bglove";

const state = {
  source: null,            // null | "serial" | "demo"
  device: "glove",         // which board the page is set up for: "glove" | "hand" | "sim" | "bglove" | "bhand"
  detected: false,         // true = the connected board told us what it is
  // glove (and simulator): calibrated values 0..1 per channel
  value: {}, shown: {}, time: {},
  mv: {},                  // raw mV per channel {value, time}
  comp: {},                // mV with creep compensation per channel {value, time}
  sensorName: {},          // name the glove uses for this channel (for the "c" command)
  seen: {},                // channels the connected glove has reported (only those get a card)
  // robot hand: servo position 0..1, target, angle; the glove's value as received over radio
  pos: {}, goal: {}, deg: {}, posTime: {}, disp: {},
  glove: {}, gloveTime: {},
  status: null, statusTime: 0,   // {connected, manual, test, driver} from the status lines
  // both
  target: undefined,       // radio partner as reported by the board: undefined = unknown, null = broadcast
  lastGlove: null,         // robot hand: MAC of the glove that just connected
  history: [],             // [{t, w, mv, comp, pos, hs}]
  lineTimes: [],
  statusKey: "st_getrennt", statusKind: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp01 = v => Math.min(1, Math.max(0, v));
const rad = deg => deg * Math.PI / 180;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const encoder = new TextEncoder();

// Mix two colours; understands "#rrggbb" and "rgb(r,g,b)".
function toRgb(color) {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return color.match(/\d+/g).slice(0, 3).map(Number);
}
function mix(a, b, t) {
  const x = toRgb(a), y = toRgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

const isFresh = (id, now = performance.now()) => state.time[id] !== undefined && now - state.time[id] < FRESH_MS;
const freshEntry = (entry, now = performance.now()) => entry && now - entry.time < FRESH_MS ? entry.value : null;
const posFresh = (id, now = performance.now()) => state.posTime[id] !== undefined && now - state.posTime[id] < FRESH_MS;
const gloveFresh = (id, now = performance.now()) => state.gloveTime[id] !== undefined && now - state.gloveTime[id] < FRESH_MS;
const statusFresh = (now = performance.now()) => state.status && now - state.statusTime < FRESH_MS;

// Best raw reading of a channel right now: compensated mV if the glove sends it, else raw mV.
function liveMv(id, now = performance.now()) {
  const c = freshEntry(state.comp[id], now);
  return c !== null ? c : freshEntry(state.mv[id], now);
}
