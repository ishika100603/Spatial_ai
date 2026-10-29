// Morningside Heights, Manhattan — the physical setting for the food delivery model.
// Streets, avenues, pre-war apartment blocks, Columbia University, Barnard, the Cathedral of
// St. John the Divine, Riverside and Morningside Parks, the Hudson, traffic and people.
// Decorative except for the street grid, which comes from the location model.
import * as THREE from 'three';
import { AVENUES, BLOCK, streetZ, streetWidth, streetShort, streetSegmentKind, zoneAt, HUDSON_X, PARKWAY_X } from './food-delivery-location.js?v=7';

const VIS_STREETS = [];
for (let n = 101; n <= 127; n++) VIS_STREETS.push(n);
const aveVisible = (a, n) => n >= (a.id === 'claremont' ? 116 : 101) && n <= 127;
const RIVERSIDE_W = -401; // west curb of Riverside Dr
const CITY_E = 700;

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(7);
const between = (a, b) => a + (b - a) * rand();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

// --- Text sprites (constant on-screen size) ---------------------------------
export function textSprite(text, { color = '#1d1d1f', bg = 'rgba(255,255,255,0.92)', size = 0.026, weight = 600, border = null } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${weight} 44px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w;
  c.height = 66;
  g.font = font;
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, w, 66, 14);
    g.fill();
    if (border) { g.strokeStyle = border; g.lineWidth = 5; g.stroke(); }
  } else {
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 8;
  }
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, 18, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, toneMapped: false, fog: false }));
  s.scale.set((w / 66) * size, size, 1);
  s.renderOrder = 20;
  return s;
}

// --- Geometry builder for merged buildings ----------------------------------
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  quad(a, b, c, d, nrm, uv) {
    const k = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let j = 0; j < 4; j++) this.n.push(nrm[0], nrm[1], nrm[2]);
    this.uv.push(...uv);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  sides(cx, cz, w, d, y0, y1, tw = 7, th = 7, skip = '') {
    const xw = cx - w / 2, xe = cx + w / 2, zn = cz - d / 2, zs = cz + d / 2;
    const v0 = y0 / th, v1 = y1 / th, ud = d / tw, uw = w / tw;
    if (!skip.includes('e')) this.quad([xe, y0, zs], [xe, y0, zn], [xe, y1, zn], [xe, y1, zs], [1, 0, 0], [0, v0, ud, v0, ud, v1, 0, v1]);
    if (!skip.includes('w')) this.quad([xw, y0, zn], [xw, y0, zs], [xw, y1, zs], [xw, y1, zn], [-1, 0, 0], [0, v0, ud, v0, ud, v1, 0, v1]);
    if (!skip.includes('s')) this.quad([xw, y0, zs], [xe, y0, zs], [xe, y1, zs], [xw, y1, zs], [0, 0, 1], [0, v0, uw, v0, uw, v1, 0, v1]);
    if (!skip.includes('n')) this.quad([xe, y0, zn], [xw, y0, zn], [xw, y1, zn], [xe, y1, zn], [0, 0, -1], [0, v0, uw, v0, uw, v1, 0, v1]);
  }
  top(cx, cz, w, d, y, t = 10) {
    const xw = cx - w / 2, xe = cx + w / 2, zn = cz - d / 2, zs = cz + d / 2;
    this.quad([xw, y, zs], [xe, y, zs], [xe, y, zn], [xw, y, zn], [0, 1, 0], [0, 0, w / t, 0, w / t, d / t, 0, d / t]);
  }
  box(cx, cz, w, d, y0, y1) { this.sides(cx, cz, w, d, y0, y1, 10, 10); this.top(cx, cz, w, d, y1); }
  mesh(material, { cast = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }
}

// --- Procedural textures -----------------------------------------------------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function facadeTex(base, trim, style) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.07})`;
      g.fillRect(rand() * 256, rand() * 256, 7, 2);
    }
    for (let y = 0; y < 256; y += 4) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(0, y, 256, 1); }
    for (const bx of [0, 128]) {
      for (const fy of [0, 128]) {
        const x = bx + 36, y = fy + 24, w = 56, h = style === 'tall' ? 84 : 72;
        g.fillStyle = trim;
        g.fillRect(x - 6, y - 8, w + 12, 10); // lintel
        g.fillRect(x - 8, y + h + 2, w + 16, 7); // sill
        g.fillRect(x - 4, y - 2, w + 8, h + 4); // frame
        const gr = g.createLinearGradient(x, y, x + w * 0.6, y + h);
        const shade = 30 + Math.floor(rand() * 30);
        gr.addColorStop(0, `rgb(${shade + 70},${shade + 85},${shade + 100})`);
        gr.addColorStop(1, `rgb(${shade},${shade + 8},${shade + 18})`);
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        if (rand() < 0.35) { g.fillStyle = 'rgba(235,228,210,0.85)'; g.fillRect(x, y, w, h * between(0.2, 0.55)); }
        g.fillStyle = trim;
        g.fillRect(x + w / 2 - 2, y, 4, h);
        g.fillRect(x, y + h * 0.48, w, 4);
      }
    }
  });
}

const storefrontTex = canvasTex(256, 140, (g) => {
  g.fillStyle = '#3a3532';
  g.fillRect(0, 0, 256, 140);
  g.fillStyle = '#2b2b2e';
  g.fillRect(0, 0, 256, 26);
  const gr = g.createLinearGradient(0, 30, 0, 130);
  gr.addColorStop(0, '#9fb3c2');
  gr.addColorStop(1, '#3b4650');
  g.fillStyle = gr;
  g.fillRect(10, 32, 150, 88);
  g.fillRect(196, 32, 50, 88);
  g.fillStyle = '#6b4a2e';
  g.fillRect(166, 40, 26, 92);
  g.fillStyle = '#bfb8a8';
  g.fillRect(0, 122, 256, 18);
  g.fillStyle = 'rgba(255,240,200,0.5)';
  for (let i = 0; i < 6; i++) g.fillRect(16 + i * 24, 70 + (i % 2) * 14, 14, 10);
});

const roadTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#4a4c50';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.08})`;
    g.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
});

// Painted words on the asphalt ("BROADWAY", "W 112 ST").
function roadWords(text, length) {
  const t = canvasTex(512, 96, (g) => {
    g.fillStyle = 'rgba(245,245,240,0.9)';
    g.font = '800 70px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 52, 500);
  }, false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(length, length * 0.19), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// Instanced helper: accumulate transforms and colours, then build once.
class Instances {
  constructor(geometry, material) { this.g = geometry; this.m = material; this.list = []; }
  add(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, color = null) { this.list.push({ x, y, z, sx, sy, sz, ry, color }); }
  build(scene, { cast = true, receive = true } = {}) {
    if (!this.list.length) return null;
    const mesh = new THREE.InstancedMesh(this.g, this.m, this.list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    this.list.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.ry, 0));
      m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, m4);
      if (it.color !== null) mesh.setColorAt(i, col.set(it.color));
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
    return mesh;
  }
}

// ---------------------------------------------------------------------------
export function createCity({ scene, renderer, camera, sun, hemi }) {
  const updaters = [];
  const occupants = { vehicles: [], people: [] }; // live positions for "what is here?"

  // ----- Sky, light, fog ----------------------------------------------------
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  camera.far = 12000;
  camera.updateProjectionMatrix();
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 42), THREE.MathUtils.degToRad(35)).normalize();
  const makeSky = () => new THREE.Mesh(
    new THREE.SphereGeometry(9000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { uTop: { value: new THREE.Color(0x2a66c4) }, uMid: { value: new THREE.Color(0x6aa6e4) }, uHorizon: { value: new THREE.Color(0xcfe3f2) }, uBottom: { value: new THREE.Color(0xd9e2e6) }, uSun: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.0)).xyz); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop,uMid,uHorizon,uBottom,uSun; varying vec3 vDir;
        void main(){ vec3 d=normalize(vDir); float h=d.y;
          vec3 col = h>0.0 ? mix(mix(uHorizon,uMid,smoothstep(0.0,0.22,h)),uTop,smoothstep(0.22,0.9,h)) : mix(uHorizon,uBottom,smoothstep(0.0,-0.1,h));
          float s=max(dot(d,normalize(uSun)),0.0);
          col += vec3(1.0,0.92,0.75)*(pow(s,12.0)*0.25+pow(s,300.0)*0.8);
          col = mix(col, vec3(1.0,0.98,0.92), smoothstep(0.9992,0.9996,s));
          gl_FragColor=vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(makeSky());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(makeSky());
  scene.environment = pmrem.fromScene(skyScene).texture;
  scene.background = null;
  scene.fog = new THREE.Fog(0xcfe3f2, 700, 3000);
  sun.color.set(0xfff0dc);
  sun.intensity = 2.8;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 1600 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun.target);
  hemi.color.set(0xd6e8ff);
  hemi.groundColor.set(0x8a8478);
  hemi.intensity = 1.3;

  // Clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 1, flatShading: true, transparent: true, opacity: 0.95, fog: false });
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    for (let p = 0; p < 6; p++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(between(40, 90), 1), cloudMat);
      m.position.set(between(-110, 110), between(-15, 25), between(-50, 50));
      m.scale.y = 0.55;
      c.add(m);
    }
    c.position.set(between(-4500, 4500), between(700, 1100), between(-4500, 3000));
    c.userData.v = between(4, 10);
    scene.add(c);
    clouds.push(c);
  }
  updaters.push((dt) => clouds.forEach((c) => { c.position.x += c.userData.v * dt; if (c.position.x > 4800) c.position.x = -4800; }));

  // ----- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mat(0x8c8a84));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  const zN = streetZ(127) - 9;
  const zS = streetZ(101) + 9;
  roadTex.repeat.set((CITY_E - RIVERSIDE_W) / 24, (zS - zN) / 24);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(CITY_E - RIVERSIDE_W + 400, zS - zN), mat(0xffffff, { map: roadTex, roughness: 0.95 }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set((RIVERSIDE_W + CITY_E + 400) / 2, 0, (zN + zS) / 2);
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  // Spatial index of static objects (buildings, trees, lamps) so agents can sense them.
  const staticIndex = {
    cells: new Map(),
    size: 40,
    key(i, k) { return `${i},${k}`; },
    add(kind, o) {
      o.kind = kind;
      const x0 = o.x0 ?? o.x, x1 = o.x1 ?? o.x, z0 = o.z0 ?? o.z, z1 = o.z1 ?? o.z;
      for (let i = Math.floor(x0 / this.size); i <= Math.floor(x1 / this.size); i++)
        for (let k = Math.floor(z0 / this.size); k <= Math.floor(z1 / this.size); k++) {
          const key = this.key(i, k);
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(o);
        }
    },
    query(x, z, R, kind) {
      const seen = new Set();
      for (let i = Math.floor((x - R) / this.size); i <= Math.floor((x + R) / this.size); i++)
        for (let k = Math.floor((z - R) / this.size); k <= Math.floor((z + R) / this.size); k++)
          for (const o of this.cells.get(this.key(i, k)) || []) if (o.kind === kind) seen.add(o);
      return [...seen];
    },
  };
  const footprint = (cx, cz, w, d, h, name = 'Building') => staticIndex.add('building', { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h, name });
  const junctions = []; // signalised intersections

  // ----- Street grid layout ---------------------------------------------------
  const avesAt = (n) => AVENUES.filter((a) => aveVisible(a, n)).sort((p, q) => p.x - q.x);
  const streetKind = (n, a, b) => (n >= 101 && n <= 127 ? streetSegmentKind(n, a.id, b.id) : 'road');

  const sidewalk = new Builder();
  const facades = [
    { base: '#8e4a35', trim: '#d9cdb5' }, // red brick
    { base: '#b98a62', trim: '#efe6d2' }, // tan brick
    { base: '#cfc4ae', trim: '#8f8577' }, // limestone
    { base: '#6e4a3a', trim: '#cbb79a' }, // brownstone
    { base: '#9f988c', trim: '#e8e2d4' }, // grey brick
    { base: '#a5583f', trim: '#f2ead8' }, // orange brick
  ].map((f) => ({ ...f, builder: new Builder(), tex: facadeTex(f.base, f.trim, rand() < 0.5 ? 'tall' : '') }));
  const roofs = new Builder();
  const shops = new Builder();
  const cornices = new Instances(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff));
  const tankI = new Instances(new THREE.CylinderGeometry(2.2, 2.2, 4.2, 12), mat(0x7b5a3d));
  const tankRoofI = new Instances(new THREE.ConeGeometry(2.45, 1.7, 12), mat(0x4a3a2e));
  const standI = new Instances(new THREE.BoxGeometry(3.4, 3, 3.4), mat(0x33302d));
  const bulkI = new Instances(new THREE.BoxGeometry(1, 1, 1), mat(0x8d877d));
  const awningI = new Instances(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff));
  const treeTrunkI = new Instances(new THREE.CylinderGeometry(0.22, 0.32, 4.4, 5), mat(0x5d4532));
  const treeTopI = new Instances(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, { flatShading: true }));
  const lampI = new Instances(new THREE.CylinderGeometry(0.11, 0.16, 8.5, 6), mat(0x2f3a34));
  const lampHeadI = new Instances(new THREE.BoxGeometry(0.5, 0.25, 1.8), mat(0x2f3a34));
  const signalI = new Instances(new THREE.BoxGeometry(0.6, 1.8, 0.6), mat(0xd9b21f));
  const signalPoleI = new Instances(new THREE.CylinderGeometry(0.13, 0.13, 5, 6), mat(0x3b3f3c));
  const stripeI = new Instances(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat(0xf2f2ee, { roughness: 0.7 }));
  const yellowI = new Instances(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat(0xe8b923, { roughness: 0.7 }));
  const parkedBodyI = new Instances(new THREE.BoxGeometry(1.8, 0.8, 4.4), mat(0xffffff, { roughness: 0.4, metalness: 0.3 }));
  const parkedCabinI = new Instances(new THREE.BoxGeometry(1.6, 0.6, 2.3), mat(0x26303a, { roughness: 0.2, metalness: 0.5 }));
  const benchI = new Instances(new THREE.BoxGeometry(0.6, 0.5, 2), mat(0x4c3a2a));
  const medianB = new Builder();

  const CAR_COLORS = [0xe8e8e8, 0x1d1d1f, 0x8a9196, 0x2f4f7f, 0x7d1e1e, 0x5c6b59, 0xc2b59b, 0x3a3f47];
  const COMMERCIAL = new Set(['broadway', 'amsterdam', 'manhattan']);
  const AWNING_COLORS = [0x1f4e3d, 0x7d1e1e, 0x23395d, 0x1d1d1f, 0xb5651d, 0x6b2c5f, 0x2e6b30];

  function addBuilding(cx, cz, w, d, h, opts = {}) {
    const f = opts.facade ?? pick(facades);
    footprint(cx, cz, w, d, h, 'Apartment building');
    f.builder.sides(cx, cz, w, d, 0, h);
    roofs.top(cx, cz, w, d, h);
    cornices.add(cx, h - 0.4, cz, w + 0.9, 0.9, d + 0.9, 0, pick([0xd8cfbd, 0xbfb6a5, 0x9c9384, 0xe6dfd0]));
    if (h > 22 && rand() < 0.5) {
      const tx = cx + between(-w / 4, w / 4);
      const tz = cz + between(-d / 4, d / 4);
      standI.add(tx, h + 1.5, tz);
      tankI.add(tx, h + 5.1, tz);
      tankRoofI.add(tx, h + 8, tz);
    }
    if (rand() < 0.6) bulkI.add(cx + between(-w / 4, w / 4), h + 1.4, cz + between(-d / 4, d / 4), between(3, 5), 2.8, between(3, 5));
  }

  // Ground-floor shops along a façade facing an avenue.
  function addShops(x, z0, z1, facing) {
    const off = facing === 'w' ? -0.08 : 0.08;
    const xx = x + off;
    const len = z1 - z0;
    if (facing === 'w') shops.quad([xx, 0.15, z0], [xx, 0.15, z1], [xx, 4.6, z1], [xx, 4.6, z0], [-1, 0, 0], [0, 0, len / 8, 0, len / 8, 1, 0, 1]);
    else shops.quad([xx, 0.15, z1], [xx, 0.15, z0], [xx, 4.6, z0], [xx, 4.6, z1], [1, 0, 0], [0, 0, len / 8, 0, len / 8, 1, 0, 1]);
    for (let z = z0 + 4; z < z1 - 4; z += 8) {
      if (rand() < 0.55) awningI.add(x + (facing === 'w' ? -0.9 : 0.9), 4.1, z, 1.8, 0.35, 6.6, 0, pick(AWNING_COLORS));
    }
  }

  function fillBlock(x0, x1, z0, z1, westAve, eastAve) {
    sidewalk.box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, 0.16);
    const sw = 4.5;
    const ax0 = x0 + sw, ax1 = x1 - sw, bz0 = z0 + sw, bz1 = z1 - sw;
    const AW = 26;
    const aveHeight = (a) => (a?.id === 'riverside' ? between(38, 56) : a?.id === 'broadway' ? between(30, 50) : between(22, 42));
    let ix0 = ax0, ix1 = ax1;
    for (const [ave, side] of [[westAve, 'w'], [eastAve, 'e']]) {
      if (!ave) continue;
      const bx0 = side === 'w' ? ax0 : ax1 - AW;
      const k = Math.max(1, Math.round((bz1 - bz0) / 24));
      const step = (bz1 - bz0) / k;
      for (let i = 0; i < k; i++) {
        const za = bz0 + i * step, zb = za + step;
        addBuilding(bx0 + AW / 2, (za + zb) / 2, AW, step - 0.6, Math.round(aveHeight(ave) / 3.5) * 3.5 + 1);
        if (COMMERCIAL.has(ave.id)) addShops(side === 'w' ? ax0 : ax1, za + 0.3, zb - 0.3, side);
      }
      if (side === 'w') ix0 = ax0 + AW; else ix1 = ax1 - AW;
    }
    const depthMax = Math.min(28, (bz1 - bz0) / 2 - 4);
    if (ix1 - ix0 < 8 || depthMax < 8) return;
    for (const row of ['n', 's']) {
      let x = ix0;
      while (x < ix1 - 6) {
        const w = Math.min(between(8, 22), ix1 - x);
        if (w < 6) break;
        if (rand() > 0.05) {
          const d = between(Math.min(18, depthMax), depthMax);
          const h = rand() < 0.4 ? between(13, 19) : between(23, 40);
          const cz = row === 'n' ? bz0 + d / 2 : bz1 - d / 2;
          addBuilding(x + w / 2, cz, w - 0.4, d, Math.round(h / 3.5) * 3.5 + 1);
        }
        x += w;
      }
    }
  }

  const trees = (x, z, s = 1, y = 0) => {
    staticIndex.add('tree', { x, z });
    treeTrunkI.add(x, y + 2.2 * s, z, s, s, s);
    const green = pick([0x4f7f3a, 0x5d8c3f, 0x3f6f35, 0x6b9445, 0x587f3a]);
    treeTopI.add(x, y + 6.2 * s, z, 3.2 * s * between(0.85, 1.15), 2.8 * s, 3.2 * s * between(0.85, 1.15), rand() * 6, green);
    if (rand() < 0.6) treeTopI.add(x + between(-1, 1), y + 7.6 * s, z + between(-1, 1), 2.2 * s, 2 * s, 2.2 * s, 0, green);
  };

  // Blocks between each pair of streets and avenues.
  for (let n = 101; n < 127; n++) {
    const zTop = streetZ(n + 1) + streetWidth(n + 1) / 2;
    const zBot = streetZ(n) - streetWidth(n) / 2;
    const aves = AVENUES.filter((a) => aveVisible(a, n) && aveVisible(a, n + 1)).sort((p, q) => p.x - q.x);
    const bounds = [...aves.map((a) => ({ x: a.x, w: a.w, ave: a })), { x: CITY_E + 10, w: 20, ave: null }];
    for (let i = 0; i < bounds.length - 1; i++) {
      const A = bounds[i], B = bounds[i + 1];
      const x0 = A.x + A.w / 2, x1 = B.x - B.w / 2;
      const zone = zoneAt((x0 + x1) / 2, (zTop + zBot) / 2);
      if (zone) continue;
      fillBlock(x0, x1, zTop, zBot, A.ave, B.ave);
    }
  }

  // Street furniture, trees, crosswalks, lane markings, parked cars.
  for (const n of VIS_STREETS) {
    const sz = streetZ(n);
    const sw = streetWidth(n);
    const aves = avesAt(n);
    for (let i = 0; i < aves.length; i++) {
      const a = aves[i];
      const west = aves[i - 1], east = aves[i + 1];
      const hasW = west && streetKind(n, west, a) === 'road';
      const hasE = east && streetKind(n, a, east) === 'road';
      // crosswalks across the avenue
      if (hasW || hasE) {
        for (const side of [-1, 1]) {
          const cz = sz + side * (sw / 2 + 2.6);
          for (let x = a.x - a.w / 2 + 1; x < a.x + a.w / 2 - 0.5; x += 1.3) stripeI.add(x, 0.03, cz, 0.6, 1, 4);
        }
        // traffic signals on two corners
        junctions.push({ x: a.x, z: sz, n, ave: a.id, w: a.w, sw, name: `${a.name} & ${streetShort(n)}`, offset: ((n - 101) * 4 + AVENUES.indexOf(a) * 9) % 70 });
        signalPoleI.add(a.x - a.w / 2 - 1, 2.5, sz - sw / 2 - 1);
        signalI.add(a.x - a.w / 2 - 1, 5.6, sz - sw / 2 - 1);
        signalPoleI.add(a.x + a.w / 2 + 1, 2.5, sz + sw / 2 + 1);
        signalI.add(a.x + a.w / 2 + 1, 5.6, sz + sw / 2 + 1);
      }
      for (const [has, side] of [[hasW, -1], [hasE, 1]]) {
        if (!has) continue;
        const cx = a.x + side * (a.w / 2 + 2.6);
        for (let z = sz - sw / 2 + 1; z < sz + sw / 2 - 0.5; z += 1.3) stripeI.add(cx, 0.03, z, 4, 1, 0.6);
      }
      // street segment to the east: trees, lamps, parked cars, painted name
      if (east) {
        const kind = streetKind(n, a, east);
        if (kind === 'road') {
          const x0 = a.x + a.w / 2 + 12, x1 = east.x - east.w / 2 - 12;
          for (const side of [-1, 1]) {
            const zc = sz + side * (sw / 2 + 2);
            for (let x = x0; x < x1; x += 11) if (rand() < 0.8) trees(x + between(-1, 1), zc, between(0.85, 1.15));
            const zp = sz + side * (sw / 2 - 1.3);
            for (let x = x0 + 3; x < x1 - 3; x += 6.3) {
              if (rand() < 0.62) {
                const col = rand() < 0.12 ? 0xf2c218 : pick(CAR_COLORS);
                parkedBodyI.add(x, 0.75, zp, 1, 1, 1, Math.PI / 2, col);
                parkedCabinI.add(x - 0.2, 1.45, zp, 1, 1, 1, Math.PI / 2);
              }
            }
          }
          if (n >= 108 && n <= 120 && x1 - x0 > 60) {
            const label = roadWords(`W ${n} ST`, Math.min(30, (x1 - x0) * 0.35));
            label.position.set((x0 + x1) / 2, 0.05, sz);
            scene.add(label);
          }
        }
      }
    }
  }

  // Avenues: medians, lane lines, lamps, painted names.
  for (const a of AVENUES) {
    for (let n = 101; n < 127; n++) {
      if (!aveVisible(a, n) || !aveVisible(a, n + 1)) continue;
      const za = streetZ(n + 1) + streetWidth(n + 1) / 2 + 6;
      const zb = streetZ(n) - streetWidth(n) / 2 - 6;
      const L = zb - za;
      const zc = (za + zb) / 2;
      if (a.median) {
        medianB.box(a.x, zc, a.median, L + 4, 0, 0.35);
        for (let z = za + 4; z < zb - 4; z += 14) trees(a.x, z, between(0.9, 1.15), 0.35);
        for (let z = za + 10; z < zb - 10; z += 28) { benchI.add(a.x - 2.4, 0.6, z); benchI.add(a.x + 2.4, 0.6, z); }
      } else if (!a.oneWay) {
        yellowI.add(a.x - 0.25, 0.025, zc, 0.18, 1, L);
        yellowI.add(a.x + 0.25, 0.025, zc, 0.18, 1, L);
      }
      const laneXs = a.oneWay ? [a.x - a.w / 6, a.x + a.w / 6] : a.median ? [a.x - a.median / 2 - 6, a.x + a.median / 2 + 6] : [a.x - a.w / 4, a.x + a.w / 4];
      for (const lx of laneXs) for (let z = za; z < zb - 3; z += 12) stripeI.add(lx, 0.025, z + 1.5, 0.16, 1, 3);
      for (const side of [-1, 1]) {
        for (let z = za + 5; z < zb; z += 30) {
          const lx = a.x + side * (a.w / 2 + 1);
          lampI.add(lx, 4.25, z);
          staticIndex.add('lamp', { x: lx, z });
          lampHeadI.add(lx - side * 0.8, 8.5, z);
        }
      }
      if (n >= 108 && n < 120 && n % 2 === 0) {
        const label = roadWords(a.name.toUpperCase(), Math.min(a.w * 0.9, 26));
        label.rotation.z = Math.PI / 2;
        label.position.set(a.x + (a.median ? a.median / 2 + 6 : 0), 0.05, zc);
        scene.add(label);
      }
    }
  }

  // ----- Columbia University ---------------------------------------------------
  const LIME = 0xd8cfbc;
  const BRICK = 0x9a4e3a;
  const COPPER = 0x5f9c87;
  const campus = { x0: -127.5, x1: 95, z0: streetZ(120) + 9, z1: streetZ(114) - 9 };
  const brickPave = mat(0xa8705a, { roughness: 0.95 });
  const lawnMat = mat(0x5f8f3d, { roughness: 1 });
  const stoneMat = mat(LIME, { roughness: 0.8 });
  const brickMat = mat(BRICK, { roughness: 0.9 });
  const copperMat = mat(COPPER, { roughness: 0.6, metalness: 0.3 });
  const slab = (x0, x1, z0, z1, y0, y1, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    b.receiveShadow = true;
    b.castShadow = y1 - y0 > 2;
    scene.add(b);
    return b;
  };
  slab(campus.x0, campus.x1, campus.z0, campus.z1, 0, 0.6, brickPave);
  const cwz = streetZ(116);
  // South lawns (between College Walk and Butler)
  slab(-100, -26, cwz + 18, -80, 0.6, 0.75, lawnMat);
  slab(-6, 70, cwz + 18, -80, 0.6, 0.75, lawnMat);
  // Lawns either side of Low
  slab(-110, -60, -320, -205, 0.6, 0.75, lawnMat);
  slab(30, 70, -320, -205, 0.6, 0.75, lawnMat);
  // College Walk trees
  for (let x = -115; x <= 85; x += 12) { trees(x, cwz - 9, 1.1, 0.6); trees(x, cwz + 9, 1.1, 0.6); }
  for (let z = -150; z <= -95; z += 12) { trees(-102, z, 1, 0.75); trees(72, z, 1, 0.75); }

  function campusBuilding(cx, cz, w, d, h, { material = brickMat, roof = 'hip', roofMat = copperMat } = {}) {
    footprint(cx, cz, w, d, h, 'Campus building');
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    b.position.set(cx, 0.6 + h / 2, cz);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6), stoneMat);
    band.position.set(cx, 0.6 + h - 0.6, cz);
    scene.add(band);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 3, d + 0.4), stoneMat);
    base.position.set(cx, 2.1, cz);
    scene.add(base);
    // window rows
    const winMat = mat(0x2c3640, { roughness: 0.3, metalness: 0.4 });
    const floors = Math.floor((h - 4) / 4);
    for (let f = 0; f < floors; f++) {
      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 1.6, 0.2), winMat);
        strip.position.set(cx, 0.6 + 4.5 + f * 4, cz + side * (d / 2 + 0.05));
        scene.add(strip);
        const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, d * 0.86), winMat);
        strip2.position.set(cx + side * (w / 2 + 0.05), 0.6 + 4.5 + f * 4, cz);
        scene.add(strip2);
      }
    }
    if (roof === 'hip') {
      const r = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), roofMat);
      r.rotation.y = Math.PI / 4;
      r.scale.set(w, Math.min(w, d) * 0.35, d);
      r.position.set(cx, 0.6 + h + Math.min(w, d) * 0.175, cz);
      r.castShadow = true;
      scene.add(r);
    }
    return b;
  }

  // Low Memorial Library — domed, with portico and Low Steps
  footprint(-16, -262, 58, 58, 50, 'Low Memorial Library');
  footprint(-16, -48, 105, 46, 34, 'Butler Library');
  footprint(188, streetZ(112), 100, 84, 60, 'Cathedral of St. John the Divine');
  {
    const cx = -16, cz = -262;
    const body = new THREE.Mesh(new THREE.BoxGeometry(58, 22, 58), stoneMat);
    body.position.set(cx, 0.6 + 11, cz);
    body.castShadow = body.receiveShadow = true;
    scene.add(body);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(19, 20, 9, 40), stoneMat);
    drum.position.set(cx, 0.6 + 22 + 4.5, cz);
    drum.castShadow = true;
    scene.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(19, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9c2b2, { roughness: 0.6 }));
    dome.position.set(cx, 0.6 + 31, cz);
    dome.castShadow = true;
    scene.add(dome);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 5, 16), stoneMat);
    lantern.position.set(cx, 0.6 + 52, cz);
    scene.add(lantern);
    const portico = new THREE.Mesh(new THREE.BoxGeometry(36, 3, 9), stoneMat);
    portico.position.set(cx, 0.6 + 19.5, cz + 33);
    portico.castShadow = true;
    scene.add(portico);
    for (let i = 0; i < 10; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 15, 12), stoneMat);
      col.position.set(cx - 16 + i * 3.55, 0.6 + 3 + 7.5, cz + 34);
      col.castShadow = true;
      scene.add(col);
    }
    // Low Steps down to Low Plaza
    for (let s = 0; s < 10; s++) slab(cx - 48, cx + 48, cz + 38 + s * 2.4, cz + 38 + (s + 1) * 2.4, 0.6, 0.6 + 3 - s * 0.3, stoneMat);
    const alma = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 3.2, 10), mat(0xb08d3c, { metalness: 0.7, roughness: 0.35 }));
    alma.position.set(cx, 0.6 + 2.4 + 1.6, cz + 48);
    scene.add(alma);
  }
  // Butler Library — long colonnaded front facing the South Lawn
  {
    const cx = -16, cz = -48;
    const body = new THREE.Mesh(new THREE.BoxGeometry(105, 30, 46), stoneMat);
    body.position.set(cx, 0.6 + 15, cz);
    body.castShadow = body.receiveShadow = true;
    scene.add(body);
    for (let i = 0; i < 14; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 16, 12), stoneMat);
      col.position.set(cx - 39 + i * 6, 0.6 + 6 + 8, cz - 24);
      col.castShadow = true;
      scene.add(col);
    }
    const winMat = mat(0x2c3640, { roughness: 0.3, metalness: 0.4 });
    for (let i = 0; i < 13; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.8, 13, 0.3), winMat);
      w.position.set(cx - 36 + i * 6, 0.6 + 14, cz - 23.2);
      scene.add(w);
    }
    const attic = new THREE.Mesh(new THREE.BoxGeometry(98, 4, 40), stoneMat);
    attic.position.set(cx, 0.6 + 32, cz);
    scene.add(attic);
  }
  // Other campus halls (red brick with copper roofs)
  [
    [70, -120, 30, 50, 26], // Hamilton
    [72, -44, 34, 40, 46], // John Jay
    [-104, -128, 30, 44, 24], // Journalism
    [-104, -60, 30, 46, 22], // Lewisohn
    [72, -232, 26, 52, 24], // Philosophy
    [-100, -222, 26, 30, 17], // Earl Hall
    [-102, -290, 30, 48, 24], // Mathematics
    [72, -360, 26, 44, 22], // Avery
    [70, -440, 32, 54, 30], // Schermerhorn
    [36, -478, 46, 26, 36], // Mudd
  ].forEach(([x, z, w, d, h]) => campusBuilding(x, z, w, d, h));
  campusBuilding(66, -300, 24, 42, 18); // St. Paul's Chapel
  const chapelDome = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), copperMat);
  chapelDome.position.set(66, 0.6 + 18 + 5, -300);
  scene.add(chapelDome);
  campusBuilding(-16, -390, 76, 40, 22, { material: mat(0xc8bba2), roof: 'flat' }); // Uris
  campusBuilding(-96, -440, 42, 48, 52); // Pupin
  const obs = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd9d9d9, { metalness: 0.4 }));
  obs.position.set(-96, 0.6 + 52 + 9, -440);
  scene.add(obs);
  // Gates
  for (const gx of [campus.x0 + 1.5, campus.x1 - 1.5]) {
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 2.2), stoneMat);
      pier.position.set(gx, 3.6, cwz + s * 8);
      pier.castShadow = true;
      scene.add(pier);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), mat(0xfff3c4, { emissive: 0xffe9a8, emissiveIntensity: 0.6 }));
      lamp.position.set(gx, 7.3, cwz + s * 8);
      scene.add(lamp);
    }
  }

  // ----- Barnard College ------------------------------------------------------
  const barn = { x0: -256, x1: -172.5, z0: streetZ(120) + 9, z1: streetZ(116) - 9 };
  slab(barn.x0, barn.x1, barn.z0, barn.z1, 0, 0.4, mat(0xb9ae9c));
  slab(-245, -190, -330, -230, 0.4, 0.55, lawnMat);
  campusBuilding(-200, -200, 36, 30, 22); // Barnard Hall
  campusBuilding(-230, -455, 46, 34, 24); // Milbank
  campusBuilding(-238, -360, 22, 30, 62, { material: mat(0xb47a5a), roof: 'flat' }); // Sulzberger tower
  const diana = new THREE.Mesh(new THREE.BoxGeometry(30, 28, 24), mat(0xd8823a, { roughness: 0.25, metalness: 0.4, transparent: true, opacity: 0.92 }));
  diana.position.set(-200, 14.4, -270);
  diana.castShadow = true;
  scene.add(diana);
  for (let i = 0; i < 18; i++) trees(between(-245, -190), between(-330, -230), between(0.9, 1.2), 0.55);

  // ----- Cathedral of St. John the Divine --------------------------------------
  {
    const close = { x0: 125, x1: 245, z0: streetZ(113) + 9, z1: streetZ(110) - 15 };
    slab(close.x0, close.x1, close.z0, close.z1, 0, 0.3, mat(0x6d8f45, { roughness: 1 }));
    const stone = mat(0xa79b85, { roughness: 0.9 });
    const roofM = mat(0x55605d, { roughness: 0.7, metalness: 0.2 });
    const cz = streetZ(112);
    const nave = new THREE.Mesh(new THREE.BoxGeometry(92, 38, 30), stone);
    nave.position.set(188, 19, cz);
    nave.castShadow = nave.receiveShadow = true;
    scene.add(nave);
    // pitched roof as a triangular prism
    const prism = new THREE.Shape();
    prism.moveTo(-16, 0);
    prism.lineTo(16, 0);
    prism.lineTo(0, 12);
    prism.closePath();
    const pg = new THREE.ExtrudeGeometry(prism, { depth: 92, bevelEnabled: false });
    const roof = new THREE.Mesh(pg, roofM);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(142, 38, cz);
    roof.castShadow = true;
    scene.add(roof);
    // transepts
    const tr = new THREE.Mesh(new THREE.BoxGeometry(26, 34, 84), stone);
    tr.position.set(205, 17, cz);
    tr.castShadow = true;
    scene.add(tr);
    const trRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(prism, { depth: 84, bevelEnabled: false }), roofM);
    trRoof.scale.set(26 / 32, 0.8, 1);
    trRoof.position.set(205, 34, cz - 42);
    scene.add(trRoof);
    // crossing dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7f8a86, { metalness: 0.3, roughness: 0.5 }));
    dome.position.set(205, 44, cz);
    dome.castShadow = true;
    scene.add(dome);
    // apse
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 34, 24, 1, false, 0, Math.PI), stone);
    apse.position.set(234, 17, cz);
    scene.add(apse);
    // west front towers and rose window
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(18, 62, 18), stone);
      t.position.set(140, 31, cz + s * 19);
      t.castShadow = true;
      scene.add(t);
      for (let k = 0; k < 4; k++) {
        const pin = new THREE.Mesh(new THREE.ConeGeometry(1.2, 5, 6), stone);
        pin.position.set(140 + (k % 2 ? 7 : -7), 64.5, cz + s * 19 + (k < 2 ? 7 : -7));
        scene.add(pin);
      }
    }
    const front = new THREE.Mesh(new THREE.BoxGeometry(4, 44, 22), stone);
    front.position.set(140, 22, cz);
    scene.add(front);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(7.5, 32), mat(0x31406a, { roughness: 0.2, metalness: 0.5, emissive: 0x1a2550, emissiveIntensity: 0.4 }));
    rose.rotation.y = -Math.PI / 2;
    rose.position.set(137.9, 30, cz);
    scene.add(rose);
    const portal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 14, 8), mat(0x3a2e24));
    portal.position.set(137.9, 7, cz);
    scene.add(portal);
    // lancet windows along the nave
    const lancetMat = mat(0x34405e, { roughness: 0.25, metalness: 0.4 });
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(3, 16, 0.4), lancetMat);
      w.position.set(152 + i * 8.5, 20, cz + s * 15.1);
      scene.add(w);
    }
    for (let i = 0; i < 26; i++) trees(between(130, 240), rand() < 0.5 ? between(close.z0 + 4, cz - 48) : between(cz + 48, close.z1 - 4), between(1, 1.3), 0.3);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 1.2, 28), stone);
    fountain.position.set(140, 0.9, cz + 80);
    scene.add(fountain);
  }

  // ----- Morningside Park (sunken, with cliff and pond) ------------------------
  const MP = { x0: 265, x1: 399, z0: streetZ(124), z1: streetZ(110) - 15 };
  const parkH = (x) => (x < 292 ? -13 * THREE.MathUtils.smoothstep(x, 266, 292) : -13 * (1 - THREE.MathUtils.smoothstep(x, 330, 398)));
  {
    const g = new THREE.PlaneGeometry(MP.x1 - MP.x0, MP.z1 - MP.z0, 70, 60);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const cols = [];
    const grass = new THREE.Color(0x5e8c3c), rock = new THREE.Color(0x77736b), path = new THREE.Color(0xb7ab92);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (MP.x0 + MP.x1) / 2;
      const z = pos.getZ(i) + (MP.z0 + MP.z1) / 2;
      const h = parkH(x) + (x > 268 && x < 290 ? Math.sin(z * 0.3) * 1.2 + Math.sin(z * 0.11) * 1.5 : 0);
      pos.setY(i, h);
      const c = x > 266 && x < 292 ? rock.clone() : grass.clone().lerp(new THREE.Color(0x7aa04a), 0.5 + 0.5 * Math.sin(x * 0.1 + z * 0.07));
      if (Math.abs(x - 312) < 2.5 || Math.abs((z + x * 0.4) % 140) < 2) c.copy(path);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const park = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    park.position.set((MP.x0 + MP.x1) / 2, 0.02, (MP.z0 + MP.z1) / 2);
    park.receiveShadow = true;
    scene.add(park);
    // parapet wall along Morningside Dr
    slab(MP.x0, MP.x0 + 1.5, MP.z0, MP.z1, 0, 1.4, mat(0x8c8579));
    for (let i = 0; i < 160; i++) {
      const x = between(MP.x0 + 30, MP.x1 - 6);
      const z = between(MP.z0 + 6, MP.z1 - 6);
      if (Math.hypot(x - 345, z - (streetZ(112) - 30)) < 26) continue;
      trees(x, z, between(1, 1.5), parkH(x));
    }
    for (let i = 0; i < 40; i++) { const z = between(MP.z0, MP.z1); trees(between(267, 290), z, between(0.9, 1.3), parkH(between(270, 288)) * 0.6); }
  }

  // ----- Riverside Park, Henry Hudson Pkwy and the Hudson ----------------------
  const rpH = (x) => (x > -410 ? 0 : x > -458 ? -7 * THREE.MathUtils.smoothstep(-x, 410, 458) : -7);
  {
    const x0 = HUDSON_X, x1 = RIVERSIDE_W;
    const g = new THREE.PlaneGeometry(x1 - x0, 2400, 50, 60);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, rpH(pos.getX(i) + (x0 + x1) / 2));
    g.computeVertexNormals();
    const rp = new THREE.Mesh(g, mat(0x5f8c3e, { roughness: 1 }));
    rp.position.set((x0 + x1) / 2, 0.01, 0);
    rp.receiveShadow = true;
    scene.add(rp);
    const pk = new THREE.Mesh(new THREE.PlaneGeometry(22, 2400), mat(0x4a4c50, { map: roadTex }));
    pk.rotation.x = -Math.PI / 2;
    pk.position.set(PARKWAY_X, -6.9, 0);
    scene.add(pk);
    const prom = new THREE.Mesh(new THREE.PlaneGeometry(22, 2400), mat(0xb4ab98));
    prom.rotation.x = -Math.PI / 2;
    prom.position.set(HUDSON_X + 12, -6.88, 0);
    scene.add(prom);
    for (let i = 0; i < 380; i++) {
      const x = between(-455, -405);
      trees(x, between(-1150, 1150), between(1, 1.5), rpH(x));
    }
    for (let z = -1150; z < 1150; z += 14) trees(-495, z + between(-3, 3), 1, -7);
  }
  const waterU = { uTime: { value: 0 }, uSun: { value: sunDir }, uDeep: { value: new THREE.Color(0x1d4a5e) }, uSky: { value: new THREE.Color(0x8fbfe6) }, fogColor: { value: scene.fog.color }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterU, fog: true,
    vertexShader: 'varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: `uniform float uTime; uniform vec3 uSun,uDeep,uSky; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return sin(dot(p,vec2(0.08,0.06))*1.3+uTime*1.1)+0.6*sin(dot(p,vec2(-0.05,0.09))*2.1+uTime*1.7)+0.3*sin(dot(p,vec2(0.02,-0.1))*3.7+uTime*2.3); }
      void main(){ vec2 p=vW.xz; float e=0.5; float h0=h(p);
        vec3 n=normalize(vec3(-(h(p+vec2(e,0.0))-h0)/e*0.25,1.0,-(h(p+vec2(0.0,e))-h0)/e*0.25));
        vec3 v=normalize(cameraPosition-vW); float fres=pow(1.0-max(dot(n,v),0.0),3.0);
        vec3 col=mix(uDeep,uSky,0.2+0.65*fres);
        col+=vec3(1.0,0.95,0.85)*pow(max(dot(reflect(-uSun,n),v),0.0),160.0)*1.5;
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const hudson = new THREE.Mesh(new THREE.PlaneGeometry(1300, 9000), waterMat);
  hudson.rotation.x = -Math.PI / 2;
  hudson.position.set(HUDSON_X - 650, -8.5, 0);
  scene.add(hudson);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 40), waterMat);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(20, 14, 1);
  pond.position.set(345, parkH(345) + 0.4, streetZ(112) - 30);
  scene.add(pond);
  updaters.push((dt, t) => (waterU.uTime.value = t));
  // New Jersey Palisades across the river
  {
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(220, 110, 9000), mat(0x6b6253, { roughness: 1 }));
    cliff.position.set(HUDSON_X - 1300 - 110, 46, 0);
    scene.add(cliff);
    const top = new THREE.Mesh(new THREE.BoxGeometry(500, 20, 9000), mat(0x4a6b34, { roughness: 1 }));
    top.position.set(HUDSON_X - 1300 - 300, 108, 0);
    scene.add(top);
  }

  // ----- Subway entrances ---------------------------------------------------------
  for (const n of [110, 116]) {
    for (const s of [-1, 1]) {
      const x = -150 + s * (22.5 + 2.6);
      const z = streetZ(n) + (n === 110 ? -1 : 1) * 16;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 6), mat(0x2e5a3c, { metalness: 0.5 }));
      rail.position.set(x, 0.7, z);
      scene.add(rail);
      for (const k of [-1, 1]) {
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), mat(0x3fbf5f, { emissive: 0x2a9a47, emissiveIntensity: 0.8 }));
        globe.position.set(x + k * 1.1, 2.8, z - 3);
        scene.add(globe);
      }
    }
  }

  // Finalise merged / instanced geometry
  scene.add(sidewalk.mesh(mat(0xbcb6aa, { roughness: 0.95 }), { cast: false }));
  scene.add(medianB.mesh(mat(0x6b8a4a, { roughness: 1 }), { cast: false }));
  for (const f of facades) scene.add(f.builder.mesh(new THREE.MeshStandardMaterial({ map: f.tex, roughness: 0.88 })));
  scene.add(roofs.mesh(mat(0x77736d, { roughness: 1 }), { cast: false }));
  scene.add(shops.mesh(new THREE.MeshStandardMaterial({ map: storefrontTex, roughness: 0.5 }), { cast: false }));
  cornices.build(scene);
  tankI.build(scene);
  tankRoofI.build(scene);
  standI.build(scene);
  bulkI.build(scene);
  awningI.build(scene);
  treeTrunkI.build(scene);
  treeTopI.build(scene);
  lampI.build(scene);
  lampHeadI.build(scene, { cast: false });
  signalPoleI.build(scene);
  signalI.build(scene, { cast: false });
  stripeI.build(scene, { cast: false });
  yellowI.build(scene, { cast: false });
  parkedBodyI.build(scene);
  parkedCabinI.build(scene, { cast: false });
  benchI.build(scene, { cast: false });

  // ----- Place labels (minor ones only appear when zoomed in) ----------------------
  const placeLabels = [];
  [
    ['COLUMBIA UNIVERSITY', -16, 75, -200],
    ['Low Library', -16, 62, -262],
    ['Butler Library', -16, 40, -48],
    ['College Walk', -60, 8, streetZ(116)],
    ['BARNARD COLLEGE', -215, 40, -330],
    ['CATHEDRAL OF ST. JOHN THE DIVINE', 190, 80, streetZ(112)],
    ['MORNINGSIDE PARK', 335, 20, streetZ(116)],
    ['RIVERSIDE PARK', -440, 20, streetZ(113)],
    ['HUDSON RIVER', -800, 10, streetZ(113)],
    ['116 St–Columbia Univ (1)', -150, 10, streetZ(116) + 16],
    ['Cathedral Pkwy–110 St (1)', -150, 10, streetZ(110) - 16],
  ].forEach(([text, x, y, z]) => {
    const big = text === text.toUpperCase();
    const s = textSprite(text, { color: big ? '#ffffff' : '#f7f3e8', bg: null, size: big ? 0.03 : 0.022, weight: big ? 800 : 600 });
    s.position.set(x, y, z);
    s.userData.minor = !big;
    scene.add(s);
    placeLabels.push(s);
  });

  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  // ----- Traffic signals (part of the simulation) ---------------------------------
  // Each junction runs a fixed cycle; offsets make a "green wave" up the avenues.
  // ns = avenue traffic (uptown/downtown), ew = street traffic (crosstown).
  const CYCLE = 70;
  const signalState = (j, t) => {
    const k = (((t + j.offset) % CYCLE) + CYCLE) % CYCLE;
    return {
      ns: k < 32 ? 'green' : k < 35 ? 'yellow' : 'red',
      ew: k >= 37 && k < 64 ? 'green' : k >= 64 && k < 67 ? 'yellow' : 'red',
    };
  };
  const lampGeo = new THREE.SphereGeometry(0.45, 10, 8);
  const lampNS = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), junctions.length);
  const lampEW = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), junctions.length);
  junctions.forEach((j, i) => {
    m4.makeTranslation(j.x - j.w / 2 - 1, 6.7, j.z - j.sw / 2 - 1);
    lampNS.setMatrixAt(i, m4);
    m4.makeTranslation(j.x + j.w / 2 + 1, 6.7, j.z + j.sw / 2 + 1);
    lampEW.setMatrixAt(i, m4);
  });
  scene.add(lampNS, lampEW);
  const LIGHT = { green: new THREE.Color(0x22e05a), yellow: new THREE.Color(0xffc21a), red: new THREE.Color(0xff2a1a) };
  let simT = 0; // simulated seconds
  let lampTimer = 0;
  function paintSignals() {
    junctions.forEach((j, i) => {
      const s = signalState(j, simT);
      lampNS.setColorAt(i, LIGHT[s.ns]);
      lampEW.setColorAt(i, LIGHT[s.ew]);
    });
    lampNS.instanceColor.needsUpdate = true;
    lampEW.instanceColor.needsUpdate = true;
  }
  paintSignals();

  // ----- Vehicles (instanced; car-following, signals, yielding) --------------------
  const lanes = [];
  for (const a of AVENUES) {
    const zA = streetZ(127), zB = streetZ(101);
    if (a.oneWay) {
      lanes.push({ axis: 'z', ave: a.id, c: a.x - 5, a: zB, b: zA, count: 20, speed: 10, bus: true });
      lanes.push({ axis: 'z', ave: a.id, c: a.x + 2, a: zB, b: zA, count: 18, speed: 11 });
    } else {
      const off = a.median ? a.median / 2 + 4 : a.w / 4;
      const z0 = a.id === 'claremont' ? streetZ(116) : zB;
      const count = a.median ? 22 : a.id === 'claremont' ? 3 : 8;
      lanes.push({ axis: 'z', ave: a.id, c: a.x + off, a: z0, b: zA, count, speed: 11, bus: !!a.median });
      lanes.push({ axis: 'z', ave: a.id, c: a.x - off, a: zA, b: z0, count, speed: 11, bus: !!a.median });
    }
  }
  for (const [n, x0, x1, cnt] of [[110, -390, 690, 10], [111, -390, 110, 4], [112, -390, 110, 5], [113, -390, 255, 6], [114, -390, 255, 6], [115, -390, -150, 3], [116, -390, -150, 3], [118, 110, 255, 3], [120, -390, 255, 6]]) {
    const dir = n % 2 === 0 ? 1 : -1; // even streets eastbound, odd westbound
    lanes.push({ axis: 'x', n, c: streetZ(n) + (n === 110 ? 4 : 2) * (dir > 0 ? 1 : -1), a: dir > 0 ? x0 : x1, b: dir > 0 ? x1 : x0, count: cnt, speed: 8 });
    if (n === 110) lanes.push({ axis: 'x', n, c: streetZ(n) - 4, a: x1, b: x0, count: cnt, speed: 8 });
  }
  lanes.push({ axis: 'z', c: PARKWAY_X - 5, a: -1500, b: 1500, count: 14, speed: 22, y: -6.9 });
  lanes.push({ axis: 'z', c: PARKWAY_X + 5, a: 1500, b: -1500, count: 14, speed: 22, y: -6.9 });
  for (const ln of lanes) {
    ln.dir = Math.sign(ln.b - ln.a);
    ln.L = Math.abs(ln.b - ln.a);
    // junctions this lane passes through, as distances along the lane
    ln.stops = junctions
      .filter((j) => (ln.axis === 'z' ? j.ave === ln.ave : j.n === ln.n))
      .map((j) => ({ j, at: ((ln.axis === 'z' ? j.z : j.x) - ln.a) * ln.dir, half: ln.axis === 'z' ? j.sw / 2 + 5 : j.w / 2 + 4 }))
      .filter((s) => s.at > 0 && s.at < ln.L)
      .sort((p, q) => p.at - q.at);
  }
  // Vehicle pools: twice the default count of cars/taxis/buses, plus scooters & bikes on city
  // streets. Only the first N of each pool are active, so the population can be changed live.
  const movers = [];
  const carPool = [];
  const scooterPool = [];
  const SCOOTER_COLORS = [0xd1342f, 0x1b6fb5, 0x2e2e2e, 0xf2f2f2, 0x2f7d4f, 0xf2994a];
  for (const ln of lanes) {
    ln.movers = [];
    const nCars = ln.count * 2;
    for (let i = 0; i < nCars; i++) {
      const kind = ln.bus && i % 7 === 0 ? 'bus' : rand() < 0.33 ? 'cab' : 'car';
      const mv = { ln, kind, pool: 'car', active: false, len: kind === 'bus' ? 12 : 4.5, wid: kind === 'bus' ? 2.5 : 1.85, s: rand() * ln.L, base: ln.speed * between(0.85, 1.15), v: 0, gap: Infinity, state: 'ok', x: 0, z: -1e5, color: kind === 'cab' ? 0xf2c218 : kind === 'bus' ? 0x2a5caa : pick(CAR_COLORS) };
      movers.push(mv);
      ln.movers.push(mv);
      carPool.push(mv);
    }
    if (ln.y) continue; // no scooters on the parkway
    const nSc = Math.ceil(ln.count * 1.2);
    for (let i = 0; i < nSc; i++) {
      const kind = rand() < 0.55 ? 'scooter' : 'bicycle';
      const mv = { ln, kind, pool: 'scooter', active: false, len: 1.9, wid: 0.8, s: rand() * ln.L, base: (kind === 'scooter' ? 8 : 5) * between(0.85, 1.15), v: 0, gap: Infinity, state: 'ok', x: 0, z: -1e5, color: pick(SCOOTER_COLORS) };
      movers.push(mv);
      ln.movers.push(mv);
      scooterPool.push(mv);
    }
  }
  // spread activation across lanes: interleave by shuffling
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  shuffle(carPool);
  shuffle(scooterPool);
  const population = { cars: Math.round(carPool.length / 2), scooters: Math.round(scooterPool.length * 0.35), people: 560 };
  function applyVehiclePopulation() {
    carPool.forEach((m, i) => activate(m, i < population.cars));
    scooterPool.forEach((m, i) => activate(m, i < population.scooters));
  }
  function activate(m, on) {
    if (m.active === on) return;
    m.active = on;
    if (on) {
      // enter the street in the largest free gap of its lane
      const others = m.ln.movers.filter((o) => o.active && o !== m).map((o) => o.s).sort((p2, q2) => p2 - q2);
      if (others.length) {
        let best = 0, bestGap = -1;
        for (let i = 0; i < others.length; i++) {
          const gapLen = ((others[(i + 1) % others.length] - others[i] + m.ln.L) % m.ln.L) || m.ln.L;
          if (gapLen > bestGap) { bestGap = gapLen; best = others[i]; }
        }
        m.s = (best + bestGap / 2) % m.ln.L;
      }
      m.v = m.base * 0.6;
    } else {
      m.z = -1e5;
    }
  }
  const cars = movers.filter((m) => m.pool === 'car' && m.kind !== 'bus');
  const buses = movers.filter((m) => m.kind === 'bus');
  const scooters = movers.filter((m) => m.pool === 'scooter');
  const scBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 1.75), mat(0xffffff, { roughness: 0.4, metalness: 0.3 }), scooters.length);
  const scRider = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.7, 0.32), mat(0x26303a), scooters.length);
  const scHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 10, 8), mat(0x1d1d1f), scooters.length);
  scooters.forEach((c, i) => scBody.setColorAt(i, col.set(c.color)));
  [scBody, scRider, scHead].forEach((im) => { im.castShadow = true; im.frustumCulled = false; scene.add(im); });
  applyVehiclePopulation();
  const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1.85, 0.85, 4.5), mat(0xffffff, { roughness: 0.35, metalness: 0.35 }), cars.length);
  const carCabin = new THREE.InstancedMesh(new THREE.BoxGeometry(1.65, 0.62, 2.3), mat(0x26303a, { roughness: 0.2, metalness: 0.5 }), cars.length);
  const carWheels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.95, 0.7, 0.7), mat(0x151515), cars.length * 2);
  const cabSign = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.25, 0.3), mat(0xffffff, { emissive: 0xffffaa, emissiveIntensity: 0.3 }), cars.length);
  const busBody = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 2.8, 12), mat(0xffffff, { roughness: 0.35, metalness: 0.3 }), Math.max(1, buses.length));
  const busWin = new THREE.InstancedMesh(new THREE.BoxGeometry(2.55, 0.9, 10.5), mat(0x1f2730, { roughness: 0.2, metalness: 0.5 }), Math.max(1, buses.length));
  cars.forEach((c, i) => carBody.setColorAt(i, col.set(c.color)));
  buses.forEach((b, i) => busBody.setColorAt(i, col.set(b.color)));
  [carBody, carCabin, carWheels, busBody, busWin].forEach((im) => { im.castShadow = true; im.frustumCulled = false; scene.add(im); });
  cabSign.frustumCulled = false;
  scene.add(cabSign);

  // Boundaries ("too close" zones) drawn on the ground around vehicles and people.
  const ringGeo = new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);
  const bMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const vRing = new THREE.InstancedMesh(ringGeo, bMat(), movers.length);
  const vDisc = new THREE.InstancedMesh(discGeo, Object.assign(bMat(), { opacity: 0.18 }), movers.length);
  [vRing, vDisc].forEach((im) => { im.frustumCulled = false; im.renderOrder = 3; scene.add(im); });
  const STATE_COLOR = { ok: new THREE.Color(0x2ecc71), close: new THREE.Color(0xf5a623), danger: new THREE.Color(0xe8352a), signal: new THREE.Color(0x4a90e2) };
  let showBoundaries = true;

  // obstacles the traffic must respect (pedestrians in the road, delivery riders)
  let externalObstacles = [];
  const roadPeds = [];

  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const ps = new THREE.Vector3();
  function stepTraffic(dt) {
    const obstacles = [...roadPeds, ...externalObstacles];
    for (const ln of lanes) {
      const arr = ln.movers.filter((m) => m.active);
      arr.sort((p, q2) => p.s - q2.s);
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        const leader = arr.length > 1 ? arr[(i + 1) % arr.length] : null;
        let gapCar = leader ? ((leader.s - m.s + ln.L) % ln.L) - (leader.len + m.len) / 2 : Infinity;
        // red / yellow light ahead: treat the stop line as an obstacle
        let gapSignal = Infinity;
        for (const st of ln.stops) {
          const ahead = st.at - st.half - m.s - m.len / 2;
          if (ahead < -1) continue;
          if (ahead > 60) break;
          const s = signalState(st.j, simT)[ln.axis === 'z' ? 'ns' : 'ew'];
          if (s === 'red' || (s === 'yellow' && ahead > m.v * 1.2)) gapSignal = ahead;
          break;
        }
        // people or riders in the lane ahead
        let gapObs = Infinity;
        const px = ln.axis === 'z' ? ln.c : ln.a + ln.dir * m.s;
        const pz = ln.axis === 'z' ? ln.a + ln.dir * m.s : ln.c;
        for (const o of obstacles) {
          const along = ((ln.axis === 'z' ? o.z - pz : o.x - px) * ln.dir);
          const lat = Math.abs(ln.axis === 'z' ? o.x - ln.c : o.z - ln.c);
          if (lat < m.wid / 2 + 0.9 && along > 0 && along < 40) gapObs = Math.min(gapObs, along - m.len / 2 - 1);
        }
        const gapDyn = Math.min(gapCar, gapObs);
        const gap = Math.min(gapDyn, gapSignal);
        const target = Math.max(0, Math.min(m.base, (gap - 2) / 1.2));
        m.v += THREE.MathUtils.clamp(target - m.v, -9 * dt, 2.5 * dt);
        if (gap < 0.3) m.v = 0;
        m.s = (m.s + m.v * dt) % ln.L;
        m.gap = gapDyn;
        m.state = gapDyn < 2 ? 'danger' : gapDyn < 4 + m.v * 1.2 ? 'close' : gapSignal < 25 && m.v < 1 ? 'signal' : 'ok';
        m.x = ln.axis === 'z' ? ln.c : ln.a + ln.dir * m.s;
        m.z = ln.axis === 'z' ? ln.a + ln.dir * m.s : ln.c;
      }
    }
  }
  function drawTraffic() {
    let ci = 0, bi = 0, si = 0;
    movers.forEach((m, k) => {
      if (!m.active) {
        m4.makeScale(0, 0, 0);
        if (m.pool === 'scooter') { scBody.setMatrixAt(si, m4); scRider.setMatrixAt(si, m4); scHead.setMatrixAt(si, m4); si++; }
        else if (m.kind === 'bus') { busBody.setMatrixAt(bi, m4); busWin.setMatrixAt(bi, m4); bi++; }
        else { carBody.setMatrixAt(ci, m4); carCabin.setMatrixAt(ci, m4); carWheels.setMatrixAt(ci * 2, m4); carWheels.setMatrixAt(ci * 2 + 1, m4); cabSign.setMatrixAt(ci, m4); ci++; }
        vRing.setMatrixAt(k, m4);
        vDisc.setMatrixAt(k, m4);
        return;
      }
      const ry = m.ln.axis === 'z' ? (m.ln.dir > 0 ? 0 : Math.PI) : m.ln.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      q.setFromAxisAngle(up, ry);
      const y = m.ln.y || 0;
      const fwd = (o) => [Math.sin(ry) * o, Math.cos(ry) * o];
      if (m.pool === 'scooter') {
        m4.compose(ps.set(m.x, y + 0.6, m.z), q, sc.set(1, 1, m.kind === 'bicycle' ? 0.9 : 1));
        scBody.setMatrixAt(si, m4);
        m4.compose(ps.set(m.x, y + 1.3, m.z), q, sc.set(1, 1, 1));
        scRider.setMatrixAt(si, m4);
        m4.compose(ps.set(m.x, y + 1.85, m.z), q, sc.set(1, 1, 1));
        scHead.setMatrixAt(si, m4);
        si++;
      } else if (m.kind === 'bus') {
        m4.compose(ps.set(m.x, y + 1.75, m.z), q, sc.set(1, 1, 1));
        busBody.setMatrixAt(bi, m4);
        m4.compose(ps.set(m.x, y + 2.4, m.z), q, sc.set(1, 1, 1));
        busWin.setMatrixAt(bi, m4);
        bi++;
      } else {
        m4.compose(ps.set(m.x, y + 0.78, m.z), q, sc.set(1, 1, 1));
        carBody.setMatrixAt(ci, m4);
        const [cx, cz] = fwd(-0.2);
        m4.compose(ps.set(m.x + cx, y + 1.5, m.z + cz), q, sc.set(1, 1, 1));
        carCabin.setMatrixAt(ci, m4);
        for (const [w, o] of [[0, 1.25], [1, -1.25]]) {
          const [wx, wz] = fwd(o);
          m4.compose(ps.set(m.x + wx, y + 0.35, m.z + wz), q, sc.set(1, 1, 1));
          carWheels.setMatrixAt(ci * 2 + w, m4);
        }
        m4.compose(ps.set(m.x + cx, m.kind === 'cab' ? y + 1.95 : -50, m.z + cz), q, sc.set(1, 1, 1));
        cabSign.setMatrixAt(ci, m4);
        ci++;
      }
      // boundary: an ellipse around the footprint plus a buffer
      m4.compose(ps.set(m.x, y + 0.22, m.z), q, sc.set(showBoundaries ? m.wid / 2 + 1.3 : 0, 1, showBoundaries ? m.len / 2 + 1.8 : 0));
      vRing.setMatrixAt(k, m4);
      vDisc.setMatrixAt(k, m4);
      vRing.setColorAt(k, STATE_COLOR[m.state]);
      vDisc.setColorAt(k, STATE_COLOR[m.state]);
    });
    [carBody, carCabin, carWheels, cabSign, busBody, busWin, scBody, scRider, scHead, vRing, vDisc].forEach((im) => (im.instanceMatrix.needsUpdate = true));
    vRing.instanceColor.needsUpdate = vDisc.instanceColor.needsUpdate = true;
  }

  // ----- Pedestrians (walk sidewalks, wait for the walk signal, cross at crosswalks) -----
  const peds = [];
  const sideHasStreet = (n, a, side) => {
    const aves = avesAt(n);
    const i = aves.indexOf(a);
    const other = aves[i + side];
    return !!other && streetKind(n, side < 0 ? other : a, side < 0 ? a : other) === 'road';
  };
  const jAt = (aveId, n) => junctions.find((j) => j.ave === aveId && j.n === n);
  for (let i = 0; i < 1100; i++) {
    const r = rand();
    let p;
    if (r < 0.1) {
      const z = streetZ(116) + between(-6, 6);
      p = { axis: 'x', c: z, lo: -120, hi: 90, y: 0.6, crossings: [] };
    } else if (r < 0.62) {
      // along an avenue sidewalk, crossing side streets
      const a = pick(AVENUES.filter((v) => v.id !== 'claremont'));
      const side = rand() < 0.5 ? -1 : 1;
      const n0 = Math.floor(between(Math.max(a.from, 108), Math.min(a.to, 118)));
      const span = 1 + Math.floor(rand() * 3);
      const x = a.x + side * (a.w / 2 + between(1.4, 3.6));
      const crossings = [];
      for (let n = n0 + 1; n < n0 + span; n++) {
        if (!sideHasStreet(n, a, side)) continue;
        const j = jAt(a.id, n);
        if (j) crossings.push({ lo: streetZ(n) - streetWidth(n) / 2 - 1.2, hi: streetZ(n) + streetWidth(n) / 2 + 1.2, kind: 'ns', j });
      }
      p = { axis: 'z', c: x, lo: streetZ(n0 + span) + 10, hi: streetZ(n0) - 10, y: 0.16, crossings };
    } else {
      // along a street sidewalk, crossing an avenue
      const n = 108 + Math.floor(rand() * 13);
      const aves = avesAt(n);
      const k = Math.floor(rand() * (aves.length - 1));
      const A = aves[k], B = aves[k + 1];
      if (streetKind(n, A, B) !== 'road') { i--; continue; }
      const side = rand() < 0.5 ? -1 : 1;
      const z = streetZ(n) + side * (streetWidth(n) / 2 + between(1.4, 3.2));
      const crossings = [];
      let lo = A.x + A.w / 2 + 3, hi = B.x - B.w / 2 - 3;
      const C = aves[k + 2];
      if (C && streetKind(n, B, C) === 'road') {
        hi = Math.min(B.x + B.w / 2 + 60, C.x - C.w / 2 - 3);
        const j = jAt(B.id, n);
        if (j) crossings.push({ lo: B.x - B.w / 2 - 1.2, hi: B.x + B.w / 2 + 1.2, kind: 'ew', j });
      }
      p = { axis: 'x', c: z, lo, hi, y: 0.16, crossings };
    }
    p.pos = between(p.lo, p.hi);
    p.dir = rand() < 0.5 ? -1 : 1;
    p.speed = between(1.1, 1.6);
    p.jay = rand() < 0.04; // a few people cross against the light
    p.waiting = false;
    p.inRoad = false;
    p.near = Infinity;
    peds.push(p);
  }
  const PED = peds.length;
  const pedBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 1.0, 3, 8), mat(0xffffff), PED);
  const pedHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), mat(0xffffff), PED);
  const pRing = new THREE.InstancedMesh(ringGeo, bMat(), PED);
  [pedBody, pedHead, pRing].forEach((im) => { im.frustumCulled = false; scene.add(im); });
  pedBody.castShadow = true;
  pRing.renderOrder = 3;
  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const CLOTH = [0x1d1d1f, 0x2f4f7f, 0x7d1e1e, 0x5c6b59, 0xc2b59b, 0x8b6fae, 0xd97a2b, 0x9fb7c9, 0x6d6d6d, 0x1f6f8b];
  peds.forEach((p, i) => { pedBody.setColorAt(i, col.set(pick(CLOTH))); pedHead.setColorAt(i, col.set(pick(SKIN))); });

  const activePeds = () => peds.slice(0, population.people);
  function stepPeds(dt) {
    roadPeds.length = 0;
    for (const p of activePeds()) {
      let next = p.pos + p.dir * p.speed * dt;
      p.waiting = false;
      for (const c of p.crossings) {
        const entering = p.dir > 0 ? p.pos <= c.lo && next > c.lo : p.pos >= c.hi && next < c.hi;
        if (entering && !p.jay && signalState(c.j, simT)[c.kind] !== 'green') { next = p.pos; p.waiting = true; }
      }
      if (next > p.hi || next < p.lo) { p.dir = -p.dir; next = THREE.MathUtils.clamp(next, p.lo, p.hi); }
      p.pos = next;
      p.inRoad = p.crossings.some((c) => p.pos > c.lo + 1 && p.pos < c.hi - 1);
      p.x = p.axis === 'z' ? p.c : p.pos;
      p.z = p.axis === 'z' ? p.pos : p.c;
      if (p.inRoad) roadPeds.push(p);
    }
  }
  function drawPeds(t) {
    peds.forEach((p, i) => {
      if (i >= population.people) {
        m4.makeScale(0, 0, 0);
        pedBody.setMatrixAt(i, m4);
        pedHead.setMatrixAt(i, m4);
        pRing.setMatrixAt(i, m4);
        return;
      }
      const bob = p.waiting ? 0 : Math.abs(Math.sin(t * 8 + i)) * 0.05;
      m4.makeTranslation(p.x, p.y + 0.74 + bob, p.z);
      pedBody.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, p.y + 1.62 + bob, p.z);
      pedHead.setMatrixAt(i, m4);
      const s = showBoundaries ? 0.9 : 0;
      m4.compose(ps.set(p.x, p.y + 0.05, p.z), q.identity(), sc.set(s, 1, s));
      pRing.setMatrixAt(i, m4);
      pRing.setColorAt(i, p.near < 2 ? STATE_COLOR.danger : p.inRoad || p.near < 4 ? STATE_COLOR.close : p.waiting ? STATE_COLOR.signal : STATE_COLOR.ok);
    });
    pedBody.instanceMatrix.needsUpdate = pedHead.instanceMatrix.needsUpdate = pRing.instanceMatrix.needsUpdate = true;
    pRing.instanceColor.needsUpdate = true;
  }
  // people standing in the road are flagged if a vehicle is close
  function pedDanger() {
    for (const p of activePeds()) {
      p.near = Infinity;
      if (!p.inRoad) continue;
      for (const m of movers) {
        if (!m.active) continue;
        const d = Math.hypot(m.x - p.x, m.z - p.z) - m.len / 2;
        if (d < p.near) p.near = d;
      }
    }
  }

  updaters.push((dt, t, dtSim) => {
    // sub-step so fast-forward stays stable
    const steps = Math.min(8, Math.max(1, Math.ceil(dtSim / 0.2)));
    for (let k = 0; k < steps; k++) {
      simT += dtSim / steps;
      stepPeds(dtSim / steps);
      stepTraffic(dtSim / steps);
    }
    pedDanger();
    drawTraffic();
    drawPeds(t);
    lampTimer += dt;
    if (lampTimer > 0.25) { lampTimer = 0; paintSignals(); }
    occupants.vehicles.length = 0;
    for (const m of movers) if (m.active) occupants.vehicles.push({ x: m.x, z: m.z });
    occupants.people.length = 0;
    for (const p of activePeds()) occupants.people.push({ x: p.x, z: p.z });
  });

  // ----- Perception: what an agent at (x, z) can sense -------------------------------
  function perceive(x, z, R, heading = null) {
    const out = { vehicles: [], people: [], buildings: [], signals: [], trees: [], lamps: [] };
    for (const m of movers) {
      if (!m.active) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < R + m.len / 2) out.vehicles.push({ kind: m.kind, x: m.x, z: m.z, d: Math.max(0, d - m.len / 2 + 0.3), v: m.v });
    }
    for (const p of activePeds()) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < R) out.people.push({ x: p.x, z: p.z, d: Math.max(0, d - 0.3), inRoad: p.inRoad, waiting: p.waiting });
    }
    for (const b of staticIndex.query(x, z, R, 'building')) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      const d = Math.hypot(dx, dz);
      if (d < R) out.buildings.push({ d, x: THREE.MathUtils.clamp(x, b.x0, b.x1), z: THREE.MathUtils.clamp(z, b.z0, b.z1), name: b.name });
    }
    for (const kind of ['tree', 'lamp']) {
      for (const o of staticIndex.query(x, z, R, kind)) {
        const d = Math.hypot(o.x - x, o.z - z);
        if (d < R) out[kind + 's'].push({ d, x: o.x, z: o.z });
      }
    }
    for (const j of junctions) {
      const d = Math.hypot(j.x - x, j.z - z);
      if (d < R + 25) {
        const s = signalState(j, simT);
        let facing = null;
        if (heading) {
          const along = (j.x - x) * heading.x + (j.z - z) * heading.z;
          facing = along > 0 ? (Math.abs(heading.z) > Math.abs(heading.x) ? s.ns : s.ew) : null;
        }
        out.signals.push({ d, x: j.x, z: j.z, name: j.name, ns: s.ns, ew: s.ew, facing });
      }
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.d - b.d);
    return out;
  }

  // The next junction ahead of a moving agent, with its light and the distance to the stop line.
  function signalAhead(x, z, heading, range = 50) {
    let best = null;
    const ns = Math.abs(heading.z) > Math.abs(heading.x);
    for (const j of junctions) {
      const along = (j.x - x) * heading.x + (j.z - z) * heading.z;
      const lat = Math.abs((j.x - x) * heading.z - (j.z - z) * heading.x);
      const half = ns ? j.sw / 2 + 4 : j.w / 2 + 3;
      if (lat > (ns ? j.w / 2 + 6 : j.sw / 2 + 6) || along - half < -1.5 || along > range) continue;
      if (!best || along < best.along) best = { j, along, stop: along - half, state: signalState(j, simT)[ns ? 'ns' : 'ew'], name: j.name };
    }
    return best;
  }

  // ----- Animals: gulls over the Hudson, pigeons on College Walk, ducks on the pond -----
  const gullMat = mat(0xf4f4f4);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 5), gullMat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const wings = [-1, 1].map((s) => {
      const p = new THREE.Group();
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), gullMat);
      w.position.x = s * 0.8;
      p.add(w);
      g.add(p);
      return [p, s];
    });
    scene.add(g);
    const c = i < 7 ? { x: -560, z: streetZ(113), r: 80 } : { x: -16, z: -200, r: 120 };
    const r = c.r + between(-25, 25), h = between(30, 60), sp = between(0.08, 0.16), ph = rand() * 6;
    updaters.push((dt, t) => {
      const a = t * sp + ph;
      g.position.set(c.x + Math.cos(a) * r, h + Math.sin(t + ph) * 3, c.z + Math.sin(a) * r);
      g.rotation.y = -a;
      wings.forEach(([p, s]) => (p.rotation.z = s * Math.sin(t * 7 + ph) * 0.6));
    });
  }
  const pigeons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0x7d8088), 40);
  const pig = Array.from({ length: 40 }, () => ({ x: between(-60, 30), z: streetZ(116) + between(-5, 5), ph: rand() * 6 }));
  scene.add(pigeons);
  updaters.push((dt, t) => {
    pig.forEach((p, i) => {
      p.x += Math.sin(t * 0.5 + p.ph) * dt * 0.4;
      m4.makeTranslation(p.x, 0.8 + Math.max(0, Math.sin(t * 3 + p.ph)) * 0.06, p.z);
      pigeons.setMatrixAt(i, m4);
    });
    pigeons.instanceMatrix.needsUpdate = true;
  });
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat(i % 2 ? 0x8a7a66 : 0x6b5a44));
    b.scale.set(0.8, 0.6, 1.2);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(i % 2 ? 0x1f6b3a : 0x7a6249));
    hd.position.set(0, 0.3, 0.35);
    d.add(b, hd);
    scene.add(d);
    const ph = rand() * 6, k = between(0.3, 0.75);
    updaters.push((dt, t) => {
      const a = t * 0.12 + ph;
      d.position.set(345 + Math.cos(a) * 20 * k, parkH(345) + 0.55, streetZ(112) - 30 + Math.sin(a) * 14 * k);
      d.rotation.y = -a;
    });
  }

  return {
    occupants,
    groundAt: (x, z) => {
      const zn = zoneAt(x, z);
      if (zn?.id === 'morningsidePark') return parkH(x);
      if (zn?.id === 'columbia') return 0.6;
      if (x < RIVERSIDE_W) return rpH(x);
      return 0.16;
    },
    perceive,
    signalAhead,
    setObstacles(list) { externalObstacles = list; },
    setBoundaries(on) { showBoundaries = on; },
    get simTime() { return simT; },
    // Street population controls
    population: () => ({ ...population, max: { cars: carPool.length, scooters: scooterPool.length, people: peds.length } }),
    setPopulation(next) {
      Object.assign(population, next);
      population.cars = THREE.MathUtils.clamp(Math.round(population.cars), 0, carPool.length);
      population.scooters = THREE.MathUtils.clamp(Math.round(population.scooters), 0, scooterPool.length);
      population.people = THREE.MathUtils.clamp(Math.round(population.people), 0, peds.length);
      applyVehiclePopulation();
    },
    stats() {
      const act = movers.filter((m) => m.active);
      const ap = activePeds();
      return {
        vehicles: act.length,
        cars: act.filter((m) => m.pool === 'car').length,
        scooters: act.filter((m) => m.pool === 'scooter').length,
        stopped: act.filter((m) => m.state === 'signal').length,
        close: act.filter((m) => m.state === 'close').length,
        danger: act.filter((m) => m.state === 'danger').length,
        people: ap.length,
        crossing: ap.filter((p) => p.inRoad).length,
        waiting: ap.filter((p) => p.waiting).length,
        jaywalking: ap.filter((p) => p.inRoad && p.jay).length,
        pedsAtRisk: ap.filter((p) => p.near < 4).length,
        signals: junctions.length,
      };
    },
    update(dt, t, target, dtSim = dt) {
      for (const fn of updaters) fn(dt, t, dtSim);
      for (const l of placeLabels) l.visible = !l.userData.minor || camera.position.distanceTo(l.position) < 650;
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDir, 700);
    },
  };
}
