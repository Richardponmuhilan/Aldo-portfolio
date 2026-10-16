import * as THREE from 'three';

/* Amphibious water-sampling UAV — geometry rebuilt from the CAD views:
   boat hull (V-bottom, chine, turtle deck, planing step) + slender rising tail
   boom, cruciform tail, high straight wing with two underslung floats.
   Units: metres. +X forward, +Y up, +Z starboard. */

const tbl = (t, rows) => {
  if (t <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (t <= rows[i][0]) {
      const [a, va] = rows[i - 1], [b, vb] = rows[i];
      return va + (vb - va) * (t - a) / (b - a || 1e-9);
    }
  }
  return rows[rows.length - 1][1];
};

function loft(sections, { flip = false, split = null } = {}) {
  const M = sections[0].length, S = sections.length;
  const pos = new Float32Array(S * M * 3);
  let k = 0;
  for (const sec of sections) for (const p of sec) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
  const a1 = [], a2 = [];
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      const a = i * M + j, b = i * M + j2, c = (i + 1) * M + j2, d = (i + 1) * M + j;
      const tri = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
      (split && split(j) ? a1 : a2).push(...tri);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(split ? a1.concat(a2) : a2);
  if (split) { g.addGroup(0, a1.length, 0); g.addGroup(a1.length, a2.length, 1); }
  g.computeVertexNormals();
  return g;
}

/* ---------- hull ---------- */
const HULL_BOW = 0.95, HULL_LEN = 0.65;
const HB = [[0, .010], [.04, .048], [.10, .078], [.20, .107], [.35, .126], [.55, .130], [.75, .124], [.88, .100], [1, .062]];
const KEEL = [[0, -.024], [.04, -.078], [.10, -.122], [.20, -.163], [.35, -.184], [.55, -.190], [.6199, -.192], [.62, -.164], [.80, -.120], [.90, -.092], [1, -.062]];
const SHEER = [[0, .028], [.10, .006], [.25, -.006], [.55, -.010], [.80, -.004], [1, .000]];
const DECK = [[0, .046], [.10, .063], [.25, .075], [.55, .079], [.80, .068], [.90, .058], [1, .045]];
const DEAD = Math.tan(17 * Math.PI / 180);

function hullSection(s, shrink = 1) {
  const hb = tbl(s, HB) * shrink, yk = tbl(s, KEEL), ysh = tbl(s, SHEER), yd = tbl(s, DECK);
  const yc = yk + hb * DEAD;
  const half = [];
  for (let i = 0; i <= 5; i++) { const f = i / 5; half.push([hb * f, yk + (yc - yk) * f]); }       // V bottom
  for (let i = 1; i <= 4; i++) { const f = i / 4; half.push([hb * (1 - .03 * f), yc + (ysh - yc) * f]); } // topside
  for (let i = 1; i <= 8; i++) {                                                                    // turtle deck
    const t = (i / 8) * Math.PI / 2;
    half.push([hb * .97 * Math.pow(Math.cos(t), .78), ysh + (yd - ysh) * Math.sin(t)]);
  }
  const x = HULL_BOW - HULL_LEN * s;
  const pts = half.map(([z, y]) => [x, y, z]);
  for (let i = half.length - 2; i >= 1; i--) pts.push([x, half[i][1], -half[i][0]]);
  return pts;
}

/* ---------- airfoil ---------- */
function airfoil(m, p, t, n = 24) {
  const yt = x => 5 * t * (.2969 * Math.sqrt(x) - .1260 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4);
  const yc = x => m === 0 ? 0 : (x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * x - x * x));
  const dy = x => m === 0 ? 0 : (x < p ? 2 * m / (p * p) * (p - x) : 2 * m / ((1 - p) ** 2) * (p - x));
  const xs = []; for (let i = 0; i <= n; i++) xs.push(.5 * (1 - Math.cos(Math.PI * i / n)));
  const pts = [];
  for (let i = n; i >= 1; i--) { const x = xs[i], th = Math.atan(dy(x)), T = yt(x); pts.push([x + T * Math.sin(th), yc(x) - T * Math.cos(th)]); }
  pts.push([0, 0]);
  for (let i = 1; i <= n; i++) { const x = xs[i], th = Math.atan(dy(x)), T = yt(x); pts.push([x - T * Math.sin(th), yc(x) + T * Math.cos(th)]); }
  return pts;
}

const tipScale = (u, start) => u <= start ? 1 : Math.sqrt(Math.max(0, 1 - ((u - start) / (1 - start)) ** 2));

// surface swept along Z (wing, stabiliser)
function panelZ(prof, { half, y0, xLE, chord, tipFrom = .955, dihedral = 0 }) {
  const fs = [];
  const base = [0, .35, .62, .8, .9, .955];
  const tip = [.968, .979, .988, .994, .998, 1];
  for (const f of [...base, ...tip]) fs.push(f);
  const list = fs.slice().reverse().map(f => -f).concat(fs.slice(1));
  return list.map(f => {
    const u = Math.abs(f), r = tipScale(u, tipFrom), z = f * half;
    const c = chord(u) * r;
    const yy = y0 + Math.abs(z) * Math.tan(dihedral);
    return prof.map(([xa, ya]) => [xLE(u) - c * xa, yy + c * ya, z]);
  });
}

// surface swept along Y (fin)
function panelY(prof, { y0, y1, xLE, chord, tipFrom = .93 }) {
  const fs = [0, .18, .4, .6, .78, .9, .95, .975, .99, 1];
  return fs.map(f => {
    const r = tipScale(f, tipFrom), c = chord(f) * r, y = y0 + (y1 - y0) * f;
    return prof.map(([xa, ya]) => [xLE(f) - c * xa, y, c * ya]);
  });
}

/* ---------- float pod ---------- */
function pod(zc, { x0, len, hb, depth, top }) {
  const fs = [0, .04, .1, .2, .35, .5, .65, .8, .9, .96, 1];
  const dead = Math.tan(22 * Math.PI / 180);
  return fs.map(f => {
    const close = f === 1 ? .04 : 1;
    const shp = Math.pow(Math.sin(Math.PI * Math.min(1, .12 + f * .88)), .55);
    const w = hb * shp * (f > .8 ? 1 - (f - .8) * 1.9 : 1) * close;
    const yk = -depth * (f < .12 ? f / .12 : 1) * (f > .8 ? 1 - (f - .8) * 2.4 : 1);
    const yc = yk + w * dead, yt2 = top;
    const half = [];
    for (let i = 0; i <= 3; i++) { const t = i / 3; half.push([w * t, yk + (yc - yk) * t]); }
    for (let i = 1; i <= 6; i++) { const t = (i / 6) * Math.PI / 2; half.push([w * Math.cos(t), yc + (yt2 - yc) * Math.sin(t)]); }
    const x = x0 - len * f;
    const pts = half.map(([z, y]) => [x, y, zc + z]);
    for (let i = half.length - 2; i >= 1; i--) pts.push([x, half[i][1], zc - half[i][0]]);
    return pts;
  });
}

export function buildAmphibiousUAV() {
  const body = new THREE.MeshStandardMaterial({ name: 'composite', color: 0xdfe3e6, roughness: .46, metalness: .06 });
  const dark = new THREE.MeshStandardMaterial({ name: 'hull-bottom', color: 0x2b3137, roughness: .38, metalness: .12 });
  const graph = new THREE.MeshStandardMaterial({ name: 'graphite', color: 0x3a4148, roughness: .5, metalness: .1 });
  const accent = new THREE.MeshStandardMaterial({ name: 'accent', color: 0xff6a2b, roughness: .4, metalness: .05 });

  const g = new THREE.Group(); g.name = 'AmphibiousUAV';

  // hull
  const ss = [0, .015, .04, .075, .12, .18, .25, .33, .43, .55, .6199, .62, .70, .80, .90, 1];
  const hullSecs = [hullSection(0, .06), ...ss.map(s => hullSection(s))];
  const M = hullSecs[1].length;
  const hull = new THREE.Mesh(loft(hullSecs, { split: j => j < 5 || j >= M - 5 }), [dark, body]);
  hull.name = 'hull'; hull.castShadow = hull.receiveShadow = true; g.add(hull);

  // tail boom
  const bx = [.42, .34, .24, .12, 0, -.15, -.32, -.5, -.66, -.78, -.84];
  const boomSecs = bx.map((x, i) => {
    const r = tbl(x, [[-.84, .012], [-.66, .022], [-.32, .030], [0, .042], [.24, .056], [.42, .072]]);
    const cy = tbl(x, [[-.84, .088], [-.5, .062], [0, .022], [.42, -.008]]);
    const rr = i === bx.length - 1 ? r * .25 : r;
    const pts = [];
    for (let j = 0; j < 22; j++) { const t = j / 22 * Math.PI * 2; pts.push([x, cy - rr * Math.cos(t), rr * Math.sin(t)]); }
    return pts;
  });
  const boom = new THREE.Mesh(loft(boomSecs), body);
  boom.name = 'tail-boom'; boom.castShadow = true; g.add(boom);

  // wing — E421-like high-lift section, straight, constant chord
  const wingProf = airfoil(.048, .42, .112);
  const wing = new THREE.Mesh(loft(panelZ(wingProf, {
    half: 1.25, y0: .042, xLE: () => .345, chord: () => .28
  })), body);
  wing.name = 'wing'; wing.castShadow = wing.receiveShadow = true; g.add(wing);

  // stabiliser + fin (cruciform)
  const tailProf = airfoil(0, .3, .09);
  const stab = new THREE.Mesh(loft(panelZ(tailProf, {
    half: .33, y0: .186, xLE: u => -.605 - .030 * u, chord: u => .19 - .045 * u, tipFrom: .9
  })), body);
  stab.name = 'stabiliser'; stab.castShadow = true; g.add(stab);

  const fin = new THREE.Mesh(loft(panelY(tailProf, {
    y0: .045, y1: .305, xLE: f => -.598 - .075 * f, chord: f => .215 - .09 * f
  }), { flip: true }), body);
  fin.name = 'fin'; fin.castShadow = true; g.add(fin);

  const finCap = new THREE.Mesh(loft(panelY(tailProf, {
    y0: .272, y1: .309, xLE: f => -.664 - .012 * f, chord: f => .135 - .014 * f, tipFrom: .6
  }), { flip: true }), accent);
  finCap.name = 'fin-cap'; g.add(finCap);

  // wingtip floats + pylons
  for (const sgn of [-1, 1]) {
    const f = new THREE.Mesh(loft(pod(sgn * .98, { x0: .355, len: .30, hb: .042, depth: .066, top: .012 })), graph);
    f.name = 'float' + (sgn > 0 ? '-stbd' : '-port'); f.castShadow = true; g.add(f);
    const py = new THREE.Mesh(new THREE.BoxGeometry(.10, .058, .020), graph);
    py.position.set(.25, .012, sgn * .98); py.name = 'float-pylon' + (sgn > 0 ? '-stbd' : '-port'); py.castShadow = true; g.add(py);
  }

  // sampling probe under the hull, aft of the step
  const probe = new THREE.Mesh(new THREE.CylinderGeometry(.012, .010, .075, 16), accent);
  probe.position.set(.40, -.255, 0);
  probe.name = 'sampling-probe'; probe.castShadow = true; g.add(probe);
  const strut = new THREE.Mesh(new THREE.BoxGeometry(.020, .12, .013), graph);
  strut.position.set(.40, -.175, 0); strut.name = 'probe-strut'; strut.castShadow = true; g.add(strut);

  g.rotation.y = Math.PI; // nose toward -X screen-left default
  return g;
}
