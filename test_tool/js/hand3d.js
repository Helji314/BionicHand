"use strict";
// test_tool: hand3d.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ---------------------------------------------------------------------------
// Hand model: the robot hand in 3D with three.js; without internet or WebGL a
// flat drawing instead. (Merged from the glove monitor and the control panel.)
// Drag turns the 3D hand, double-click resets it.
// valueOf(id) -> 0..1 or null (no data, drawn grey); colorOf(id) -> colour or null (plain skin).
// ---------------------------------------------------------------------------
const FINGER_JOINTS = [80, 100, 70];  // max angle of base, middle, end joint (degrees)
const THUMB_JOINTS = [25, 45, 50];

// Thumb colour: "opposite" wins when it is the bigger movement.
function thumbState(valueOf, colorOf) {
  const flex = valueOf("thumbFlex"), opp = valueOf("thumbOpp");
  const value = flex ?? (opp !== null ? 0 : null);
  const color = opp !== null && opp > 0 && (flex === null || opp > flex) ? colorOf("thumbOpp") : colorOf("thumbFlex");
  return { flex, opp, value, color };
}

// ---------- flat drawing ----------
// Bending tilts the segments away from the viewer, so they get shorter (cos);
// past 90° they fold under the hand and disappear behind it.
const FLAT_FINGERS = [
  { id: "index",  x: 142, y: 252, lengths: [64, 38, 28], width: 30 },
  { id: "middle", x: 186, y: 250, lengths: [70, 42, 30], width: 31 },
  { id: "ring",   x: 230, y: 252, lengths: [66, 39, 28], width: 29 },
  { id: "pinky",  x: 272, y: 258, lengths: [50, 30, 24], width: 25 },
];
const FLAT_THUMB = { x: 140, y: 372, lengths: [54, 40, 32], width: 32 };

function fingerSegments(x, y, direction, lengths, joints, value, width) {
  const dx = Math.sin(rad(direction)), dy = -Math.cos(rad(direction));
  const segments = [];
  let angle = 0;
  for (let i = 0; i < lengths.length; i++) {
    angle += rad(joints[i] * (value ?? 0));
    const l = lengths[i] * Math.cos(angle);
    segments.push({ x1: x, y1: y, x2: x + dx * l, y2: y + dy * l, angle,
                    width: width - i * 2, behind: Math.cos(angle) < 0 });
    x += dx * l; y += dy * l;
  }
  return segments;
}

function paintSegment(ctx, g, fill, edge) {
  ctx.lineCap = "round";
  ctx.strokeStyle = edge; ctx.lineWidth = g.width + 3;
  ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
  ctx.strokeStyle = fill; ctx.lineWidth = g.width;
  ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
}

// Active fingers take on their channel colour as they bend.
function paintChain(ctx, colors, segments, value, color) {
  for (const g of segments) {
    let fill, edge;
    if (value === null) { fill = mix(colors.skin, colors.off, 0.5); edge = colors.skinEdge; }
    else if (!color) { fill = colors.skin; edge = colors.skinEdge; }
    else { fill = mix(colors.skin, color, 0.15 + 0.6 * Math.min(1, g.angle / (Math.PI / 2))); edge = color; }
    paintSegment(ctx, g, fill, edge);
  }
}

function drawFlatHand(ctx, w, h, valueOf, colorOf) {
  const colors = { skin: css("--haut"), skinEdge: css("--haut-rand"), off: css("--inaktiv") };
  const s = Math.min(w / 300, h / 370) * 0.92;  // drawing spans x 20..320, y 98..468
  ctx.save();
  ctx.translate((w - 300 * s) / 2, (h - 370 * s) / 2 + 6);
  ctx.scale(s, s);
  ctx.translate(-20, -98);

  const fingers = FLAT_FINGERS.map(f => ({
    value: valueOf(f.id), color: colorOf(f.id),
    segments: fingerSegments(f.x, f.y, 0, f.lengths, FINGER_JOINTS, valueOf(f.id), f.width),
  }));
  // curled-in segments lie under the hand
  for (const f of fingers) paintChain(ctx, colors, f.segments.filter(g => g.behind), f.value, f.color);

  ctx.fillStyle = colors.skin; ctx.strokeStyle = colors.skinEdge; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(146, 396, 128, 66, 18); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(120, 236, 176, 178, 36); ctx.fill(); ctx.stroke();

  for (const f of fingers) paintChain(ctx, colors, f.segments.filter(g => !g.behind), f.value, f.color);

  // Thumb: "opposite" turns it towards the middle of the hand, "flex" bends it.
  const t = thumbState(valueOf, colorOf);
  const direction = -52 + 72 * (t.opp ?? 0) + 14 * (t.flex ?? 0);
  const thumb = fingerSegments(FLAT_THUMB.x, FLAT_THUMB.y, direction, FLAT_THUMB.lengths, THUMB_JOINTS, t.value, FLAT_THUMB.width);
  paintChain(ctx, colors, thumb, t.value, t.color);
  ctx.restore();
}

// ---------- 3D robot hand ----------
// All parts, including the finger segments, come from the stl/*.stl files of repo
// ansteuerung_hand (hand_modell.js, generated there with werkzeuge/modell/stl_zu_js.py).
// The firmware's collision table (roboter_hand/sperren.h) is computed from THIS model by
// ansteuerung_hand/werkzeuge/modell/sperren_zu_h.js: after changing ROBOT_HAND, STOP_GAP,
// NEIGHBOUR_GAP or hits()/touches(), run it there.
// Sizes in cm, axes as in the hand shell (5_Hand_Unterseite):
// x = towards the fingers, y = across (thumb at -y), z = towards the lid (back of the hand).
const ROBOT_HAND = {
  // joint = position of the first joint hole (x, y, z), measured on the shell:
  // each finger holder stands on the floor of the shell (z = 0.2) between two
  // pins that grip its side notches. The outer pins sit further back and are
  // turned by 4.85°, so index and pinky start 0.5 cm deeper in the hand and
  // point slightly outwards (turn = rotation about z in degrees). Middle and
  // ring point straight ahead.
  fingers: [
    // segments from the hand to the tip (part names in hand_modell.js)
    // limits = max. bend per joint (degrees), estimated from the parts and photos of the printed hand
    { id: "index",  joint: [-0.672, -3.393, 1.3], turn: -4.85, segments: ["glied_ende", "glied_mitte_zeige", "glied_spitze"], limits: [85, 90, 70] },
    { id: "middle", joint: [-0.19, -1.1, 1.3],   segments: ["glied_ende", "glied_mitte", "glied_spitze"], limits: [85, 90, 70] },
    { id: "ring",   joint: [-0.19, 1.1, 1.3],    segments: ["glied_ende", "glied_mitte", "glied_spitze"], limits: [85, 90, 70] },
    { id: "pinky",  joint: [-0.672, 3.393, 1.3], turn: 4.85,   segments: ["glied_klein_ende", "glied_klein_mitte", "glied_spitze"], limits: [85, 90, 70] },
  ],
  // The thumb holder turns about an axis parallel to x (hinge on the shell).
  thumbAxis: [0, -1.15, 1.1], thumbOppDeg: 75,
  // Joint hole at the end of the thumb holder (holder coordinates), its axis
  // and the rough direction of the thumb
  thumbEnd: [-7.064, -5.277, -1.306], thumbJointAxis: [0.5, 0.5, 0.7071],
  thumbDirection: [0.69, -0.69, -0.24],
  thumbBendTarget: [0.67, 0.72, -0.22],  // where the thumb curls to (middle of the hand)
  // The thumb holder has inner joint lugs like a base segment, so a middle segment
  // (outer lugs) follows it; only that one fits holder and tip without overlapping.
  thumbSegments: ["glied_mitte_zeige", "glied_daumen_spitze"],
  thumbLimits: [60, 60],
};
const HAND3D_START = { x: -0.55, y: 0.45 };  // view angle (rad) at start and after double-click
const CONTACT_COLOR = "#e03131";  // collision display in the 3D model
const CONTACT_HOLD_MS = 400;      // the display stays this long after the last stop (no flicker)
const STOP_GAP = 0.08;     // cm gap at which a moving part stops in front of another
// Neighbouring fingers bend side by side and never meet: measured on the meshes,
// the closest they get is 0.107 cm (index and middle tips, both closed), the
// distance grid reads about 0.04 cm less. So they only stop each other on real
// contact (no stop gap), and their red dots only show within NEIGHBOUR_SHOW.
const NEIGHBOUR_GAP = 0;
const NEIGHBOUR_SHOW = 0.06;
const GIVE_PER_S = 2.5;    // how fast (share of the travel per second) a jammed part gives way
const CATCH_UP_PER_S = 2.5;    // after being held by an obstacle: top catch-up speed (share of the travel per second)
const CATCH_UP_RAMP_S = 0.8;   // soft start: speed rises along an S-curve to the top speed within this time
const CATCH_UP_BRAKE = 4;      // soft stop: deceleration before reaching the current value (share per second²)
const handOptions = { lid: true };            // shared by all views, toggled by the "Lid" button
const SHAPE_CELL = 0.1;    // cm, grid size of the collision shapes (see collisionShape)
const SHAPE_PAD = 0.7;     // cm of grid around each part: further away than this counts as "far"
const SHAPE_AIR = 0.04;    // cm: a point closer than this to a part counts as touching it
const COLLISION_SHAPES = {};  // part name -> collisionShape

// Collision shape of a segment, from its real mesh (not its bounding box: the
// segments are curved and fill only about half of their box, so boxes stopped
// parts with a visible air gap). A grid around the part stores for every cell
// how far it is from the material (0 inside), so "how close is this point to
// the part" is a lookup. Plus points spread evenly over the surface (by area,
// so flat faces get points too) that are tested against the other parts.
function collisionShape(geo) {
  const pos = geo.attributes.position.array, idx = geo.index.array, h = SHAPE_CELL;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const o = box.min.clone().subScalar(SHAPE_PAD);
  const size = box.getSize(new THREE.Vector3()).addScalar(2 * SHAPE_PAD);
  const nx = Math.ceil(size.x / h) + 1, ny = Math.ceil(size.y / h) + 1, nz = Math.ceil(size.z / h) + 1, nxy = nx * ny;

  // 1. Which cells are inside the part: a ray along z through every column
  // centre crosses the surface an even number of times; inside between pairs.
  // (Columns are nudged a little so no ray runs exactly through an edge.)
  const ex = 1.37e-5, ey = 2.11e-5, columns = Array.from({ length: nxy }, () => []);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;  // face parallel to z
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - o.x - ex) / h)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - o.x - ex) / h));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - o.y - ey) / h)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - o.y - ey) / h));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = o.x + i * h + ex, y = o.y + j * h + ey;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      columns[i + j * nx].push(l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2]);
    }
  }
  const BIG = 1e10, d = new Float64Array(nxy * nz).fill(BIG);
  columns.forEach((zs, col) => {
    zs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < zs.length; s += 2) {
      const k0 = Math.max(0, Math.ceil((zs[s] - o.z) / h)), k1 = Math.min(nz - 1, Math.floor((zs[s + 1] - o.z) / h));
      for (let k = k0; k <= k1; k++) d[col + k * nxy] = 0;
    }
  });

  // 2. Distance of every cell to the nearest inside cell (exact Euclidean
  // distance transform, one axis after the other, Felzenszwalb & Huttenlocher).
  const n = Math.max(nx, ny, nz), f = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), zb = new Float64Array(n + 1);
  const pass = (count, stride, starts) => {
    for (const start of starts) {
      for (let q = 0; q < count; q++) f[q] = d[start + q * stride];
      let k = 0; v[0] = 0; zb[0] = -Infinity; zb[1] = Infinity;
      for (let q = 1; q < count; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= zb[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; zb[k] = s; zb[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < count; q++) { while (zb[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]]; }
      for (let q = 0; q < count; q++) d[start + q * stride] = out[q];
    }
  };
  const starts = (aN, aS, bN, bS) => { const s = []; for (let a = 0; a < aN; a++) for (let b = 0; b < bN; b++) s.push(a * aS + b * bS); return s; };
  pass(nx, 1, starts(ny, nx, nz, nxy));
  pass(ny, nx, starts(nx, 1, nz, nxy));
  pass(nz, nxy, starts(nx, 1, ny, nx));
  const dist = Float32Array.from(d, q => Math.sqrt(q) * h);

  // 3. Surface points: evenly by area, plus some corners (vertices)
  const tris = idx.length / 3, area = new Float64Array(tris);
  let sum = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    A.fromArray(pos, idx[3 * t] * 3); B.fromArray(pos, idx[3 * t + 1] * 3); C.fromArray(pos, idx[3 * t + 2] * 3);
    sum += B.sub(A).cross(C.sub(A)).length() / 2;
    area[t] = sum;
  }
  // (x, y, z one after the other; about 0.3 cm apart, the vertices catch edges and corners)
  const N = 400, count = pos.length / 3, step = Math.max(1, Math.floor(count / 100)), pts = [];
  for (let s = 0; s < N; s++) {
    const target = (s + 0.5) / N * sum;
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (area[m] < target) lo = m + 1; else hi = m; }
    let u = (s * 0.6180339887) % 1, w = (s * 0.7548776662) % 1;
    if (u + w > 1) { u = 1 - u; w = 1 - w; }
    A.fromArray(pos, idx[3 * lo] * 3); B.fromArray(pos, idx[3 * lo + 1] * 3); C.fromArray(pos, idx[3 * lo + 2] * 3);
    pts.push(...A.multiplyScalar(1 - u - w).addScaledVector(B, u).addScaledVector(C, w).toArray());
  }
  for (let i = 0; i < count; i += step) pts.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);

  const c = box.getCenter(new THREE.Vector3());
  return { o, h, nx, ny, nz, dist, pts: Float32Array.from(pts), c, r: box.max.distanceTo(c) };
}

// Distance (cm) of the point x, y, z (in the part's coordinates) to the part,
// negative inside. Outside the grid (further than SHAPE_PAD): Infinity.
function shapeDistance(s, x, y, z) {
  const gx = (x - s.o.x) / s.h, gy = (y - s.o.y) / s.h, gz = (z - s.o.z) / s.h;
  if (!(gx >= 0 && gy >= 0 && gz >= 0 && gx < s.nx - 1 && gy < s.ny - 1 && gz < s.nz - 1)) return Infinity;
  const i = gx | 0, j = gy | 0, k = gz | 0, fx = gx - i, fy = gy - j, fz = gz - k;
  const D = s.dist, nx = s.nx, nxy = nx * s.ny, b = i + j * nx + k * nxy;
  // trilinear between the 8 cell centres around the point
  const a0 = D[b] + (D[b + 1] - D[b]) * fx, a1 = D[b + nx] + (D[b + nx + 1] - D[b + nx]) * fx;
  const b0 = D[b + nxy] + (D[b + nxy + 1] - D[b + nxy]) * fx, b1 = D[b + nxy + nx] + (D[b + nxy + nx + 1] - D[b + nxy + nx]) * fx;
  const c0 = a0 + (a1 - a0) * fy, c1 = b0 + (b1 - b0) * fy;
  // cell centres inside the part have distance 0; the surface lies about half a cell further out
  return c0 + (c1 - c0) * fz - s.h / 2;
}
// The first surface point of shape `from` that comes closer than gap to shape `to`.
// m = matrix from the coordinates of `from` to those of `to`. Returns the point's
// number (-1 = none) and puts it, in the coordinates of `to`, into out.
// closest = true: the point that comes closest (for placing the red dot on the
// real touching spot), otherwise the first one (enough for "do they touch").
function closePoint(from, m, to, gap, out, closest = false) {
  const e = m.elements, pts = from.pts, limit = gap + SHAPE_AIR;
  let best = -1, bestD = limit;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const d = shapeDistance(to, px, py, pz);
    if (d < bestD) {
      out?.set(px, py, pz);
      if (!closest) return i / 3;
      best = i / 3; bestD = d;
    }
  }
  return best;
}
const shapePoint = (s, n) => new THREE.Vector3().fromArray(s.pts, 3 * n);
// Can two placed parts ({shape, center}) be closer than gap at all? (quick test before the points)
const mayTouch = (a, b, gap) => a.center.distanceTo(b.center) < a.shape.r + b.shape.r + gap + SHAPE_AIR;

// interactive = the main view: exploded view, unlocking and dragging parts.
function createHand3d(interactive) {
  return {
    status: "waiting",  // "waiting" for three.js | "on" | "off" (no three.js / WebGL / model)
    interactive,
    explosion: 0, explosionTarget: 0, unlocked: false, parts: [],

    // Returns true if the 3D hand was drawn.
    draw(canvas2d, valueOf, colorOf) {
      if (this.status === "waiting") {
        if (!window.HAND_MODELL) this.status = "off";
        else if (!window.THREE) {
          if (window.noThree || performance.now() > 15000) this.status = "off";  // three.js never arrived
          return false;
        } else {
          try { this.build(canvas2d); this.status = "on"; } catch (e) { console.error(e); this.status = "off"; }
        }
      }
      if (this.status !== "on") return false;
      this.update(valueOf, colorOf);
      return true;
    },

    // One part from hand_modell.js as BufferGeometry (shared by equal parts)
    part(name) {
      this.geos ??= {};
      if (this.geos[name]) return this.geos[name];
      const T = THREE, t = HAND_MODELL[name];
      const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const p = new Int16Array(bytes(t.p)), n = new Int8Array(bytes(t.n));
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(Float32Array.from(p, v => v / 1000), 3));
      geo.setAttribute("normal", new T.BufferAttribute(Float32Array.from(n, v => v / 127), 3));
      geo.setIndex(new T.BufferAttribute(new Uint16Array(bytes(t.i)), 1));
      return (this.geos[name] = geo);
    },

    build(canvas2d) {
      const T = THREE;
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      const el = this.renderer.domElement;
      el.style.touchAction = "none";
      el.style.cursor = "grab";
      canvas2d.after(el);  // the page's CSS sizes it like the flat canvas
      canvas2d.style.display = "none";
      if (interactive) $("handKnoepfe").hidden = false;

      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(26, 1, 1, 400);
      this.scene.add(new T.HemisphereLight(0xffffff, 0x50505a, 0.6));
      const key = new T.DirectionalLight(0xffffff, 0.65);
      key.position.set(-10, 14, 20);
      this.scene.add(key);
      const back = new T.DirectionalLight(0xffffff, 0.25);
      back.position.set(12, -6, -10);
      this.scene.add(back);

      // turn (mouse) > pose (fingers up, back of the hand to the camera) > parts
      this.startPose = new T.Quaternion().setFromEuler(new T.Euler(HAND3D_START.x, HAND3D_START.y, 0));
      this.turnGroup = new T.Group();
      this.turnGroup.quaternion.copy(this.startPose);
      this.scene.add(this.turnGroup);
      const hand = new T.Group();
      hand.rotation.z = Math.PI / 2;
      this.turnGroup.add(hand);

      const material = () => new T.MeshStandardMaterial({ roughness: 0.75, metalness: 0, side: T.DoubleSide });
      this.mat = { print: material(), print2: material() };
      this.edges = new T.LineBasicMaterial({ transparent: true, opacity: 0.35 });
      const edgeGeos = new Map();  // equal parts (finger segments) share their edges
      const mesh = (geo, m) => {
        const g = new T.Group();
        g.add(new T.Mesh(geo, m));
        if (!edgeGeos.has(geo)) edgeGeos.set(geo, new T.EdgesGeometry(geo, 35));
        g.add(new T.LineSegments(edgeGeos.get(geo), this.edges));
        return g;
      };

      // Parts: pulled apart for the exploded view and, once unlocked, movable one
      // by one. away = direction at full explosion, in the parent's coordinates.
      const part = (parent, away) => {
        const g = new T.Group();
        g.userData.part = { away: new T.Vector3(...away), pull: new T.Vector3() };
        parent.add(g);
        this.parts.push(g);
        return g;
      };

      part(hand, [0, 0, 0]).add(mesh(this.part("schale"), this.mat.print));
      this.lidMesh = mesh(this.part("deckel"), this.mat.print);
      part(hand, [0, 0, 4.5]).add(this.lidMesh);

      // Finger: chain of the real segments. Each segment starts with its joint hole
      // at the origin and points along +x; the next one sits at distance l (hole
      // spacing). Bending = turning about y (positive = tip towards the palm, -z).
      // Every segment is its own part: they move apart in the exploded view and can
      // be dragged one by one when unlocked.
      const chain = (parent, names) => {
        const m = material(), segments = [], parts = [];
        let p = parent;
        names.forEach((name, i) => {
          const g = new T.Group();
          if (i > 0) g.position.x = HAND_MODELL[names[i - 1]].l;
          p.add(g);
          const pt = part(g, [1.3 * i, 0, 0]);
          pt.add(mesh(this.part(name), m));
          segments.push(g);
          parts.push(pt);
          p = g;
        });
        return { mat: m, segments, parts };
      };

      const holderGeo = this.part("fingerhalter");
      this.fingers = ROBOT_HAND.fingers.map(f => {
        const base = new T.Group();
        base.position.set(...f.joint);
        base.rotation.z = rad(f.turn ?? 0);
        hand.add(base);
        part(base, [2.5, 0, 0]).add(mesh(holderGeo, this.mat.print2));
        return { id: f.id, names: f.segments, limits: f.limits, ...chain(part(base, [3.5, 0, 0]), f.segments) };
      });

      // Thumb: the holder turns about its axis (opposition), the segments bend (flex)
      this.thumbHolder = new T.Group();
      this.thumbHolder.position.set(...ROBOT_HAND.thumbAxis);
      part(hand, [-1, -4, -2.5]).add(this.thumbHolder);
      this.thumbHolderMat = material();  // takes on the opposition colour (S0)
      this.thumbHolder.add(mesh(this.part("daumenhalter"), this.thumbHolderMat));
      // segment axis y = axis of the joint hole, x = thumb direction, palm (-z) towards the middle
      const dy = new T.Vector3(...ROBOT_HAND.thumbJointAxis).normalize();
      const dx = new T.Vector3(...ROBOT_HAND.thumbDirection).projectOnPlane(dy).normalize();
      const dz = new T.Vector3().crossVectors(dx, dy);
      if (dz.dot(new T.Vector3(...ROBOT_HAND.thumbBendTarget)) > 0) { dy.negate(); dz.negate(); }
      const thumbBase = new T.Group();
      thumbBase.position.set(...ROBOT_HAND.thumbEnd);
      thumbBase.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(dx, dy, dz));
      this.thumbHolder.add(thumbBase);
      this.thumb = chain(part(thumbBase, [3.5, 0, 0]), ROBOT_HAND.thumbSegments);
      this.hand = hand;
      // For the collision: every segment's real shape (collisionShape), computed
      // once per part and shared by all views (about 0.1 s each)
      const shapeOf = name => (COLLISION_SHAPES[name] ??= collisionShape(this.part(name)));
      this.fingers.forEach((f, i) => { f.shapes = ROBOT_HAND.fingers[i].segments.map(shapeOf); });
      this.thumb.shapes = ROBOT_HAND.thumbSegments.map(shapeOf);
      this.thumbE = 0;

      // Camera far enough away that the whole hand (straight and turned) fits
      const sphere = new T.Box3().setFromObject(this.turnGroup).getBoundingSphere(new T.Sphere());
      hand.position.sub(sphere.center);
      this.radius = sphere.radius;

      // Mouse / finger: move an unlocked part, otherwise turn the hand freely
      let last = null, dragged = null;
      const axisX = new T.Vector3(1, 0, 0), axisY = new T.Vector3(0, 1, 0), q = new T.Quaternion();
      const ray = new T.Raycaster(), plane = new T.Plane(), point = new T.Vector3();
      const aim = e => {
        const r = el.getBoundingClientRect();
        ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, this.camera);
      };
      const hitPart = e => {
        aim(e);
        const meshes = [];
        for (const b of this.parts) b.traverseVisible(o => { if (o.isMesh) meshes.push(o); });
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) return null;
        // the innermost part the hit mesh belongs to
        let o = hit.object;
        while (o && !o.userData.part) o = o.parent;
        return o && { part: o, point: hit.point };
      };
      el.addEventListener("pointerdown", e => {
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        const h = this.unlocked && hitPart(e);
        if (h) {
          // drag the part on a plane parallel to the screen through the hit point
          this.scene.updateMatrixWorld();
          plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new T.Vector3()), h.point);
          dragged = { part: h.part, start: h.point.clone(), pull: h.part.userData.part.pull.clone() };
        } else last = { x: e.clientX, y: e.clientY };
      });
      el.addEventListener("pointermove", e => {
        if (dragged) {
          aim(e);
          if (!ray.ray.intersectPlane(plane, point)) return;
          const parent = dragged.part.parent;
          const a = parent.worldToLocal(dragged.start.clone()), b = parent.worldToLocal(point.clone());
          dragged.part.userData.part.pull.copy(dragged.pull).add(b.sub(a));
          if (interactive) $("zusammen").hidden = false;
          return;
        }
        if (!last) {
          if (this.unlocked) el.style.cursor = hitPart(e) ? "move" : "grab";
          return;
        }
        const mx = e.clientX - last.x, my = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        const g = this.turnGroup.quaternion;
        g.premultiply(q.setFromAxisAngle(axisY, mx * 0.01));
        g.premultiply(q.setFromAxisAngle(axisX, my * 0.01));
      });
      const release = () => { last = dragged = null; el.style.cursor = "grab"; };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("dblclick", () => { this.turnGroup.quaternion.copy(this.startPose); });
    },

    // Puts all dragged parts back and closes the exploded view.
    reassemble() {
      for (const b of this.parts) b.userData.part.pull.set(0, 0, 0);
      this.explosionTarget = 0;
    },
    anyPulled() { return this.parts.some(b => b.userData.part.pull.lengthSq() > 0); },

    update(valueOf, colorOf) {
      const el = this.renderer.domElement;
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      // time since the last frame: how far a part may give way per frame
      const nowMs = performance.now(), dt = Math.min(0.05, Math.max(0.004, (nowMs - (this.lastFrame ?? nowMs)) / 1000));
      this.lastFrame = nowMs;
      this.give = GIVE_PER_S * dt;
      this.nowMs = nowMs;
      this.dtMs = dt * 1000;
      const dpr = window.devicePixelRatio || 1;
      if (this.size !== `${w}x${h}x${dpr}`) {
        this.size = `${w}x${h}x${dpr}`;
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.cameraFactor = null;
      }

      // ease the explosion in and out, put the parts in place
      this.explosion += (this.explosionTarget - this.explosion) * 0.12;
      if (Math.abs(this.explosionTarget - this.explosion) < 0.001) this.explosion = this.explosionTarget;
      for (const b of this.parts) {
        const { away, pull } = b.userData.part;
        b.position.copy(away).multiplyScalar(this.explosion).add(pull);
      }

      // distance so the sphere around the hand fits in height and width (further away when exploded)
      const factor = 0.8 * (1 + 0.45 * this.explosion);
      if (this.cameraFactor !== factor) {
        this.cameraFactor = factor;
        const half = rad(this.camera.fov / 2), halfW = Math.atan(Math.tan(half) * this.camera.aspect);
        const distance = this.radius * factor / Math.sin(Math.min(half, halfW));
        this.camera.position.set(0, 0, distance);
        this.camera.near = Math.max(0.5, distance - this.radius * 3);
        this.camera.far = distance + this.radius * 3;
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
      }

      const print = css("--druck"), print2 = css("--druck2"), off = css("--inaktiv");
      this.mat.print.color.set(print);
      this.mat.print2.color.set(print2);
      this.edges.color.set(mix(print, "#000000", 0.6));
      this.lidMesh.visible = handOptions.lid;

      // active fingers take on their channel colour as they bend; no data = grey; no colour = plain
      const paint = (c, v, color) => {
        c.mat.color.set(v === null ? mix(print, off, 0.4) : !color ? print : mix(print, color, 0.15 + 0.55 * v));
      };
      // Order: first the fingers (against the thumb where it was), then opposition
      // and flex of the thumb (against the fingers where they are now)
      const flex = valueOf("thumbFlex"), opp = valueOf("thumbOpp");
      for (const f of this.fingers) {
        const v = valueOf(f.id);
        paint(f, v, colorOf(f.id));
        this.bendFinger(f, v ?? 0);
      }
      this.turnThumb(opp ?? 0);
      // Opposition moves the thumb holder, flex the thumb segments
      const oppColor = colorOf("thumbOpp");
      this.thumbHolderMat.color.set(opp === null || !oppColor ? print2 : mix(print2, oppColor, 0.15 + 0.55 * opp));
      paint(this.thumb, flex, colorOf("thumbFlex"));
      this.bendThumb(flex ?? 0);
      if (!this.hideContacts) this.showContacts();
      // Camera calibration: the hand turns like the real one (smoothly) and is mirrored for the other hand
      if (this.orientation) this.turnGroup.quaternion.slerp(this.orientation, this.orientationEase ?? 0.35);
      this.hand.scale.z = this.mirrored ? -1 : 1;

      this.renderer.render(this.scene, this.camera);
    },

    // Collision between thumb and fingers (from the control panel, repo
    // ansteuerung_hand): like on the real hand, the thumb hits fingers and palm.
    // Every segment has its real shape (collisionShape); points on the thumb are
    // checked against the fingers and points on the fingers against the thumb.
    // The palm is a rounded box. Whoever moves gets
    // stopped by the other: a finger closing onto the thumb stops there, and the
    // thumb stops at a finger. When exploded or with moved parts, it computes as if
    // the hand were assembled (see assembledPlace), so parts still stop where they
    // would meet in the real hand.

    // Placement of a part in hand coordinates as if the hand were assembled: the
    // offsets of the parts (explosion, dragged by hand) are left out.
    assembledPlace(part) {
      const m = new THREE.Matrix4();
      for (let o = part; o && o !== this.hand; o = o.parent) {
        if (!o.userData.part) m.premultiply(o.matrix);
      }
      return m;
    },

    // Does the thumb in its current position hit the fingers in fingerList (and the
    // palm, if palm)? gap makes the shapes a bit fatter: stopping checks with the
    // gap, "already stuck" without. So a stopped part stays just in front of the
    // other and doesn't switch between "free" and "stuck" every frame (that jittered).
    // contact (if given) receives the touching spot: part and point on it, and the
    // same spot on the other part (missing for the palm).
    hits(fingerList, palm, gap = 0, contact = null) {
      if (this.noCollision) return false;
      const T = THREE, p = new T.Vector3(), q = new T.Vector3(), m = new T.Matrix4();
      this.hand.updateMatrixWorld(true);
      // the palm stays a rounded box (the shell is one big part)
      const f = (this.palmBox ??= { c: new T.Vector3(-5.45, 0, 1.1), h: new T.Vector3(4.15, 4.3, 0.95), r: 0.3 });
      const inPalm = pnt => {
        const x = Math.max(Math.abs(pnt.x - f.c.x) - (f.h.x - f.r), 0);
        const y = Math.max(Math.abs(pnt.y - f.c.y) - (f.h.y - f.r), 0);
        const z = Math.max(Math.abs(pnt.z - f.c.z) - (f.h.z - f.r), 0);
        return x * x + y * y + z * z < (f.r + gap) ** 2;
      };
      const fingers = [];
      for (const fi of fingerList) fi.parts.forEach((pt, i) => fingers.push(this.placed(pt, fi.shapes[i])));
      const hit = (pa, pnt, pb, pnt2) => {
        if (contact) Object.assign(contact, { part: pa, point: pnt, other: pb, point2: pnt2?.clone() });
        return true;
      };
      for (let k = 0; k < this.thumb.parts.length; k++) {
        const a = this.placed(this.thumb.parts[k], this.thumb.shapes[k]), pts = a.shape.pts;
        if (palm) for (let i = 0; i < pts.length; i += 3) {
          p.fromArray(pts, i).applyMatrix4(a.m);  // point of the thumb in hand coordinates
          if (inPalm(p)) return hit(a.part, shapePoint(a.shape, i / 3));
        }
        for (const g of fingers) {
          if (!mayTouch(a, g, gap)) continue;
          let n = closePoint(a.shape, m.multiplyMatrices(g.inv, a.m), g.shape, gap, q, !!contact);
          if (n >= 0) return hit(a.part, shapePoint(a.shape, n), g.part, q);
          n = closePoint(g.shape, m.multiplyMatrices(a.inv, g.m), a.shape, gap, q, !!contact);
          if (n >= 0) return hit(g.part, shapePoint(g.shape, n), a.part, q);
        }
      }
      return false;
    },

    // A part with its shape, placed as if the hand were assembled
    placed(part, shape) {
      const m = this.assembledPlace(part);
      return { part, shape, m, inv: m.clone().invert(), center: shape.c.clone().applyMatrix4(m) };
    },

    // Go from "from" towards "to" in steps and stop before the first collision
    // (so nothing jumps through another part)
    untilStop(from, to, set, hits) {
      const steps = Math.ceil((to - from) / 0.08);
      for (let n = 1; n <= steps; n++) {
        const e = Math.min(to, from + n * 0.08);
        set(e);
        if (!hits()) continue;
        let lo = from + (n - 1) * 0.08, hi = e;
        for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; set(m); if (hits()) hi = m; else lo = m; }
        set(lo);
        return lo;
      }
      return to;
    },

    // Do two chains of segments (thumb or finger) touch? Points of A are tested
    // in the segments of B and the other way round. contact as in hits().
    touches(A, B, gap = 0, contact = null) {
      if (this.noCollision) return false;
      const q = new THREE.Vector3(), m = new THREE.Matrix4();
      this.hand.updateMatrixWorld(true);
      const places = K => K.parts.map((pt, i) => this.placed(pt, K.shapes[i]));
      const as = places(A), bs = places(B);
      for (const [from, to] of [[as, bs], [bs, as]]) {
        for (const a of from) for (const b of to) {
          if (!mayTouch(a, b, gap)) continue;
          const n = closePoint(a.shape, m.multiplyMatrices(b.inv, a.m), b.shape, gap, q, !!contact);
          if (n < 0) continue;
          if (contact) Object.assign(contact, { part: a.part, point: shapePoint(a.shape, n), other: b.part, point2: q.clone() });
          return true;
        }
      }
      return false;
    },
    // neighbouring fingers (left and right) that can be in the way when closing
    neighbours(f) {
      const i = this.fingers.indexOf(f);
      return [this.fingers[i - 1], this.fingers[i + 1]].filter(Boolean);
    },

    // Collision display (as on the control panel): a part that is held by another
    // glows red and pulses, whatever its channel colour, and at every spot where
    // thumb and finger (or palm) touch sits a red dot: pulsing while something is
    // held, small and calm when the parts only touch.
    showContacts() {
      const T = THREE, now = performance.now();
      this.lastHeld ??= {};
      for (const key in this.catching ?? {}) if (this.catching[key].held) this.lastHeld[key] = now;
      for (const key in this.stops ?? {}) this.lastHeld[key] = now;
      const held = {};
      for (const key in this.lastHeld) if (now - this.lastHeld[key] < CONTACT_HOLD_MS) held[key] = true;
      const red = new T.Color(CONTACT_COLOR), pulse = 0.75 + 0.25 * Math.sin(now / 120), world = new T.Vector3();
      const glow = (mat, on) => {
        if (on) mat.color.lerp(red, 0.45 + 0.3 * pulse);
        mat.emissive.copy(red).multiplyScalar(on ? 0.25 * pulse : 0);
      };
      const thumbHeld = !!(held.thumbFlex || held.thumbOpp);
      for (const f of this.fingers) glow(f.mat, !!held[f.id]);
      glow(this.thumb.mat, !!held.thumbFlex);
      glow(this.thumbHolderMat, !!held.thumbOpp);

      if (!this.contactDots) {
        const geo = new T.SphereGeometry(0.4, 16, 12);
        // two dots per pair (thumb with each finger, thumb with palm, neighbouring
        // fingers): one on each of the two parts (on top of each other when assembled)
        this.contactDots = Array.from({ length: (2 * this.fingers.length) * 2 }, () => {
          const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: CONTACT_COLOR, transparent: true, depthTest: false }));
          m.renderOrder = 10;  // visible even when a part is in front
          m.visible = false;
          this.hand.add(m);
          return m;
        });
      }
      // one touching spot per finger (and the palm). Search distance: a held part
      // stops a little in front of the other (it stops with a gap), a part that
      // only touches lies right against it.
      const pairs = [...this.fingers.map(f => [[f], false, !!held[f.id]]), [[], true, false],
                     ...this.fingers.slice(1).map((f, i) => [[this.fingers[i], f], null, !!(held[f.id] || held[this.fingers[i].id])])];
      pairs.forEach(([list, palm, isHeld], i) => {
        const contact = {};
        let found;
        if (palm === null) {
          // neighbouring fingers lie close side by side (0.3 cm for middle and
          // ring): dots only while one is held and only where they really meet
          found = isHeld && this.touches(list[0], list[1], NEIGHBOUR_SHOW, contact);
        } else {
          isHeld ||= thumbHeld;
          const gap = STOP_GAP + (list.some(f => held[f.id]) ? 0.4 : thumbHeld ? 0.15 : 0.05);
          found = (this.thumbE ?? 0) > 0 && this.hits(list, palm, gap, contact);
        }
        [[contact.part, contact.point], [contact.other, contact.point2]].forEach(([part, local], j) => {
          const dot = this.contactDots[2 * i + j];
          dot.visible = !!(found && part);
          if (!dot.visible) return;
          part.updateMatrixWorld(true);
          dot.position.copy(this.hand.worldToLocal(part.localToWorld(world.copy(local))));
          dot.scale.setScalar(isHeld ? pulse : 0.6);
          dot.material.opacity = isHeld ? 0.55 + 0.35 * pulse : 0.6;
        });
      });
    },

    // Catching up after an obstacle: a part that was held does not jump to the
    // current value, and it does not replay the old course either (that ran into
    // the obstacle again and got stuck). It takes the shortest way to the current
    // value: it starts slowly, speeds up to CATCH_UP_PER_S and slows down again at the end.
    catchUpTarget(key, v, current) {
      const c = this.catching?.[key];
      if (!c) return v;
      const d = v - current, dt = this.dtMs / 1000;
      if (!c.held && Math.abs(d) < 0.005) { delete this.catching[key]; return v; }  // caught up
      if (c.held) { c.time = 0; return current + Math.sign(d) * Math.min(Math.abs(d), 0.004); }
      // S-curve start (smootherstep: no jerk at the beginning), soft stop at the end
      c.time += dt;
      const u = Math.min(1, c.time / CATCH_UP_RAMP_S), ramp = u * u * u * (u * (u * 6 - 15) + 10);
      const speed = Math.min(CATCH_UP_PER_S * ramp, Math.sqrt(2 * CATCH_UP_BRAKE * Math.abs(d)) + 0.02);
      return current + Math.sign(d) * Math.min(Math.abs(d), Math.max(speed * dt, 0.0003));
    },
    // Stops for the robot hand demo: which channel is held by another part right
    // now, up to where (value) and in which direction (+1 closing, -1 opening)?
    // The demo stops its simulated servo there, so servo and model don't fight.
    // A stop stays while the part would still hit something a bit further on.
    noteStop(key, now, goal, reached, set, hits) {
      this.stops ??= {};
      if (reached !== goal && Math.abs(reached - goal) > 0.001) {
        this.stops[key] = { value: reached, dir: Math.sign(goal - reached) };
      } else if (this.stops[key]) {
        const d = this.stops[key].dir;
        set(now + d * 0.03);
        if (hits()) this.stops[key].value = now;
        else delete this.stops[key];
        set(now);
      }
    },
    markHeld(key, held) {
      this.catching ??= {};
      if (held) this.catching[key] = { held: true, time: 0 };
      else if (this.catching[key]) this.catching[key].held = false;
    },

    bendFinger(f, v) {
      const set = e => f.segments.forEach((g, i) => { g.rotation.y = rad(f.limits[i] * e); });
      const before = f.e ?? 0;
      v = this.catchUpTarget(f.id, v, before);
      // Opening always works; closing stops at the thumb and at the neighbouring
      // fingers. If the finger is already inside the thumb (the thumb moved), the
      // thumb gives way, not the finger.
      const neighbours = this.neighbours(f);
      const hitsAny = (gap = 0) => ((this.thumbE ?? 0) > 0 && this.hits([f], false, gap)) ||
                                   neighbours.some(n => this.touches(f, n, Math.min(gap, NEIGHBOUR_GAP)));
      const withGap = () => hitsAny(STOP_GAP);
      if (v <= before) {
        f.e = v; set(v);
        this.markHeld(f.id, false);
        if (this.stops?.[f.id]) this.noteStop(f.id, v, v, v, set, withGap);
        return;
      }
      set(before);
      const jammed = hitsAny();
      f.e = jammed ? Math.min(v, before + this.give) : this.untilStop(before, v, set, withGap);
      this.noteStop(f.id, f.e, v, jammed ? v : f.e, set, withGap);
      this.markHeld(f.id, f.e < v - 0.001);
      set(f.e);
    },

    // Opposition: the thumb holder turns until the thumb hits a finger
    turnThumb(opp) {
      const set = o => { this.thumbHolder.rotation.x = rad(ROBOT_HAND.thumbOppDeg * o); };
      const before = this.thumbO ?? 0;
      opp = this.catchUpTarget("thumbOpp", opp, before);
      const withGap = () => this.hits(this.fingers, true, STOP_GAP);
      if ((this.thumbE ?? 0) <= 0 || opp === before) {
        this.thumbO = opp; set(opp);
        this.markHeld("thumbOpp", false);
        if (this.stops?.thumbOpp && (this.thumbE ?? 0) > 0) this.noteStop("thumbOpp", opp, opp, opp, set, withGap);
        else if (this.stops) delete this.stops.thumbOpp;
        return;
      }
      const dir = Math.sign(opp - before);
      set(before);
      if (this.hits(this.fingers, true)) {
        // already jammed: move on slowly, the flex gives way
        this.thumbO = before + dir * Math.min(Math.abs(opp - before), this.give);
        this.noteStop("thumbOpp", this.thumbO, opp, opp, set, withGap);
      } else {
        this.thumbO = before + dir * this.untilStop(0, Math.abs(opp - before), d => set(before + dir * d), withGap);
        this.noteStop("thumbOpp", this.thumbO, opp, this.thumbO, set, withGap);
      }
      this.markHeld("thumbOpp", Math.abs(this.thumbO - opp) > 0.001);
      set(this.thumbO);
    },

    bendThumb(flex) {
      const set = e => this.thumb.segments.forEach((g, i) => { g.rotation.y = rad(ROBOT_HAND.thumbLimits[i] * e); });
      flex = this.catchUpTarget("thumbFlex", flex, this.thumbE ?? 0);
      if (flex <= 0) {
        this.thumbE = flex; this.markHeld("thumbFlex", false);
        if (this.stops) delete this.stops.thumbFlex;
        return set(flex);
      }
      const hits = () => this.hits(this.fingers, true, STOP_GAP);
      // From the current position towards the target, stop at the first obstacle in
      // both directions (with a finger lying on the thumb it can't open either). If
      // already jammed, it gives way towards open.
      const now = this.thumbE ?? 0;
      set(now);
      let free;
      if (!this.hits(this.fingers, true)) {
        const dir = Math.sign(flex - now);
        free = dir ? now + dir * this.untilStop(0, Math.abs(flex - now), d => set(now + dir * d), hits) : now;
      } else {
        free = Math.max(0, now - this.give);  // jammed: open bit by bit instead of jumping
      }
      // smoothly behind when closing; when opening a bit faster, but also smooth
      // (the control panel opens at once: a thumb that a finger had held down then
      // snapped open by half its travel in one frame)
      this.thumbE = free > now ? now + Math.min((free - now) * 0.35, this.give)
                               : now - Math.min((now - free) * 0.35, 2 * this.give);
      this.markHeld("thumbFlex", Math.abs(free - flex) > 0.001);
      set(this.thumbE);
      this.noteStop("thumbFlex", this.thumbE, flex, free, set, hits);
    },
  };
}

// One hand view per canvas (main view and calibration pose).
const handViews = new Map();
const CALIBRATION_HANDS = ["kalHand", "kamHand", "kamGeist"];
function drawHand(canvas, valueOf, colorOf) {
  let view = handViews.get(canvas);
  if (!view) {
    view = createHand3d(canvas.id === "hand");
    // The hands in the calibration windows show poses: fingers pass through each
    // other there (no collision, no collision display), so every pose is shown fully.
    if (CALIBRATION_HANDS.includes(canvas.id)) Object.assign(view, { noCollision: true, hideContacts: true });
    handViews.set(canvas, view);
  }
  if (view.draw(canvas, valueOf, colorOf)) return;
  const { ctx, w, h } = prepare(canvas);
  drawFlatHand(ctx, w, h - 40, valueOf, colorOf);  // keep the caption line below the wrist free
}

// Main view: calibrated values; before calibration the raw reading, scaled roughly.
function liveValue(id, now) {
  if (isFresh(id, now)) return state.shown[id];
  const mv = liveMv(id, now);
  return mv === null ? null : clamp01(mv / 2500);
}

// Robot hand view: the servo positions (smoothly animated), grey without data.
const handValue = (id, now) => (posFresh(id, now) ? state.disp[id] : null);
