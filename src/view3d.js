// Three.js view: third-person camera that follows the player through the crossing.
import * as THREE from 'three';
import { N, CELL, T, WORLD } from './env.js';
import { SHIBUYA } from './data.js';
import { KINDS } from './sim.js';

const SKY = 0xcfd8e3;

function label(text, scale = 1) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  ctx.font = 'bold 44px system-ui, sans-serif';
  c.width = Math.ceil(ctx.measureText(text).width) + 40; c.height = 70;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(20,24,32,0.78)'; ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 16); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, 37);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set((c.width / c.height) * 1.6 * scale, 1.6 * scale, 1);
  return s;
}

export function paintGround(ctx, env, px) {
  const { type, mod, params } = env, [a, b] = SHIBUYA.roadBand, s = CELL * px;
  for (let c = 0; c < N * N; c++) {
    const i = c % N, j = (c / N) | 0, t = type[c];
    ctx.fillStyle = t === T.ROAD ? '#3b3f46' : t === T.CROSS ? (params.plaza ? '#d9cdb4' : '#3b3f46')
      : t === T.BUILDING ? '#7d838c' : '#bdb6aa';
    ctx.fillRect(i * s, j * s, s + 0.5, s + 0.5);
    if (mod[c] < 1) { ctx.fillStyle = 'rgba(230,110,40,0.5)'; ctx.fillRect(i * s, j * s, s, s); }
    if (mod[c] > 1) { ctx.fillStyle = 'rgba(50,170,90,0.5)'; ctx.fillRect(i * s, j * s, s, s); }
    if (t === T.CROSS && !params.plaza) {
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, inH = z >= a && z < b, inV = x >= a && x < b;
      ctx.fillStyle = '#e8e8e8';
      for (let k = 0; k < CELL; k++) {
        if (inV && !inH) ctx.fillRect(i * s + k * px + px * 0.25, j * s, px * 0.5, s);
        if (inH && !inV) ctx.fillRect(i * s, j * s + k * px + px * 0.25, s, px * 0.5);
      }
    }
  }
  if (!params.plaza) { // the famous diagonal zebras across the scramble
    ctx.save(); ctx.beginPath(); ctx.rect(a * px, a * px, (b - a) * px, (b - a) * px); ctx.clip();
    ctx.fillStyle = 'rgba(232,232,232,0.9)';
    for (const ang of [Math.PI / 4, -Math.PI / 4]) {
      ctx.save(); ctx.translate(50 * px, 50 * px); ctx.rotate(ang);
      for (let k = -22; k < 22; k++) ctx.fillRect(k * px, -3 * px, px * 0.5, 6 * px);
      ctx.restore();
    }
    ctx.restore();
  }
}

export class View3D {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.fog = new THREE.Fog(SKY, 25, 75); // the player cannot see the whole crossing either
    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(60, 120, 30); this.scene.add(sun);
    this.world = new THREE.Group(); this.scene.add(this.world);

    const body = new THREE.CylinderGeometry(0.28, 0.28, 1.65, 8); body.translate(0, 0.825, 0);
    this.crowd = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial(), 600);
    this.crowd.frustumCulled = false; this.scene.add(this.crowd);

    this.player = new THREE.Group();
    const pm = new THREE.MeshLambertMaterial({ color: KINDS.player.color });
    const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.4, 12), pm); pb.position.y = 0.7;
    const ph = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), pm); ph.position.y = 1.62;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.1, 0.4);
    this.player.add(pb, ph, nose); this.scene.add(this.player);

    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, fog: false, side: THREE.DoubleSide }));
    this.beacon.position.y = 20; this.scene.add(this.beacon);

    this.yaw = -0.7; this.pitch = 0.45; this.dist = 11; this.overview = false;
    let drag = null;
    el.addEventListener('pointerdown', e => (drag = [e.clientX, e.clientY]));
    addEventListener('pointerup', () => (drag = null));
    addEventListener('pointermove', e => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag[0]) * 0.006;
      this.pitch = Math.max(0.1, Math.min(1.4, this.pitch + (e.clientY - drag[1]) * 0.004));
      drag = [e.clientX, e.clientY];
    });
    el.addEventListener('wheel', e => { this.dist = Math.max(4, Math.min(45, this.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
    new ResizeObserver(() => this.resize()).observe(el); this.resize();
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  build(env) {
    this.world.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    this.world.clear();
    // ground (x, z) from the grid
    const px = 10, cv = document.createElement('canvas'); cv.width = cv.height = WORLD * px;
    paintGround(cv.getContext('2d'), env, px);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD / 2, 0, WORLD / 2); this.world.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: 0x9a968e }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(50, -0.02, 50); this.world.add(outer);
    // buildings with approximate real heights (y)
    for (const B of SHIBUYA.buildings) {
      const [x0, z0, x1, z1] = B.rect;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, B.h, z1 - z0), new THREE.MeshLambertMaterial({ color: B.color }));
      m.position.set((x0 + x1) / 2, B.h / 2, (z0 + z1) / 2); this.world.add(m);
      const l = label(`${B.name} · ~${B.h} m`, 1.4);
      l.position.set(Math.max(x0, Math.min(x1, 50)), 14, Math.max(z0, Math.min(z1, 50))); this.world.add(l);
    }
    // obstacles (guard rails) – instanced boxes
    const cells = []; for (let c = 0; c < N * N; c++) if (env.type[c] === T.BARRIER) cells.push(c);
    if (cells.length) {
      const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.9, 1.1, CELL * 0.9),
        new THREE.MeshLambertMaterial({ color: 0xf2c230 }), cells.length);
      const mtx = new THREE.Matrix4();
      cells.forEach((c, k) => { mtx.makeTranslation(((c % N) + 0.5) * CELL, 0.55, (((c / N) | 0) + 0.5) * CELL); bars.setMatrixAt(k, mtx); });
      this.world.add(bars);
    }
    // landmarks
    for (const L of SHIBUYA.landmarks) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2), new THREE.MeshLambertMaterial({ color: 0x6b4fd8 }));
      pole.position.set(L.x, 1.6, L.z); this.world.add(pole);
      const l = label(L.name, 0.4); l.position.set(L.x, 3.8, L.z); this.world.add(l);
    }
    const hachi = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 1.3), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
    hachi.position.set(21, 0.6, 70); this.world.add(hachi);
    // pedestrian signals at the four corners
    const [a, b] = SHIBUYA.roadBand;
    this.lamps = [[a, a], [b, a], [a, b], [b, b]].map(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      pole.position.set(x, 1.5, z); this.world.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial());
      lamp.position.set(x, 3.2, z); this.world.add(lamp); return lamp;
    });
  }

  render(sim) {
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    for (const a of sim.agents) {
      if (a === sim.player || n >= 600) continue;
      m.makeTranslation(a.x, 0, a.z); this.crowd.setMatrixAt(n, m);
      col.set(KINDS[a.kind].color); if (a.waiting) col.multiplyScalar(0.6);
      this.crowd.setColorAt(n++, col);
    }
    this.crowd.count = n; this.crowd.instanceMatrix.needsUpdate = true;
    if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
    for (const l of this.lamps) l.material.color.set(sim.green ? 0x28d16b : 0xe23b3b);

    const p = sim.player;
    this.player.position.set(p.x, 0, p.z); this.player.rotation.y = p.heading;
    this.beacon.position.set(p.goal.x, 20, p.goal.z);
    if (this.overview) {
      this.scene.fog = null;
      this.camera.position.set(50, 115, 105); this.camera.lookAt(50, 0, 48);
    } else {
      this.scene.fog = this.fog;
      const cp = Math.cos(this.pitch);
      this.camera.position.set(p.x + Math.sin(this.yaw) * this.dist * cp, 1.6 + this.dist * Math.sin(this.pitch), p.z + Math.cos(this.yaw) * this.dist * cp);
      this.camera.lookAt(p.x, 1.4, p.z);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
