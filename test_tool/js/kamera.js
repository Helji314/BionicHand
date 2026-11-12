"use strict";
// test_tool: kamera.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Camera calibration
// ===========================================================================
// The laptop camera watches the hand while the user moves freely. The hand
// tracker (MediaPipe hand landmarker, loaded from the CDN when the window opens,
// it runs in the browser: no video leaves the laptop) gives 21 points of the hand
// in 3D. From them the page takes how far each finger is bent (0 = straight,
// 1 = fist), and for every camera frame it stores that bend together with the
// voltage the glove streams at that moment. Per sensor a straight line through
// these pairs gives the voltage at bend 0 (= straight) and at bend 1 (= bent),
// which is sent to the glove like the wizard does ("c<name>=<straight>,<bent>").
// A sensor needs samples at both ends; what is still missing is shown as a pose
// on the 3D hand.
const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const CAM_BINS = 10;          // bend 0..1 in 10 bins; samples are kept per bin, so holding still doesn't outweigh the rest
const CAM_PER_BIN = 60;
const CAM_LOW = 0.25, CAM_HIGH = 0.7;  // a sensor needs samples below LOW (straight) and above HIGH (bent) ...
const CAM_MIN_END = 12;       // ... at least this many at each end
const CAM_STEADY = 0.06;      // bend changed more than this within 150 ms: moving too fast, sample skipped
const CAM_MIN_R2 = 0.7;       // how well the voltage has to follow the camera (1 = a perfect line)
const CAM_HINT_AFTER_MS = 8000;  // only after this much time with a hand in view: show the pose still needed
// Hand points (MediaPipe): 0 wrist, thumb 1-4, index 5-8, middle 9-12, ring 13-16, pinky 17-20
const CAM_LINES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

Object.assign(TEXTS.en, {
  kamKalibrieren: "Camera calibration", kamKalibrierenTitel: "Calibrate by moving the hand freely in front of the laptop camera",
  km_titel: "Calibrate with the camera",
  km_text: "Put the glove on, hold the whole hand in front of the camera and move it freely: open it wide, make a fist, bend single fingers, touch the little finger with the thumb. The page compares what the camera sees with the sensor values.",
  km_privat: "The camera picture is only shown small and is not saved or uploaded: the page only uses the hand it sees.",
  km_lade: "Starting the camera and the hand tracking (needs internet the first time)…",
  km_keineHand: "No hand in view. Hold the whole hand in front of the camera, with good light.",
  km_handDa: "Hand found. Keep moving.",
  km_bewegen: "Move the hand freely: open, fist, single fingers.",
  km_brauchtOffen: names => `Still needed: open the hand fully, all fingers straight (${names}).`,
  km_brauchtBeugen: names => `Still needed: bend ${names} fully.`,
  km_brauchtOpp: "Still needed: touch the tip of the little finger with the thumb.",
  km_alles: "All sensors measured. Save them to the glove.",
  km_teil: n => `${n} sensor(s) are ready. You can save them now or keep moving for the rest.`,
  km_fehltGerade: "needs straight",
  km_fehltGebeugt: "needs bent",
  km_schwach: "barely changes",
  km_unruhig: "doesn't follow, move slower",
  km_keinSignal: "no signal",
  km_neu: "Start over",
  km_speichern: "Save to glove",
  km_schliessen: "Close",
  km_speichere: "Saving…",
  km_gespeichert: n => `Saved on the glove (${n} sensor(s)).`,
  km_keineAntwort: "The glove did not confirm. Check the connection and save again.",
  km_demoGespeichert: "Demo: nothing was sent.",
  km_demo: "Demo: simulated camera, it sees the made-up glove movement.",
  km_keinZugriff: "The browser may not use the camera. Allow it (camera symbol in the address bar) and open this window again.",
  km_keineKamera: "No camera found.",
  km_ladeFehler: msg => `Camera or hand tracking failed: ${msg}`,
  km_so: "Solid: your hand as the camera sees it. See-through: move like this.",
  km_live: "Your hand as the camera sees it",
});
Object.assign(TEXTS.de, {
  kamKalibrieren: "Kamera-Kalibrierung", kamKalibrierenTitel: "Kalibrieren, indem man die Hand frei vor der Laptop-Kamera bewegt",
  km_titel: "Mit der Kamera kalibrieren",
  km_text: "Handschuh anziehen, die ganze Hand vor die Kamera halten und frei bewegen: weit öffnen, Faust machen, einzelne Finger beugen, mit dem Daumen den kleinen Finger berühren. Die Seite vergleicht, was die Kamera sieht, mit den Sensorwerten.",
  km_privat: "Das Kamerabild wird nur klein gezeigt und nicht gespeichert oder hochgeladen: die Seite nutzt nur die erkannte Hand.",
  km_lade: "Starte Kamera und Handerkennung (braucht beim ersten Mal Internet)…",
  km_keineHand: "Keine Hand im Bild. Die ganze Hand vor die Kamera halten, mit gutem Licht.",
  km_handDa: "Hand erkannt. Weiter bewegen.",
  km_bewegen: "Die Hand frei bewegen: öffnen, Faust, einzelne Finger.",
  km_brauchtOffen: names => `Noch nötig: die Hand ganz öffnen, alle Finger gestreckt (${names}).`,
  km_brauchtBeugen: names => `Noch nötig: ${names} ganz beugen.`,
  km_brauchtOpp: "Noch nötig: mit dem Daumen die Spitze des kleinen Fingers berühren.",
  km_alles: "Alle Sensoren gemessen. Jetzt im Handschuh speichern.",
  km_teil: n => `${n} Sensor(en) fertig. Du kannst sie jetzt speichern oder für den Rest weiter bewegen.`,
  km_fehltGerade: "fehlt gestreckt",
  km_fehltGebeugt: "fehlt gebeugt",
  km_schwach: "ändert sich kaum",
  km_unruhig: "folgt nicht, langsamer",
  km_keinSignal: "kein Signal",
  km_neu: "Neu anfangen",
  km_speichern: "Im Handschuh speichern",
  km_schliessen: "Schließen",
  km_speichere: "Speichere…",
  km_gespeichert: n => `Im Handschuh gespeichert (${n} Sensor(en)).`,
  km_keineAntwort: "Der Handschuh hat nicht bestätigt. Verbindung prüfen und nochmal speichern.",
  km_demoGespeichert: "Demo: es wurde nichts gesendet.",
  km_demo: "Demo: simulierte Kamera, sie sieht die ausgedachte Bewegung des Handschuhs.",
  km_keinZugriff: "Der Browser darf die Kamera nicht benutzen. Erlauben (Kamera-Symbol in der Adresszeile) und das Fenster neu öffnen.",
  km_keineKamera: "Keine Kamera gefunden.",
  km_ladeFehler: msg => `Kamera oder Handerkennung ging nicht: ${msg}`,
  km_so: "Fest: deine Hand, wie die Kamera sie sieht. Durchsichtig: so bewegen.",
  km_live: "Deine Hand, wie die Kamera sie sieht",
});

Object.assign(TEXTS.en, {
  kc_speichern: "Save mapping",
  kc_k_intro: "Calibrate the camera hand",
  kc_k_introText: (n, found) => `The page learns how far your fingers bend in front of the camera, so the robot hand moves its whole range. You'll hold ${n} poses for three seconds each, about a minute in total. Fingers: ${found}.`,
  kc_k_keineDaten: "The test board reports no fingers yet. Connect it (or start the demo) and open this again.",
  kc_k_tippIntro: "Hold the whole hand in front of the camera, with good light.",
  kc_s_faustText: "Make a firm fist with the thumb across the fingers. This checks all fingers together.",
  kc_s_offen2Text: "Straighten all fingers once more. This checks that they come back to their open value.",
  kc_u_keineDaten: names => `The camera didn't see ${names}. Keep the whole hand in view.`,
  kc_u_zurueck: "All fingers came back to their open value.",
  kc_u_schwach: names => `${names} hardly changed for the camera. Bend further, or turn the hand so the camera sees the fingers from the side.`,
  kc_u_gespeichert: "Mapping saved. The robot hand now moves 0 to 100 % between your open hand and your bent fingers.",
  kc_e_sensor: "Finger", kc_e_gerade: "Open, %", kc_e_gebeugt: "Bent, %", kc_k_alt: "before",
});
Object.assign(TEXTS.de, {
  kc_speichern: "Zuordnung speichern",
  kc_k_intro: "Kamera-Hand kalibrieren",
  kc_k_introText: (n, found) => `Die Seite lernt, wie weit sich deine Finger vor der Kamera beugen, damit die Roboterhand ihren ganzen Bereich nutzt. Du hältst ${n} Haltungen je drei Sekunden, insgesamt etwa eine Minute. Finger: ${found}.`,
  kc_k_keineDaten: "Das Testboard meldet noch keine Finger. Verbinden (oder die Demo starten) und das hier neu öffnen.",
  kc_k_tippIntro: "Die ganze Hand vor die Kamera halten, mit gutem Licht.",
  kc_s_faustText: "Eine feste Faust machen, Daumen über die Finger. Das prüft alle Finger zusammen.",
  kc_s_offen2Text: "Alle Finger noch einmal strecken. Das prüft, ob sie auf ihren offenen Wert zurückkommen.",
  kc_u_keineDaten: names => `Die Kamera hat ${names} nicht gesehen. Die ganze Hand im Bild halten.`,
  kc_u_zurueck: "Alle Finger sind auf ihren offenen Wert zurückgekommen.",
  kc_u_schwach: names => `${names} hat sich für die Kamera kaum geändert. Weiter beugen, oder die Hand so drehen, dass die Kamera die Finger von der Seite sieht.`,
  kc_u_gespeichert: "Zuordnung gespeichert. Die Roboterhand bewegt sich jetzt von 0 bis 100 % zwischen deiner offenen Hand und deinen gebeugten Fingern.",
  kc_e_sensor: "Finger", kc_e_gerade: "Offen, %", kc_e_gebeugt: "Gebeugt, %", kc_k_alt: "vorher",
});
Object.assign(TEXTS.en, {
  ke_mapping: "Mapping to the robot hand",
  ke_mapStart: "Calibrate mapping", ke_mapStartTitel: "The calibration wizard of the glove, one step per finger, with the camera: sets per finger which camera bend counts as open and closed.",
  ke_mapReset: "Reset", ke_mapResetTitel: "Forget the mapping: the camera bends go to the robot hand as they are",
  ke_mapKeine: "not calibrated: camera bends as they are",
  ke_mapAm: when => `calibrated ${when}`,
  ke_mapZeile: (raw, out) => `camera ${raw} % → ${out} %`,
});
Object.assign(TEXTS.de, {
  ke_mapping: "Zuordnung zur Roboterhand",
  ke_mapStart: "Zuordnung kalibrieren", ke_mapStartTitel: "Der Kalibrier-Assistent des Handschuhs, ein Schritt pro Finger, mit der Kamera: legt pro Finger fest, welche Kamera-Biegung als offen und als zu gilt.",
  ke_mapReset: "Zurücksetzen", ke_mapResetTitel: "Zuordnung vergessen: die Kamera-Biegungen gehen unverändert an die Roboterhand",
  ke_mapKeine: "nicht kalibriert: Kamera-Biegungen unverändert",
  ke_mapAm: when => `kalibriert ${when}`,
  ke_mapZeile: (raw, out) => `Kamera ${raw} % → ${out} %`,
});
Object.assign(TEXTS.en, {
  km_bild: "Camera picture", km_bildTitel: "Show or hide the camera picture",
  km_zurKamera: "The hand points at the camera: these frames are not used. Turn it a little to the side.",
  kamEingabe: "Camera as glove", kamEingabeTitel: "The hand in front of the laptop camera steers the values the test board sends",
  ke_text: "Move your hand in front of the laptop camera: the test board sends what the camera sees, like a glove. Closing this window stops it.",
  ke_handDa: "Hand found: the board sends what the camera sees.",
  ke_hintergrund: "Hand found: the test board keeps sending what the camera sees, also while the robot hand is shown.",
  ke_nurBglove: "Only for the test board as glove.",
});
Object.assign(TEXTS.de, {
  km_bild: "Kamerabild", km_bildTitel: "Kamerabild zeigen oder ausblenden",
  km_zurKamera: "Die Hand zeigt auf die Kamera: diese Bilder werden nicht genutzt. Etwas zur Seite drehen.",
  kamEingabe: "Kamera als Handschuh", kamEingabeTitel: "Die Hand vor der Laptop-Kamera steuert die Werte, die das Testboard sendet",
  ke_text: "Die Hand vor der Laptop-Kamera bewegen: das Testboard sendet, was die Kamera sieht, wie ein Handschuh. Schließen des Fensters beendet es.",
  ke_handDa: "Hand erkannt: das Board sendet, was die Kamera sieht.",
  ke_hintergrund: "Hand erkannt: das Testboard sendet weiter, was die Kamera sieht, auch während die Roboterhand angezeigt wird.",
  ke_nurBglove: "Nur für das Testboard als Handschuh.",
});

// ---------- hand tracking, shared by the camera calibration and "Camera as glove" ----------
// One camera and one tracker for both. Every camera frame gives the raw bends
// (used for the calibration samples), smoothed bends and the hand's turn (One
// Euro filter: steady when the hand is still, little lag when it moves fast).
// When the hand points at the camera, the tracker can barely see the bends:
// those frames give no samples and the shown values are held.
// finger reach in the picture (cameraBends): straight finger, fully bent finger
const CAM_REACH_STRAIGHT = 0.9, CAM_REACH_BENT = 0.15;
// thumb metacarpal out of the palm plane (cameraBends), degrees: opposition 0 and 1
const CAM_OPP_FLAT = 10, CAM_OPP_FULL = 60;
const CAM_POINTING = 0.75;  // hand direction more than this towards the camera (|z|, 1 = straight at it)
const track = {
  users: new Set(), phase: "aus", error: null,   // aus | lade | laeuft | fehler
  landmarker: null, stream: null, lastVideoTime: -1, lastFrame: 0, newFrame: false,
  raw: null, smooth: null, filters: {}, turnSmooth: null, mirrored: false, points: null, pointing: false, handTime: 0,
};

// One Euro filter (Casiez et al.): the faster the value changes, the higher the cut-off
function oneEuro(f, x, dt, minCutoff, beta) {
  const alpha = cutoff => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  if (f.x === undefined) { f.x = x; f.dx = 0; return x; }
  f.dx += alpha(1) * ((x - f.x) / dt - f.dx);
  f.x += alpha(minCutoff + beta * Math.abs(f.dx)) * (x - f.x);
  return f.x;
}

async function startTracking(user) {
  track.users.add(user);
  if (track.stream || track.phase === "lade") return;
  track.phase = "lade";
  track.error = null;
  let stream = null;
  try {
    const [tracker, media] = await Promise.allSettled([loadHandTracker(),
      // a sharper picture helps the tracker with small or far-away hands
      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" }, audio: false })]);
    if (media.status === "fulfilled") stream = media.value;
    if (media.status === "rejected") throw media.reason;
    if (tracker.status === "rejected") throw tracker.reason;
    if (!track.users.size) { stream.getTracks().forEach(tr => tr.stop()); track.phase = "aus"; return; }
    track.stream = stream;
    const video = $("kamVideo");
    video.srcObject = stream;
    await video.play();
    track.lastVideoTime = -1;
    track.phase = "laeuft";
  } catch (e) {
    stream?.getTracks().forEach(tr => tr.stop());
    track.phase = "fehler";
    track.error = e?.name === "NotAllowedError" ? t("km_keinZugriff") : e?.name === "NotFoundError" ? t("km_keineKamera")
      : t("km_ladeFehler", e?.message ?? String(e));
  }
}

function stopTracking(user) {
  track.users.delete(user);
  if (track.users.size) return;
  track.stream?.getTracks().forEach(tr => tr.stop());
  track.stream = null;
  $("kamVideo").srcObject = null;
  Object.assign(track, { phase: "aus", raw: null, smooth: null, filters: {}, turnSmooth: null, points: null, pointing: false,
    wrist: null, jump: null, label: undefined, labelNext: undefined, labelRun: 0 });
}

// Once per animation frame (main loop): analyse a new camera frame if there is one
function tickTracking(now) {
  track.newFrame = false;
  if (track.phase !== "laeuft" || !track.landmarker) return;
  const video = $("kamVideo");
  if (video.readyState < 2 || video.currentTime === track.lastVideoTime) return;
  track.lastVideoTime = video.currentTime;
  const dt = Math.min(0.2, Math.max(0.005, (now - (track.lastFrame || now - 33)) / 1000));
  track.lastFrame = now;
  track.newFrame = true;
  const r = track.landmarker.detectForVideo(video, now);
  // Which hand: the one closest to where the wrist was (the same hand keeps being
  // followed), at the start the biggest one in the picture.
  let pick = -1, best = Infinity;
  (r.landmarks ?? []).forEach((pts, i) => {
    const score = track.wrist && now - track.handTime < 1000
      ? Math.hypot(pts[0].x - track.wrist.x, pts[0].y - track.wrist.y)
      : -Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y);
    if (score < best) { best = score; pick = i; }
  });
  const world = pick >= 0 ? r.worldLandmarks?.[pick] : null;
  track.points = pick >= 0 ? r.landmarks[pick] : null;
  if (!world) {
    track.raw = null;
    if (now - track.handTime > 700) { track.smooth = null; track.filters = {}; track.jump = null; }  // gone for good: start fresh next time
    return;
  }
  const left = (track.label ?? r.handedness?.[pick]?.[0]?.categoryName) === "Left";
  const raw = cameraBends(world, track.points, (video.videoWidth / video.videoHeight) || 4 / 3, left), turn = cameraTurn(world);
  // A single frame where a finger jumps far (tracker glitch) is skipped; if the
  // next frame agrees with it, it was a real fast move and is taken.
  if (track.raw && now - track.handTime < 150) {
    const jumped = Object.keys(raw).some(id => Math.abs(raw[id] - track.raw[id]) > 0.45);
    const confirmed = track.jump && Object.keys(raw).every(id => Math.abs(raw[id] - track.jump[id]) < 0.2);
    if (jumped && !confirmed) { track.jump = raw; track.newFrame = false; return; }
  }
  track.jump = null;
  track.handTime = now;
  track.wrist = { x: track.points[0].x, y: track.points[0].y };
  track.raw = raw;
  // Left/right: MediaPipe sometimes flips its guess for a frame or two; only
  // switch after 8 frames in a row (otherwise the model would flip to the mirror image)
  const label = r.handedness?.[pick]?.[0]?.categoryName;
  if (label) {
    track.labelRun = label === track.labelNext ? (track.labelRun ?? 0) + 1 : 1;
    track.labelNext = label;
    if (track.label === undefined || track.labelRun >= 8) track.label = label;
  }
  track.mirrored = track.label === "Left";
  track.pointing = !!turn && Math.abs(turn.f.z) > CAM_POINTING;
  const smooth = {};
  for (const [id, x] of Object.entries(raw)) {
    const f = track.filters[id] ??= {};
    if (track.pointing && f.x !== undefined) f.x += (x - f.x) * 0.03;  // hold: the bends are unreliable now
    else oneEuro(f, x, dt, 1.0, 2.5);
    smooth[id] = f.x;
  }
  track.smooth = smooth;
  if (turn) {
    if (!track.turnSmooth) track.turnSmooth = turn.q.clone();
    else {
      // the faster the hand turns, the more directly the model follows
      const speed = track.turnSmooth.angleTo(turn.q) / dt;
      track.turnSmooth.slerp(turn.q, 1 / (1 + 1 / (2 * Math.PI * (1.0 + 0.8 * speed) * dt)));
    }
  }
}

// The camera picture, mirrored like a mirror, with the tracked hand on top
function drawCameraPicture(canvas) {
  const video = $("kamVideo");
  const { ctx, w, h } = prepare(canvas);
  if (track.phase !== "laeuft" || !video.videoWidth) return;
  const s = Math.max(w / video.videoWidth, h / video.videoHeight);  // fill the box, like object-fit: cover
  const vw = video.videoWidth * s, vh = video.videoHeight * s, ox = (w - vw) / 2, oy = (h - vh) / 2;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, ox, oy, vw, vh);
  if (track.points && performance.now() - track.handTime < 700) {
    const xy = p => [ox + p.x * vw, oy + p.y * vh];
    ctx.lineWidth = 2;
    ctx.strokeStyle = track.pointing ? css("--warn") || "#f59f00" : "rgb(255 255 255 / .9)";
    ctx.beginPath();
    for (const [a, b] of CAM_LINES) { ctx.moveTo(...xy(track.points[a])); ctx.lineTo(...xy(track.points[b])); }
    ctx.stroke();
  }
  ctx.restore();
}

const cam = {
  phase: "aus",            // aus | lade | laeuft | speichert | fehler
  ids: [], samples: {}, fit: {}, bends: null, history: [], demo: false,
  handTime: 0, seenMs: 0, lastTick: 0, nextFit: 0, need: null, needSince: 0,
  verdict: null, error: null, before: {},
};
let mpModule = null;
let camRows = {};

async function loadHandTracker() {
  if (track.landmarker) return track.landmarker;
  mpModule ??= await import(MP_URL + "/vision_bundle.mjs");
  const files = await mpModule.FilesetResolver.forVisionTasks(MP_URL + "/wasm");
  const options = delegate => ({
    // two hands: if a second hand (or something hand-like) comes into view, we keep following the first one
    baseOptions: { modelAssetPath: MP_MODEL, delegate }, runningMode: "VIDEO", numHands: 2,
    // lower than the defaults: the tracker keeps the hand longer, e.g. while it turns towards the camera
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.3,
  });
  try { track.landmarker = await mpModule.HandLandmarker.createFromOptions(files, options("GPU")); }
  catch (e) { track.landmarker = await mpModule.HandLandmarker.createFromOptions(files, options("CPU")); }
  return track.landmarker;
}

// ---------- bends from the 21 hand points (3D, in metres) ----------
const v3 = (a, b) => [b.x - a.x, b.y - a.y, b.z - a.z];
const len3 = v => Math.hypot(v[0], v[1], v[2]);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// Bend at point b in degrees: 0 when a, b and c are in a straight line
function jointAngle(p, a, b, c) {
  const u = v3(p[a], p[b]), w = v3(p[b], p[c]);
  const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (len3(u) * len3(w) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}
// Bend at point b in degrees, only the part that turns about the axis "across"
// (index knuckle -> little finger knuckle): spreading the fingers sideways is not
// bending. Without this, an open hand with spread fingers read like a half-bent
// index finger (the knuckle angle grew with the spread).
function flexAngle(p, a, b, c, across) {
  const flat = v => { const d = v[0] * across[0] + v[1] * across[1] + v[2] * across[2]; return [v[0] - d * across[0], v[1] - d * across[1], v[2] - d * across[2]]; };
  const u = flat(v3(p[a], p[b])), w = flat(v3(p[b], p[c]));
  const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (len3(u) * len3(w) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}
// p: the 3D points (metres), img: the same points in the picture (0..1 of width and
// height), aspect: picture width / height
// left: the real left hand (MediaPipe's label), for which way the palm faces
function cameraBends(p, img, aspect = 4 / 3, left = false) {
  // Fingers, two measures; the larger one counts:
  // 1. The three joints in 3D together, sideways spread left out (flexAngle).
  //    Straight ≈ 25° (the palm is slightly curved), fist ≈ 250°. The tracker's depth
  //    is weak: a bent finger often only reaches about 60 %, and less when only that
  //    one finger is bent (the model expects the neighbours to bend with it).
  // 2. Reach in the picture: knuckle -> fingertip in the picture, divided by the
  //    finger's length. To compare picture with 3D, both are taken relative to the palm
  //    (wrist -> middle knuckle), which shrinks in the picture just like a straight finger
  //    when the hand turns. Straight ≈ 0.9, bent towards or away from the camera
  //    0.05..0.4 (measured on photos). The picture points are the tracker's most
  //    reliable output, and each finger is measured on its own.
  const ax = v3(p[5], p[17]), axLen = len3(ax) || 1, axis = [ax[0] / axLen, ax[1] / axLen, ax[2] / axLen];
  const d2 = (i, j) => Math.hypot((img[i].x - img[j].x) * aspect, img[i].y - img[j].y);
  const palm2 = img ? d2(0, 9) : 0, palm3 = len3(v3(p[0], p[9]));
  const reach = m => {
    if (palm2 < 1e-4) return 0;
    const bones = len3(v3(p[m], p[m + 1])) + len3(v3(p[m + 1], p[m + 2])) + len3(v3(p[m + 2], p[m + 3]));
    return clamp01((CAM_REACH_STRAIGHT - d2(m, m + 3) / palm2 * palm3 / (bones || 1)) / (CAM_REACH_STRAIGHT - CAM_REACH_BENT));
  };
  const finger = m => Math.max(reach(m),
    clamp01((flexAngle(p, 0, m, m + 1, axis) + flexAngle(p, m, m + 1, m + 2, axis) + flexAngle(p, m + 1, m + 2, m + 3, axis) - 25) / 225));
  // Thumb opposition: how far the thumb's metacarpal (base joint 1 -> knuckle 2) swings
  // out of the palm plane to the palm side, in degrees. That is what opposing does (and
  // what the robot hand's opposition servo does); tucking the thumb in bends its knuckle
  // and tip joint but leaves the metacarpal in the palm plane. (Before, opposition was
  // where the tip was across the palm, and tucking in moves the tip there too.)
  // Palm side: wrist->index knuckle × wrist->little finger knuckle, flipped for a left
  // hand (checked on photos: the fingers curl to that side). Open hand ≈ 5–10°,
  // thumb spread sideways ≈ 25°, opposed ≈ 50–70°.
  const nx = cross3(v3(p[0], p[5]), v3(p[0], p[17])), nLen = len3(nx) || 1, side = left ? -1 : 1;
  const meta = v3(p[1], p[2]), metaLen = len3(meta) || 1;
  const lift = Math.asin(Math.max(-1, Math.min(1, side * (meta[0] * nx[0] + meta[1] * nx[1] + meta[2] * nx[2]) / (nLen * metaLen)))) * 180 / Math.PI;
  return {
    index: finger(5), middle: finger(9), ring: finger(13), pinky: finger(17),
    thumbFlex: clamp01((jointAngle(p, 1, 2, 3) + jointAngle(p, 2, 3, 4) - 10) / 120),
    thumbOpp: clamp01((lift - CAM_OPP_FLAT) / (CAM_OPP_FULL - CAM_OPP_FLAT)),
  };
}

// How the hand is turned, for the 3D model. Shown like a mirror: the points
// (x right, y down, z away from the camera) become x left, y up, z towards the
// viewer. Finger direction f (wrist -> middle knuckle), a (index knuckle ->
// little finger knuckle, at right angles to f) and f × a are the model's x, y
// and z (z = back of the hand). The model is a left hand, and a right hand seen
// in a mirror looks like a left one; for a left hand the model is mirrored.
// MediaPipe names the real hand when it gets the picture unmirrored (as here,
// only the display is mirrored): "Left" = left hand.
function cameraTurn(p) {
  const T = window.THREE;
  if (!T) return null;
  const v = i => new T.Vector3(-p[i].x, -p[i].y, -p[i].z);
  const f = v(9).sub(v(0)).normalize();
  const a = v(17).sub(v(5));
  a.sub(f.clone().multiplyScalar(a.dot(f))).normalize();
  const n = new T.Vector3().crossVectors(f, a);
  const m = new T.Matrix4().makeBasis(f, a, n);
  // the 3D view's hand group is turned 90° about z inside the group we turn
  const q = new T.Quaternion().setFromRotationMatrix(m).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -Math.PI / 2));
  return { q, f };
}

// ---------- samples and the fit ----------
function takeCameraSample(bends, now) {
  cam.history.push({ t: now, b: bends });
  while (cam.history.length && now - cam.history[0].t > 400) cam.history.shift();
  const before = cam.history.find(h => now - h.t <= 150);
  for (const id of cam.ids) {
    const b = bends[id];
    if (b === undefined) continue;
    if (before && Math.abs(before.b[id] - b) > CAM_STEADY) continue;  // moving fast: camera and sensor may not match
    const mv = liveMv(id, now);
    if (mv === null) continue;
    const bins = cam.samples[id] ??= Array.from({ length: CAM_BINS }, () => []);
    const bin = bins[Math.min(CAM_BINS - 1, Math.floor(b * CAM_BINS))];
    bin.push([b, mv]);
    if (bin.length > CAM_PER_BIN) bin.shift();
  }
}

// Straight line through the middle of each bin (median bend, median voltage),
// weighted by how many samples the bin has.
function fitCamera(id) {
  const bins = cam.samples[id] ?? [];
  const pts = [];
  let low = 0, high = 0;
  for (const bin of bins) {
    if (!bin.length) continue;
    const b = median(bin.map(s => s[0])), mv = median(bin.map(s => s[1]));
    pts.push({ b, mv, w: Math.min(bin.length, 15) });
    if (b < CAM_LOW) low += bin.length;
    if (b > CAM_HIGH) high += bin.length;
  }
  const f = { low, high, counts: bins.map(bin => bin.length), ok: false };
  if (pts.length < 2) return f;
  let sw = 0, sb = 0, sm = 0;
  for (const p of pts) { sw += p.w; sb += p.w * p.b; sm += p.w * p.mv; }
  const mb = sb / sw, mm = sm / sw;
  let sbb = 0, sbm = 0, smm = 0;
  for (const p of pts) { sbb += p.w * (p.b - mb) ** 2; sbm += p.w * (p.b - mb) * (p.mv - mm); smm += p.w * (p.mv - mm) ** 2; }
  if (sbb <= 0) return f;
  const k = sbm / sbb, a = mm - k * mb;
  f.r2 = smm > 0 ? (sbm * sbm) / (sbb * smm) : 0;
  f.straight = Math.min(MAX_MV, Math.max(0, a));
  f.bent = Math.min(MAX_MV, Math.max(0, a + k));
  f.travel = Math.abs(f.bent - f.straight);
  f.enough = low >= CAM_MIN_END && high >= CAM_MIN_END;
  f.ok = f.enough && f.travel >= MIN_TRAVEL_MV && f.r2 >= CAM_MIN_R2;
  return f;
}

function cameraStatus(f) {
  if (!f || f.low < CAM_MIN_END) return ["km_fehltGerade", "warn"];
  if (f.high < CAM_MIN_END) return ["km_fehltGebeugt", "warn"];
  if (f.travel < MIN_TRAVEL_MV) return ["km_schwach", "fehler"];
  if (f.r2 < CAM_MIN_R2) return ["km_unruhig", "warn"];
  return [null, "ok"];
}

// The pose still needed: first everything straight, then the fingers that were
// never bent, the opposition last (it can't be done together with a fist).
function neededPose() {
  const missing = test => cam.ids.filter(id => test(cam.fit[id] ?? { low: 0, high: 0 }));
  const noLow = missing(f => f.low < CAM_MIN_END);
  if (noLow.length) return { key: "km_brauchtOffen", ids: noLow, pose: {} };
  const noHigh = missing(f => f.high < CAM_MIN_END);
  const fingers = noHigh.filter(id => id !== "thumbOpp");
  if (fingers.length) return { key: "km_brauchtBeugen", ids: fingers, pose: Object.fromEntries(fingers.map(id => [id, 1])) };
  if (noHigh.includes("thumbOpp")) return { key: "km_brauchtOpp", ids: ["thumbOpp"], pose: { thumbOpp: 1, pinky: 0.35 } };
  return null;
}

// ---------- window ----------
function openCamera() {
  Object.assign(cam, { ids: presentChannels(), samples: {}, fit: {}, bends: null, history: [],
    handTime: 0, seenMs: 0, lastTick: performance.now(), nextFit: 0, need: null, verdict: null, error: null,
    demo: state.source === "demo", before: { ...(boardSelf("glove")?.calib ?? {}) } });
  buildCameraRows();
  showCameraPicture();
  $("kamKal").showModal();
  cam.phase = "laeuft";
  if (!cam.demo) startTracking("kalibrierung");
  renderCamera();
}

function stopCamera() {
  if (cam.phase === "aus") return;
  cam.phase = "aus";
  stopTracking("kalibrierung");
}

// Camera picture on or off (remembered)
function showCameraPicture() {
  let on = true;
  try { on = localStorage.getItem("kamBild") !== "aus"; } catch (e) {}
  $("kamVideoBox").hidden = cam.demo || !on;
  $("kamBildKnopf").hidden = cam.demo;
  $("kamBildKnopf").setAttribute("aria-pressed", on);
}
$("kamBildKnopf").onclick = () => {
  const on = $("kamBildKnopf").getAttribute("aria-pressed") !== "true";
  try { localStorage.setItem("kamBild", on ? "an" : "aus"); } catch (e) {}
  showCameraPicture();
};

function buildCameraRows() {
  const box = $("kamLive");
  box.innerHTML = "";
  box.dataset.sprache = language;
  camRows = {};
  for (const id of cam.ids) {
    const row = document.createElement("div");
    row.className = "km-zeile";
    row.innerHTML = `<span>${channelName(id)}</span>
      <div class="km-faecher">${"<span></span>".repeat(CAM_BINS)}<div class="marke" hidden></div></div>
      <span class="klein note"></span>`;
    row.querySelector(".km-faecher").style.setProperty("--f", CHANNEL[id].color);
    box.appendChild(row);
    camRows[id] = { cells: [...row.querySelectorAll(".km-faecher span")], mark: row.querySelector(".marke"), note: row.querySelector(".note") };
  }
}

function updateCameraRows(now) {
  for (const [id, r] of Object.entries(camRows)) {
    const f = cam.fit[id];
    (f?.counts ?? []).forEach((n, i) => { r.cells[i].dataset.voll = n >= 3 ? "ja" : n > 0 ? "halb" : "nein"; });
    const b = cam.bends?.[id];
    r.mark.hidden = b === undefined;
    if (b !== undefined) r.mark.style.left = (b * 100) + "%";
    const [key, kind] = liveMv(id, now) === null ? ["km_keinSignal", "fehler"] : cameraStatus(f);
    const text = key ? t(key) : `${Math.round(f.straight)} → ${Math.round(f.bent)} mV`;
    if (r.note.textContent !== text) r.note.textContent = text;
    r.note.dataset.art = kind;
  }
}

function renderCamera() {
  $("kamTitel").textContent = t("km_titel");
  if ($("kamLive").dataset.sprache !== language) { buildCameraRows(); updateCameraRows(performance.now()); }
  const ready = cam.ids.filter(id => cam.fit[id]?.ok);
  let status = "", kind = "";
  if (!cam.demo && track.phase === "lade") status = t("km_lade");
  else if (!cam.demo && track.phase === "fehler") { status = track.error; kind = "fehler"; }
  else if (cam.verdict) { status = t(...cam.verdict.args); kind = cam.verdict.kind; }
  else if (cam.phase === "laeuft") {
    if (!cam.demo && cam.bends && track.pointing) { status = t("km_zurKamera"); kind = "warn"; }
    else if (cam.need) status = t(cam.need.key, cam.need.ids.map(channelName).join(", "));
    else if (ready.length && ready.length === cam.ids.length) { status = t("km_alles"); kind = "ok"; }
    else if (ready.length && cam.seenMs > CAM_HINT_AFTER_MS) status = t("km_teil", ready.length);
    else status = !cam.demo && !cam.bends ? t("km_keineHand") : t(cam.seenMs > 1500 ? "km_handDa" : "km_bewegen");
  }
  if ($("kamUrteil").textContent !== status) $("kamUrteil").textContent = status;
  $("kamUrteil").dataset.art = kind;
  $("kamDemo").hidden = !cam.demo;
  $("kamSpeichern").textContent = t(cam.verdict?.final ? "km_schliessen" : cam.phase === "speichert" ? "km_speichere" : "km_speichern");
  $("kamSpeichern").disabled = cam.phase === "speichert" || (!cam.verdict?.final && !ready.length);
  $("kamNeu").disabled = cam.phase !== "laeuft" || (!cam.demo && track.phase !== "laeuft");
  $("kamTipp").textContent = cam.need ? t("km_so") : cam.bends ? t("km_live") : "";
}

// Called from the animation loop (after tickTracking)
function tickCamera(now) {
  if (!$("kamKal").open) return;
  const dt = Math.min(100, now - cam.lastTick);
  cam.lastTick = now;
  if (cam.phase === "laeuft" || cam.phase === "speichert") {
    if (cam.demo) {
      // the made-up glove: the "camera" sees its true bend, a bit noisy
      if (cam.ids.every(id => demo.values[id] !== undefined)) {
        cam.bends = Object.fromEntries(cam.ids.map(id => [id, clamp01(demo.values[id] + (Math.random() - 0.5) * 0.05)]));
        cam.handTime = now;
        if (cam.phase === "laeuft") takeCameraSample(cam.bends, now);
      }
    } else {
      cam.bends = track.smooth;
      // samples from the raw bends (no filter lag against the sensor), not while the hand points at the camera
      if (track.newFrame && track.raw && !track.pointing && cam.phase === "laeuft") takeCameraSample(track.raw, now);
      if (track.smooth) cam.handTime = now;
      if (!$("kamVideoBox").hidden) drawCameraPicture($("kamBild"));
    }
    if (now - cam.handTime > 500) cam.bends = null;
    if (cam.bends) cam.seenMs += dt;
    if (now >= cam.nextFit) {
      cam.nextFit = now + 250;
      for (const id of cam.ids) cam.fit[id] = fitCamera(id);
      const need = cam.seenMs > CAM_HINT_AFTER_MS ? neededPose() : null;
      if (need?.key !== cam.need?.key || need?.ids.join() !== cam.need?.ids.join()) cam.needSince = now;
      cam.need = need;
      renderCamera();
    }
    updateCameraRows(now);
  }
  drawCameraHand(now);
}

// 3D hand: the model moves like the hand the camera sees. The pose still needed
// is a see-through second hand on top: it follows the user's hand, only the
// fingers still needed move from where they are now to the target and back.
function drawCameraHand(now) {
  const setUp = canvas => {
    const view = handViews.get(canvas);
    if (!view) return;
    view.hideContacts = true;
    view.orientation = cam.demo ? null : track.turnSmooth;
    view.orientationEase = 1;   // already smoothed in tickTracking
    view.mirrored = !cam.demo && track.mirrored;
  };
  setUp($("kamHand"));
  drawHand($("kamHand"), id => cam.bends?.[id] ?? 0, id => cam.bends && cam.ids.includes(id) ? CHANNEL[id].color : null);
  const need = cam.need;
  $("kamGeistBox").hidden = !need;
  if (!need) return;
  let amount = 1;
  if (!reducedMotion.matches && Object.keys(need.pose).length) {
    const loop = ((now - cam.needSince) % 3200) / 3200;
    const lin = loop < 0.25 ? loop / 0.25 : loop < 0.7 ? 1 : loop < 0.9 ? 1 - (loop - 0.7) / 0.2 : 0;
    amount = 0.5 - 0.5 * Math.cos(Math.PI * lin);
  }
  const moves = id => need.ids.includes(id) || id in need.pose;
  // the see-through hand takes the solid one's turn as it is right now, so they never drift apart
  const live = handViews.get($("kamHand")), ghost = handViews.get($("kamGeist"));
  if (ghost) {
    ghost.hideContacts = true;
    ghost.orientation = null;
    ghost.mirrored = !cam.demo && track.mirrored;
    if (live?.turnGroup && ghost.turnGroup) ghost.turnGroup.quaternion.copy(live.turnGroup.quaternion);
  }
  drawHand($("kamGeist"), id => {
    const now_ = cam.bends?.[id] ?? 0;
    return moves(id) ? now_ + ((need.pose[id] ?? 0) - now_) * amount : now_;
  }, id => moves(id) ? CHANNEL[id].color : null);
}

async function saveCamera() {
  const ids = cam.ids.filter(id => cam.fit[id]?.ok);
  if (!ids.length) return;
  if (state.source === "demo") { cam.verdict = { args: ["km_demoGespeichert"], kind: "ok", final: true }; renderCamera(); return; }
  const sensor = id => state.sensorName[id] || CHANNEL[id].keys[0];
  // keep the calibration from before, like the wizard ("Restore saved calibration")
  const self = boardSelf("glove");
  if (self?.mac && Object.keys(cam.before).length) {
    try { localStorage.setItem("sicherung-alt:" + self.mac, JSON.stringify({ device: "glove", time: Date.now(), calib: cam.before })); } catch (e) {}
  }
  cam.phase = "speichert";
  cam.verdict = null;
  renderCamera();
  cal.confirmed = new Set();  // the "CAL <name> ..." answers land here (see handleLine)
  for (const id of ids) {
    const f = cam.fit[id];
    await send(`c${sensor(id)}=${Math.round(f.straight)},${Math.round(f.bent)}\n`);
    await new Promise(r => setTimeout(r, 120));
  }
  const start = performance.now();
  while (!ids.every(id => cal.confirmed.has(sensor(id))) && performance.now() - start < 3000) {
    await new Promise(r => setTimeout(r, 100));
  }
  const ok = ids.every(id => cal.confirmed.has(sensor(id)));
  cam.verdict = ok ? { args: ["km_gespeichert", ids.length], kind: "ok", final: true } : { args: ["km_keineAntwort"], kind: "fehler" };
  cam.phase = "laeuft";
  renderCamera();
}

function closeCamera() {
  stopCamera();
  if ($("kamKal").open) $("kamKal").close();
}

// ---------- camera as glove (test board as glove) ----------
// The tracked hand steers the values the test board sends, through the same
// "s F0:… F1:…" command as the finger sliders (setFingers, at most every 50 ms).
const camInput = { on: false, last: 0 };

function setCameraInput(on) {
  if (camInput.on === on) return;
  camInput.on = on;
  $("kamEingabeKnopf").setAttribute("aria-pressed", on);
  if (on) {
    startTracking("eingabe");
    if (!$("kamEingabeFenster").open) $("kamEingabeFenster").show();
  } else {
    stopTracking("eingabe");
    if (cal.camera && $("kal").open) closeCalibration();
    if ($("kamEingabeFenster").open) $("kamEingabeFenster").close();
  }
}
$("kamEingabeKnopf").onclick = () => setCameraInput(!camInput.on);
$("kamEingabeFenster").addEventListener("close", () => setCameraInput(false));

// ---------- mapping: camera bend -> robot hand value ----------
// Every hand (and every camera angle) bends a little differently: an open hand
// may read 0.25 and a fist 0.8. Three held poses set per finger which camera
// bend counts as 0 (open) and 1 (closed). Saved in the browser.
const camMap = { data: null };
try { camMap.data = JSON.parse(localStorage.getItem("kamMapping")) || null; } catch (e) {}
let camMapRows = {};

// s: all camera values (the thumb needs both of its values)
function mapCamera(id, v, s) {
  const u = camMap.data?.thumb;
  if (u && (id === "thumbFlex" || id === "thumbOpp") && s?.thumbFlex !== undefined && s?.thumbOpp !== undefined) {
    // undo the mix (saveCameraMapping): 1 = the calibration pose; same margins as below
    const df = s.thumbFlex - u.f0, dop = s.thumbOpp - u.o0;
    const r = id === "thumbFlex" ? 0 : 1;
    return clamp01((u.m[r][0] * df + u.m[r][1] * dop - 0.08) / 0.77);
  }
  const m = camMap.data?.[id];
  return m ? clamp01((v - m.open) / (m.closed - m.open)) : v;
}

function buildCameraMapRows() {
  const box = $("kamMapZeilen");
  box.innerHTML = "";
  box.dataset.sprache = language;
  camMapRows = {};
  for (const c of CHANNELS) {
    const row = document.createElement("div");
    row.className = "live-zeile km-map-zeile";
    row.innerHTML = `<span>${channelName(c.id)}</span>
      <div class="spur"><div class="fuellung" style="background:${c.color}"></div><div class="marke" hidden></div><div class="marke" hidden></div></div>
      <span class="klein"></span>`;
    box.appendChild(row);
    const marks = row.querySelectorAll(".marke");
    camMapRows[c.id] = { fill: row.querySelector(".fuellung"), open: marks[0], closed: marks[1], num: row.querySelector(".klein") };
  }
}

$("kamMapStart").onclick = () => openCalibration(true);
$("kamMapReset").onclick = () => {
  camMap.data = null;
  try { localStorage.removeItem("kamMapping"); } catch (e) {}
};

function showCameraMapping(now) {
  if ($("kamMapZeilen").dataset.sprache !== language) buildCameraMapRows();
  const s = track.smooth;
  for (const c of CHANNELS) {
    const r = camMapRows[c.id], m = camMap.data?.[c.id], v = s?.[c.id];
    r.fill.style.width = v === undefined ? "0" : (mapCamera(c.id, v, s) * 100) + "%";
    r.open.hidden = r.closed.hidden = !m;
    if (m) { r.open.style.left = (m.open * 100) + "%"; r.closed.style.left = (m.closed * 100) + "%"; }
    const text = v === undefined ? "–" : t("ke_mapZeile", Math.round(v * 100), Math.round(mapCamera(c.id, v, s) * 100));
    if (r.num.textContent !== text) r.num.textContent = text;
  }
  const info = camMap.data?.time ? t("ke_mapAm", new Date(camMap.data.time).toLocaleString(language, { dateStyle: "short", timeStyle: "short" })) : t("ke_mapKeine");
  if ($("kamMapInfo").textContent !== info) $("kamMapInfo").textContent = info;
  $("kamMapStart").disabled = track.phase !== "laeuft";
  $("kamMapReset").disabled = !camMap.data;
}

function tickCameraInput(now) {
  if (!camInput.on) return;
  // With two boards it keeps going while the page shows the robot hand: then the
  // values go straight to the test board (not through the sliders, which belong
  // to the board on screen). Without a test board it stops.
  const shown = state.device === "bglove";
  const board = shown || state.source === "demo" ? null : connOf("bglove");
  if (!shown && !board) { setCameraInput(false); return; }
  drawCameraPicture($("kamEingabeBild"));
  let text = "", kind = "";
  if (track.phase === "lade") text = t("km_lade");
  else if (track.phase === "fehler") { text = track.error; kind = "fehler"; }
  else if (!track.smooth) text = t("km_keineHand");
  else if (track.pointing) { text = t("km_zurKamera"); kind = "warn"; }
  else { text = t(shown ? "ke_handDa" : "ke_hintergrund"); kind = "ok"; }
  if ($("kamEingabeStatus").textContent !== text) $("kamEingabeStatus").textContent = text;
  $("kamEingabeStatus").dataset.art = kind;
  showCameraMapping(now);
  // while the mapping is calibrated, the robot hand doesn't follow (it would only get in the way)
  const calibrating = cal.camera && $("kal").open;
  if (track.smooth && !calibrating && now - camInput.last >= 50) {
    camInput.last = now;
    const s = track.smooth;
    const values = CHANNELS.filter(c => s[c.id] !== undefined).map(c => [c.k, +mapCamera(c.id, s[c.id], s).toFixed(3)]);
    if (shown) setFingers(Object.fromEntries(values));
    else if (values.length) sendTo(board, "s " + values.map(([k, v]) => `${k}:${v.toFixed(3)}`).join(" ") + "\n", true);
  }
}

$("kamKalibrieren").onclick = openCamera;
$("kamAbbrechen").onclick = closeCamera;
$("kamNeu").onclick = () => { Object.assign(cam, { samples: {}, fit: {}, seenMs: 0, need: null, verdict: null }); updateCameraRows(performance.now()); renderCamera(); };
$("kamSpeichern").onclick = () => (cam.verdict?.final ? closeCamera() : saveCamera());
$("kamKal").addEventListener("close", stopCamera);
