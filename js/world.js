// three.js neighborhood: city grid, entity meshes, relationship visuals, effects.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CUISINES } from './model.js';

export const GRID = 24;
export const OFFSET = 12;
export const ROADS = [-60, -36, -12, 12, 36, 60];
const ROAD_W = 6;
const UE_GREEN = 0x06c167;

export const snapRoad = (v) => Math.round((v - OFFSET) / GRID) * GRID + OFFSET;
const isRoad = (v) => Math.abs(v - snapRoad(v)) < 0.05 && Math.abs(v) <= 60.05;
const V = (x, z) => new THREE.Vector3(x, 0, z);

// Shortest Manhattan route along the road network between two road points.
export function route(a, b) {
  const out = [];
  const aH = isRoad(a.z), aV = isRoad(a.x), bH = isRoad(b.z), bV = isRoad(b.x);
  if (aH && bH) {
    if (Math.abs(a.z - b.z) < 0.05) out.push([b.clone()]);
    for (const X of new Set([snapRoad(a.x), snapRoad(b.x)])) out.push([V(X, a.z), V(X, b.z), b.clone()]);
  }
  if (aH && bV) out.push([V(b.x, a.z), b.clone()]);
  if (aV && bH) out.push([V(a.x, b.z), b.clone()]);
  if (aV && bV) {
    if (Math.abs(a.x - b.x) < 0.05) out.push([b.clone()]);
    for (const Z of new Set([snapRoad(a.z), snapRoad(b.z)])) out.push([V(a.x, Z), V(b.x, Z), b.clone()]);
  }
  if (!out.length) out.push([b.clone()]);
  let best = null, bestLen = Infinity;
  for (const pts of out) {
    const clean = [];
    let prev = a;
    for (const p of pts) if (p.distanceTo(prev) > 0.01) { clean.push(p); prev = p; }
    const len = pathLength(a, clean);
    if (len < bestLen) { bestLen = len; best = clean; }
  }
  return best;
}

export function pathLength(from, pts) {
  let len = 0, prev = from;
  for (const p of pts) { len += prev.distanceTo(p); prev = p; }
  return len;
}

// Building slots: ring 1 (around HQ) for restaurants, ring 2 (outer) for homes.
export function makeSlots() {
  const ring1 = [], ring2 = [];
  const centers = [-48, -24, 0, 24, 48];
  for (const cz of centers) for (const cx of centers) {
    if (cx === 0 && cz === 0) continue;
    const ring = Math.max(Math.abs(cx), Math.abs(cz)) / 24;
    for (const ox of [-4.6, 4.6]) {
      const slot = { x: cx + ox, z: cz + 1.5, door: V(cx + ox, cz + 12), used: false };
      (ring === 1 ? ring1 : ring2).push(slot);
    }
  }
  // Interleave so early entities spread around the ring instead of clustering.
  const spread = (arr) => arr.map((s, i) => ({ s, k: (i % 2) * 100 + Math.atan2(s.z, s.x) })).sort((a, b) => a.k - b.k).map((o) => o.s);
  return { ring1: spread(ring1), ring2: spread(ring2) };
}

export const HQ_DOOR = V(0, 12);
export const IDLE_SPOTS = [V(-7, 12), V(7, 12), V(-12, 4), V(12, 4), V(-12, -5), V(12, -5), V(-6, -12), V(6, -12)];

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function textTexture(text, { bg = '#000', fg = '#fff', w = 512, h = 128, font = 'bold 64px sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabel(html, cls = 'label') {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html;
  return new CSS2DObject(div);
}

export class World {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfe8f3);
    this.scene.fog = new THREE.Fog(0xcfe8f3, 180, 380);

    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 1000);
    this.homeView = { pos: new THREE.Vector3(62, 92, 118), target: new THREE.Vector3(0, 0, 4) };
    this.camera.position.copy(this.homeView.pos);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(innerWidth, innerHeight);
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.homeView.target);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 280;

    this.entities = new Map();   // "kind:id" -> { group, label, kind, id }
    this.arcs = new Map();       // restaurantId -> { mesh, label, dots, curve }
    this.drives = new Map();     // partnerId -> { line, label, cone }
    this.routes = new Map();     // orderId -> mesh
    this.effects = [];
    this.relGroup = new THREE.Group();
    this.scene.add(this.relGroup);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();

    this.addLights();
    this.buildCity();
    this.buildHQ();

    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.25, 48),
      new THREE.MeshBasicMaterial({ color: UE_GREEN, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.selected = null;

    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.labelRenderer.setSize(innerWidth, innerHeight);
  }

  resetView() {
    this.camera.position.copy(this.homeView.pos);
    this.controls.target.copy(this.homeView.target);
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7a9a6a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff3dd, 1.9);
    sun.position.set(60, 110, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -90; s.right = 90; s.top = 90; s.bottom = -90; s.near = 10; s.far = 300;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  buildCity() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat(0x9bc58a));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const asphalt = mat(0x3c4047, { roughness: 0.95 });
    for (const r of ROADS) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(126, ROAD_W), asphalt);
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.03, r); h.receiveShadow = true;
      const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 126), asphalt);
      v.rotation.x = -Math.PI / 2; v.position.set(r, 0.035, 0); v.receiveShadow = true;
      this.scene.add(h, v);
    }

    // Lane dashes
    const dashGeo = new THREE.BoxGeometry(1.6, 0.02, 0.22);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf1e3a0 });
    const dashes = [];
    for (const r of ROADS) for (let t = -60; t <= 60; t += 3.2) {
      if (ROADS.some((q) => Math.abs(q - t) < 4)) continue;
      dashes.push([t, r, 0], [r, t, Math.PI / 2]);
    }
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    dashes.forEach(([x, z, rot], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m4.compose(new THREE.Vector3(x, 0.06, z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
    });
    this.scene.add(inst);

    // Blocks: sidewalks, lawns, trees
    const walk = mat(0xdcd6c8), lawn = mat(0xa8d08d), plaza = mat(0xe9e4d8);
    const centers = [-48, -24, 0, 24, 48];
    for (const cz of centers) for (const cx of centers) {
      const hq = cx === 0 && cz === 0;
      const s = box(18, 0.3, 18, walk, cx, 0.15, cz);
      s.castShadow = false;
      this.scene.add(s);
      const inner = box(16, 0.06, 16, hq ? plaza : lawn, cx, 0.32, cz);
      inner.castShadow = false;
      this.scene.add(inner);
      if (!hq) for (const tx of [-6.5, 0, 6.5]) this.addTree(cx + tx + (Math.random() - 0.5), cz - 6.8, 0.8 + Math.random() * 0.4);
    }
    // Countryside trees outside the grid
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, d = 72 + Math.random() * 70;
      this.addTree(Math.cos(a) * d, Math.sin(a) * d, 1 + Math.random() * 0.9);
    }
  }

  addTree(x, z, s) {
    const g = new THREE.Group();
    g.add(cyl(0.25, 0.35, 2, mat(0x7a5537), 0, 1, 0, 6));
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), mat([0x5c9e4c, 0x4f8f45, 0x6aab52][Math.floor(Math.random() * 3)], { flatShading: true }));
    leaf.position.y = 3; leaf.castShadow = true;
    g.add(leaf);
    g.position.set(x, 0.3, z);
    g.scale.setScalar(s);
    this.scene.add(g);
  }

  buildHQ() {
    const g = new THREE.Group();
    const glass = mat(0x1d2a30, { metalness: 0.6, roughness: 0.25 });
    g.add(box(12, 24, 10, glass, 0, 12.3, -1));
    const green = mat(UE_GREEN, { emissive: UE_GREEN, emissiveIntensity: 0.35 });
    for (const y of [6, 12, 18]) g.add(box(12.2, 0.35, 10.2, green, 0, y, -1));
    g.add(box(13, 0.8, 11, mat(0x111111), 0, 24.6, -1));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: textTexture('Uber Eats', { bg: '#000', fg: '#06C167', font: 'bold 88px sans-serif' }) }));
    sign.position.set(0, 21, 4.06);
    g.add(sign);
    g.add(box(6, 0.3, 3, green, 0, 3.4, 5.4));
    g.add(box(4, 3, 0.2, mat(0x88c9b0, { metalness: 0.4, roughness: 0.2 }), 0, 1.8, 4.1));
    this.hqRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.25, 8, 48), green);
    this.hqRing.rotation.x = Math.PI / 2;
    this.hqRing.position.set(0, 27, -1);
    g.add(this.hqRing);
    this.addEntity('hq', 'hq', g, '<b>UberEats</b><small>Platform HQ</small>', 30);
    this.hqTop = new THREE.Vector3(0, 27, -1);
  }

  addEntity(kind, id, group, html, labelY, cls = 'label') {
    const key = `${kind}:${id}`;
    this.removeEntity(kind, id);
    group.traverse((o) => { o.userData.pick = { kind, id }; });
    const label = makeLabel(html, `${cls} label-${kind}`);
    label.position.set(0, labelY, 0);
    group.add(label);
    this.scene.add(group);
    this.entities.set(key, { group, label, kind, id });
    return group;
  }

  removeEntity(kind, id) {
    const e = this.entities.get(`${kind}:${id}`);
    if (!e) return;
    e.group.remove(e.label);
    e.label.element.remove();
    this.scene.remove(e.group);
    this.entities.delete(`${kind}:${id}`);
  }

  setLabel(kind, id, html) {
    const e = this.entities.get(`${kind}:${id}`);
    if (e && e.label.element.innerHTML !== html) e.label.element.innerHTML = html;
  }

  // ---------- Restaurants ----------
  setRestaurant(r) {
    const c = CUISINES[r.cuisine];
    const accent = mat(new THREE.Color(c.color));
    const g = new THREE.Group();
    let h = 5;
    switch (r.storeType) {
      case 'Food Truck': {
        const t = new THREE.Group();
        t.add(box(5.5, 2.8, 2.6, accent, -0.6, 2.1, 0));
        t.add(box(1.9, 2.1, 2.5, mat(0xf8f9fa), 3.1, 1.75, 0));
        t.add(box(0.1, 0.9, 2.1, mat(0x9fd3e6, { metalness: 0.5, roughness: 0.2 }), 4.06, 2.3, 0));
        t.add(box(2.8, 1, 0.08, mat(0x222222), -0.8, 2.5, 1.32));
        const awn = box(3.2, 0.12, 1.2, mat(0xffffff), -0.8, 3.25, 1.8);
        awn.rotation.x = 0.25;
        t.add(awn);
        const wheelM = mat(0x222222);
        for (const [x, z] of [[-2.4, 1.3], [-2.4, -1.3], [2.8, 1.3], [2.8, -1.3]]) {
          const w = cyl(0.6, 0.6, 0.4, wheelM, x, 0.9, z, 14);
          w.rotation.x = Math.PI / 2;
          t.add(w);
        }
        t.position.z = 1.5;
        g.add(t);
        // little patio tables
        for (const x of [-2.2, 1.2]) {
          g.add(cyl(0.6, 0.6, 0.08, mat(0xffffff), x, 1.1, 5.2, 14));
          g.add(cyl(0.08, 0.08, 0.8, mat(0x666666), x, 0.7, 5.2, 6));
        }
        h = 4.5;
        break;
      }
      case 'Fine Dining': {
        g.add(box(7, 8, 7, mat(0x2b2d42), 0, 4.3, 0));
        g.add(box(7.3, 0.45, 7.3, mat(0xd4af37, { metalness: 0.7, roughness: 0.3 }), 0, 8.4, 0));
        const warm = mat(0xffd27a, { emissive: 0xffb84d, emissiveIntensity: 0.6 });
        for (const x of [-2.3, 0, 2.3]) for (const y of [2.3, 5.8]) g.add(box(1.2, 1.6, 0.1, warm, x, y, 3.52));
        g.add(box(3.2, 0.2, 2.2, accent, 0, 3.2, 4.6));
        for (const x of [-1.4, 1.4]) g.add(cyl(0.07, 0.07, 3, mat(0xd4af37), x, 1.7, 5.6, 6));
        h = 9.5;
        break;
      }
      case 'Fast Food': {
        g.add(box(7, 4, 7, mat(0xf1faee), 0, 2.3, 0));
        g.add(box(7.3, 1.1, 7.3, accent, 0, 4.8, 0));
        g.add(box(5.4, 2.4, 0.1, mat(0x9fd3e6, { metalness: 0.4, roughness: 0.2 }), 0, 1.8, 3.52));
        g.add(cyl(0.15, 0.15, 7, mat(0x888888), 3.1, 3.8, 4.4, 8));
        g.add(box(2.6, 1.6, 0.35, accent, 3.1, 7.6, 4.4));
        h = 8.8;
        break;
      }
      case 'Café': {
        g.add(box(6.5, 4.5, 6.5, mat(0xfaedcd), 0, 2.55, 0));
        g.add(box(6.8, 0.4, 6.8, mat(0x8d6e63), 0, 5, 0));
        for (let i = 0; i < 6; i++) {
          const s = box(1.08, 0.12, 1.7, i % 2 ? mat(0xffffff) : accent, -2.7 + i * 1.08, 3.3, 3.95);
          s.rotation.x = 0.35;
          g.add(s);
        }
        g.add(box(4.5, 1.8, 0.1, mat(0x9fd3e6, { metalness: 0.4, roughness: 0.2 }), 0, 1.8, 3.27));
        for (const x of [-2, 2]) {
          g.add(cyl(0.5, 0.5, 0.08, mat(0xffffff), x, 1.1, 5.6, 14));
          g.add(cyl(0.07, 0.07, 0.8, mat(0x666666), x, 0.7, 5.6, 6));
        }
        h = 6.5;
        break;
      }
      default: { // Ghost Kitchen
        g.add(box(7, 5, 7, mat(0x6c757d), 0, 2.8, 0));
        g.add(box(7.06, 0.45, 7.06, accent, 0, 4.6, 0));
        g.add(box(3, 2.6, 0.1, mat(0x454b52), 0, 1.6, 3.52));
        for (const x of [-2, 1.5]) g.add(cyl(0.45, 0.45, 1.4, mat(0xadb5bd, { metalness: 0.6 }), x, 6, -1, 10));
        h = 7.5;
      }
    }
    g.position.set(r.slot.x, 0.3, r.slot.z);
    r.top = new THREE.Vector3(r.slot.x, h + 0.3, r.slot.z);
    this.addEntity('restaurant', r.id, g, restaurantLabel(r), h + 2.2);
  }

  // ---------- Customers ----------
  setCustomer(c) {
    const g = new THREE.Group();
    const walls = [0xf4f1de, 0xe0fbfc, 0xfde2e4, 0xe2ece9, 0xfff1e6][c.id % 5];
    g.add(box(5.4, 3.6, 5.4, mat(walls), 0, 1.8, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.8, 4), mat(c.membership === 'Uber One' ? 0xf2c14e : 0xa4513a, { flatShading: true }));
    roof.position.y = 5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    g.add(box(1.1, 2, 0.1, mat(0x6d4c41), 0, 1, 2.72));
    const win = mat(0x9fd3e6, { metalness: 0.4, roughness: 0.2 });
    g.add(box(1, 1, 0.1, win, -1.7, 2.2, 2.72), box(1, 1, 0.1, win, 1.7, 2.2, 2.72));
    g.add(box(0.25, 1.1, 0.25, mat(0x495057), 2.2, 0.55, 5.2), box(0.6, 0.4, 0.8, mat(0x1d3557), 2.2, 1.2, 5.2)); // mailbox
    g.position.set(c.slot.x, 0.3, c.slot.z);
    c.top = new THREE.Vector3(c.slot.x, 6.6, c.slot.z);
    this.addEntity('customer', c.id, g, customerLabel(c), 7.6);
  }

  // ---------- Delivery partners ----------
  setPartner(p) {
    const g = new THREE.Group();
    const body = mat(new THREE.Color().setHSL((p.id * 0.17) % 1, 0.55, 0.5));
    const dark = mat(0x222222);
    const bag = mat(UE_GREEN);
    if (p.commute === 'Car') {
      g.add(box(2.2, 0.9, 4, body, 0, 0.85, 0));
      g.add(box(1.9, 0.75, 2.1, mat(0xbfe6f5, { metalness: 0.4, roughness: 0.2 }), 0, 1.65, -0.2));
      g.add(box(1.2, 0.5, 0.8, bag, 0, 2.25, -0.2));
      for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3], [-1.1, -1.3], [1.1, -1.3]]) {
        const w = cyl(0.45, 0.45, 0.35, dark, x, 0.45, z, 12);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    } else {
      for (const z of [0.9, -0.9]) {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 16), dark);
        w.rotation.y = Math.PI / 2; w.position.set(0, 0.6, z); w.castShadow = true;
        g.add(w);
      }
      g.add(box(0.15, 0.15, 1.9, body, 0, 0.95, 0));
      g.add(cyl(0.32, 0.38, 1.1, body, 0, 1.75, -0.1, 8));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0xffcc99));
      head.position.set(0, 2.55, 0); head.castShadow = true;
      g.add(head);
      g.add(box(1, 1, 0.8, bag, 0, 1.9, -0.75));
    }
    g.position.copy(p.pos);
    this.addEntity('partner', p.id, g, partnerLabel(p), 4.2, 'label label-small');
  }

  syncPartner(p) {
    const e = this.entities.get(`partner:${p.id}`);
    if (!e) return;
    // keep to the right-hand lane
    const right = new THREE.Vector3(-Math.cos(p.heading), 0, Math.sin(p.heading)).multiplyScalar(1.3);
    e.group.position.set(p.pos.x + right.x, 0.05, p.pos.z + right.z);
    e.group.rotation.y = p.heading;
  }

  // ---------- Relationships ----------
  setPartnerWith(r) {
    this.removePartnerWith(r.id);
    const a = this.hqTop.clone(), b = r.top.clone();
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 8;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.16, 6), new THREE.MeshBasicMaterial({ color: UE_GREEN, transparent: true, opacity: 0.55 }));
    const label = makeLabel('Partner with', 'rel-label rel-partner');
    label.position.copy(curve.getPoint(0.72));
    mesh.add(label);
    const dots = [0, 0.33, 0.66].map((t) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb8ffd9 }));
      d.userData.t = t;
      mesh.add(d);
      return d;
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 10), new THREE.MeshBasicMaterial({ color: UE_GREEN }));
    cone.position.copy(curve.getPoint(0.97));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(0.97).normalize());
    mesh.add(cone);
    this.relGroup.add(mesh);
    this.arcs.set(r.id, { mesh, label, dots, curve });
  }

  removePartnerWith(id) {
    const a = this.arcs.get(id);
    if (!a) return;
    a.label.element.remove();
    this.relGroup.remove(a.mesh);
    this.arcs.delete(id);
  }

  setDrives(partnerId, from, to) {
    let d = this.drives.get(partnerId);
    if (!d) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xff8c1a, dashSize: 1.2, gapSize: 0.7 }));
      line.frustumCulled = false;
      const label = makeLabel('Drives to', 'rel-label rel-drives');
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 10), new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
      line.add(label, cone);
      this.relGroup.add(line);
      d = { line, label, cone };
      this.drives.set(partnerId, d);
    }
    const a = from.clone(); a.y = 3;
    const b = to.clone();
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 6;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const pos = d.line.geometry.attributes.position;
    curve.getPoints(24).forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
    pos.needsUpdate = true;
    d.line.computeLineDistances();
    d.label.position.copy(curve.getPoint(0.5));
    d.cone.position.copy(curve.getPoint(0.96));
    d.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(0.96).normalize());
  }

  clearDrives(partnerId) {
    const d = this.drives.get(partnerId);
    if (!d) return;
    d.label.element.remove();
    this.relGroup.remove(d.line);
    this.drives.delete(partnerId);
  }

  addRoute(orderId, from, pts) {
    this.removeRoute(orderId);
    const path = new THREE.CurvePath();
    let prev = from.clone().setY(0.25);
    for (const p of pts) {
      const q = p.clone().setY(0.25);
      path.add(new THREE.LineCurve3(prev, q));
      prev = q;
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 120, 0.35, 5), new THREE.MeshBasicMaterial({ color: 0x00e08a, transparent: true, opacity: 0.75 }));
    this.scene.add(mesh);
    this.routes.set(orderId, mesh);
  }

  removeRoute(orderId) {
    const m = this.routes.get(orderId);
    if (m) { this.scene.remove(m); m.geometry.dispose(); this.routes.delete(orderId); }
  }

  setRelVisible(v) { this.relGroup.visible = v; this.relGroup.traverse((o) => { if (o.isCSS2DObject) o.visible = v; }); }
  setLabelsVisible(v) { this.labelRenderer.domElement.style.display = v ? '' : 'none'; }

  // ---------- Effects ----------
  pulse(pos, color = UE_GREEN) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.5, pos.z);
    this.scene.add(m);
    this.effects.push({ t: 0, dur: 1.4, update: (k) => { m.scale.setScalar(1 + k * 7); m.material.opacity = 1 - k; }, done: () => this.scene.remove(m) });
  }

  // A small data packet flying between two points — visualises what information moves where.
  packet(from, to, text, color = UE_GREEN) {
    const a = from.clone(), b = to.clone();
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 10;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), new THREE.MeshBasicMaterial({ color }));
    const label = makeLabel(text, 'packet');
    label.position.y = 1.4;
    m.add(label);
    this.scene.add(m);
    this.effects.push({
      t: 0, dur: 2.2,
      update: (k) => { const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; m.position.copy(curve.getPoint(e)); },
      done: () => { label.element.remove(); m.remove(label); this.scene.remove(m); this.pulse(b, color); },
    });
  }

  select(kind, id) {
    this.selected = kind ? { kind, id } : null;
  }

  pick(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const objs = [...this.entities.values()].map((e) => e.group);
    const hit = this.raycaster.intersectObjects(objs, true).find((h) => h.object.userData.pick);
    return hit ? hit.object.userData.pick : null;
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.hqRing.rotation.z += dt * 0.8;
    this.hqRing.position.y = 27 + Math.sin(t * 1.5) * 0.4;

    for (const a of this.arcs.values()) for (const d of a.dots) {
      d.userData.t = (d.userData.t + dt * 0.25) % 1;
      d.position.copy(a.curve.getPoint(d.userData.t));
    }

    this.effects = this.effects.filter((e) => {
      e.t += dt;
      const k = Math.min(e.t / e.dur, 1);
      e.update(k);
      if (k >= 1) { e.done(); return false; }
      return true;
    });

    if (this.selected) {
      const e = this.entities.get(`${this.selected.kind}:${this.selected.id}`);
      if (e) {
        const r = { hq: 9, restaurant: 5.5, customer: 4.5, partner: 2.6 }[e.kind];
        this.selRing.visible = true;
        this.selRing.position.set(e.group.position.x, 0.45, e.group.position.z);
        this.selRing.scale.setScalar(r * (1 + Math.sin(t * 4) * 0.06));
      } else this.selRing.visible = false;
    } else this.selRing.visible = false;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    return dt;
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function restaurantLabel(r, extra = '') {
  return `<b>${CUISINES[r.cuisine].emoji} ${esc(r.name)}</b><small>${r.cuisine} · ${r.storeType}</small>${extra}`;
}
export function customerLabel(c, extra = '') {
  return `<b>${c.membership === 'Uber One' ? '💎 ' : ''}${esc(c.name)}</b>${extra}`;
}
export function partnerLabel(p, extra = '') {
  return `<b>${p.commute === 'Car' ? '🚗' : '🚲'} ${esc(p.name)}</b> <span class="muted">★${p.rating.toFixed(1)}</span>${extra}`;
}
export { esc };
