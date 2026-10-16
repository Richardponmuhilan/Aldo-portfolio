import * as THREE from 'three';

/* Canard-pusher MALE UAV (Archer-class layout): white fuselage + canard,
   swept orange main wing with white inboard strakes, tip winglets, pusher prop.
   Units: metres. +X forward, +Y up, +Z starboard. */

const tbl = (t, rows) => {
  if (t >= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) if (t >= rows[i][0]) {
    const [a, va] = rows[i - 1], [b, vb] = rows[i];
    return va + (vb - va) * (t - a) / (b - a || 1e-9);
  }
  return rows[rows.length - 1][1];
};

function loft(sections) {
  const M = sections[0].length, S = sections.length, pos = new Float32Array(S * M * 3);
  let k = 0;
  for (const sec of sections) for (const p of sec) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
  const idx = [];
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < M; j++) {
    const j2 = (j + 1) % M, a = i * M + j, b = i * M + j2, c = (i + 1) * M + j2, d = (i + 1) * M + j;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function airfoil(t, camber = 0, N = 28) {
  const yt = u => 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  const yc = u => camber ? (u < .4 ? camber / .16 * (.8 * u - u * u) : camber / .36 * (.2 + .8 * u - u * u)) : 0;
  const up = [], lo = [];
  for (let i = 0; i <= N; i++) { const u = (1 - Math.cos(Math.PI * i / N)) / 2; up.push([u, yc(u) + yt(u)]); lo.push([u, yc(u) - yt(u)]); }
  return up.reverse().concat(lo.slice(1, -1));
}

/* stations: {x (LE), y, z, c, t}; vertical=true puts thickness along z */
function surface(stations, { camber = 0, vertical = false } = {}) {
  const secs = stations.map(s => airfoil(s.t, camber).map(([u, v]) =>
    vertical ? [s.x - u * s.c, s.y, s.z + v * s.c] : [s.x - u * s.c, s.y + v * s.c, s.z]));
  return loft(secs);
}

const mat = (color, rough = .42, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide });
const WHITE = mat(0xe9e8e4, .5), ORANGE = mat(0xee4a1c, .45), GREY = mat(0x8c9196, .5, .3),
      DARK = mat(0x1a1c1f, .35, .4), SPAR = mat(0xb9bdc2, .55, .2), GLASS = mat(0x0c1218, .08, .6), TYRE = mat(0x151515, .8);

function mesh(g, m, name) { const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = o.receiveShadow = true; return o; }
function both(g, m, name) { const a = mesh(g, m, name + '_R'); const b = mesh(g, m, name + '_L'); b.scale.z = -1; return [a, b]; }

export function buildMaleUAV() {
  const G = new THREE.Group(); G.name = 'MALE_UAV';
  const parts = {};
  const part = (key, label, off, anchor, ...objs) => {
    const g = new THREE.Group(); g.name = key; objs.flat().forEach(o => g.add(o)); G.add(g);
    parts[key] = { obj: g, label, off: new THREE.Vector3(...off), anchor: anchor && new THREE.Vector3(...anchor) };
    return g;
  };

  /* fuselage */
  const RZ = [[2.95, 0], [2.88, .13], [2.7, .26], [2.3, .37], [1.6, .43], [.6, .45], [-.4, .43], [-1.4, .36], [-2.3, .25], [-2.8, .17], [-3.0, .12]];
  const RYT = [[2.95, 0], [2.88, .13], [2.7, .27], [2.3, .40], [1.6, .47], [.6, .52], [-.4, .54], [-1.4, .44], [-2.3, .28], [-2.8, .18], [-3.0, .12]];
  const RYB = [[2.95, 0], [2.88, .12], [2.7, .24], [2.3, .34], [1.6, .40], [.6, .42], [-.4, .38], [-1.4, .30], [-2.3, .22], [-2.8, .15], [-3.0, .11]];
  const YC = [[2.95, -.06], [2.3, -.02], [0, 0], [-3.0, .08]];
  const CUT = -1.9, secs = [], rear = [];
  const xs = [];
  for (let i = 0; i <= 56; i++) xs.push(2.95 - (2.95 - CUT) * i / 56);
  for (let i = 0; i <= 14; i++) xs.push(CUT - (CUT + 3.0) * i / 14);
  xs.forEach((x, i) => {
    const rz = tbl(x, RZ), rt = tbl(x, RYT), rb = tbl(x, RYB), yc = tbl(x, YC), ring = [];
    for (let j = 0; j < 40; j++) {
      const a = j / 40 * Math.PI * 2, sn = Math.sin(a), c = Math.cos(a);
      const e = .82, sz = Math.sign(c) * Math.abs(c) ** e, sy = Math.sign(sn) * Math.abs(sn) ** e;
      ring.push([x, yc + sy * (sn > 0 ? rt : rb), sz * rz]);
    }
    if (i <= 56) secs.push(ring);
    if (i >= 57 || i === 56) rear.push(ring.map(p => [p[0] - (i === 56 ? .006 : 0), p[1], p[2]]));
  });
  const strut = (x, y0, y1, z, r = .025) => { const g = new THREE.CylinderGeometry(r, r, y0 - y1, 12); g.translate(x, (y0 + y1) / 2, z); return g; };
  const wheel = (x, y, z, r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 28); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
  const mount = mesh(new THREE.CylinderGeometry(.09, .11, .08, 28), GREY, 'EOIR_Mount'); mount.position.set(1.95, -.40, 0);
  const ball = mesh(new THREE.SphereGeometry(.13, 40, 28), DARK, 'EOIR_Ball'); ball.position.set(1.95, -.52, 0);
  const lens = mesh(new THREE.CircleGeometry(.055, 28), GLASS, 'EOIR_Lens'); lens.position.set(2.07, -.54, 0); lens.rotation.y = Math.PI / 2;
  const leg = new THREE.BoxGeometry(.14, .05, .9); leg.rotateX(-.55); leg.translate(-.9, -.55, .55);
  part('fuselage', 'Fuselage', [0, 0, 0], [2.3, .1, .38],
    mesh(loft(secs), WHITE, 'Fuselage'), mount, ball, lens,
    mesh(strut(2.35, -.3, -.95, 0), GREY, 'NoseGear_Strut'), mesh(wheel(2.35, -.98, 0, .1, .07), TYRE, 'NoseGear_Wheel'),
    both(leg, GREY, 'MainGear_Leg'), both(wheel(-.9, -.93, .93, .15, .09), TYRE, 'MainGear_Wheel'));

  /* canard */
  const can = [{ x: 2.12, y: .02, z: 0, c: .38, t: .12 }, { x: 2.12, y: .02, z: 1.55, c: .36, t: .12 }, { x: 2.10, y: .02, z: 1.62, c: .30, t: .02 }];
  part('canard', 'Canard', [.8, .35, 0], [1.95, .05, 1.45], both(surface(can, { camber: .02 }), WHITE, 'Canard'));

  /* wing strake (fuel tanks) */
  const strake = [{ x: .15, y: -.14, z: 0, c: 2.9, t: .09 }, { x: -.25, y: -.14, z: .45, c: 2.5, t: .10 }, { x: -1.05, y: -.12, z: 1.25, c: 1.55, t: .12 }];
  part('strake', 'Wing Strake (Fuel Tanks)', [0, -.35, 0], [-.8, -.1, 1.0], both(surface(strake, { camber: .02 }), WHITE, 'Wing_Strake'));

  /* centre-section spar box */
  const spar = new THREE.BoxGeometry(.34, .14, 2.9); spar.translate(-1.35, -.1, 0);
  part('spar', 'Centersection SparBox', [0, .7, 0], [-1.35, -.03, 1.2], mesh(spar, SPAR, 'Spar_Box'));

  /* engine cowling */
  const pg = new THREE.Group(); pg.name = 'Propeller'; pg.position.set(-3.02, .08, 0);
  const spin = mesh(new THREE.ConeGeometry(.12, .32, 32), WHITE, 'Spinner'); spin.rotation.z = Math.PI / 2; spin.position.x = -.16; pg.add(spin);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group(); b.rotation.x = i * Math.PI * 2 / 3;
    const bl = mesh(new THREE.BoxGeometry(.035, .82, .13), DARK, 'Blade_' + (i + 1)); bl.position.set(-.08, .47, 0); bl.rotation.y = .35; b.add(bl); pg.add(b);
  }
  part('cowling', 'Engine cowling', [-1.1, .35, 0], [-2.4, .3, 0], mesh(loft(rear), WHITE, 'Engine_Cowling'), pg);
  G.userData.prop = pg;

  /* outer wings + ailerons */
  const TIP = 5.6, outer = [], ail = [];
  const wst = f => ({ x: -1.05 - 1.45 * f, y: -.12 + .22 * f, z: 1.25 + (TIP - 1.25) * f, c: 1.55 - .95 * f, t: .12 - .02 * f });
  for (let i = 0; i <= 10; i++) outer.push(wst(i / 10));
  for (let i = 0; i <= 6; i++) { const w = wst(.45 + .45 * i / 6); ail.push({ x: w.x - .74 * w.c, y: w.y + .004, z: w.z, c: .27 * w.c, t: .06 }); }
  const [wR, wL] = both(surface(outer, { camber: .025 }), ORANGE, 'Wing_Outer');
  const [aR, aL] = both(surface(ail), WHITE, 'Aileron');
  const pod = new THREE.CapsuleGeometry(.1, 1.0, 10, 24); pod.rotateZ(Math.PI / 2); pod.translate(-1.35, -.34, 2.3);
  const pyl = new THREE.BoxGeometry(.5, .16, .03); pyl.translate(-1.35, -.23, 2.3);
  const [pR, pL] = both(pod, WHITE, 'Pod'), [yR, yL] = both(pyl, GREY, 'Pylon');
  part('wingR', 'Wing', [0, .2, .9], [-1.7, .06, 3.0], wR, pR, yR);
  part('wingL', null, [0, .2, -.9], null, wL, pL, yL);
  part('aileronR', 'Aileron', [-.3, .35, .9], [-2.45, .04, 4.2], aR);
  part('aileronL', null, [-.3, .35, -.9], null, aL);

  /* winglets + rudders */
  const wl = [], rud = [];
  const lst = f => ({ x: -2.45 - .55 * f, y: -.08 + 1.25 * f, z: TIP + .02 + .06 * f, c: .78 - .44 * f, t: .09 });
  for (let i = 0; i <= 8; i++) wl.push(lst(i / 8));
  wl.push({ x: -3.0, y: 1.18, z: TIP + .08, c: .3, t: .01 });
  for (let i = 0; i <= 5; i++) { const w = lst(.2 + .6 * i / 5); rud.push({ x: w.x - .68 * w.c, y: w.y, z: w.z + .004, c: .33 * w.c, t: .06 }); }
  const [lR, lL] = both(surface(wl, { vertical: true }), ORANGE, 'Winglet');
  const [rR, rL] = both(surface(rud, { vertical: true }), WHITE, 'Rudder');
  part('wingletR', 'Winglet', [0, .6, 1.5], [-2.75, .5, TIP + .1], lR);
  part('wingletL', null, [0, .6, -1.5], null, lL);
  part('rudderR', 'Rudder', [-.3, .75, 1.5], [-3.1, .75, TIP + .1], rR);
  part('rudderL', null, [-.3, .75, -1.5], null, rL);

  G.userData.parts = parts;
  return G;
}
