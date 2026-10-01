// Natural surroundings for the food delivery scene: sky, terrain, lake, trees and animals.
// Purely decorative — nothing here is part of the semantic model.
import * as THREE from 'three';

// Area reserved for the semantic model (kept clear of scenery).
const PLAZA = { minX: -21, maxX: 21, minZ: -19, maxZ: 25 };
const LAKE = { x: 30, z: 10, rx: 7.5, rz: 11 };
const MEADOW = { x: -46, z: 2, w: 18, d: 22 };

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const between = (a, b) => a + (b - a) * rand();

const inPlaza = (x, z, m = 0) => x > PLAZA.minX - m && x < PLAZA.maxX + m && z > PLAZA.minZ - m && z < PLAZA.maxZ + m;
const lakeDist = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
const inMeadow = (x, z, m = 0) => Math.abs(x - MEADOW.x) < MEADOW.w / 2 + m && Math.abs(z - MEADOW.z) < MEADOW.d / 2 + m;
const isClear = (x, z, m = 2) => !inPlaza(x, z, m) && lakeDist(x, z) > 1 + m / 6 && !inMeadow(x, z, m);

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...opts });

// Gentle hills away from the centre; flat where the model, lake and meadow are.
function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const fade = THREE.MathUtils.smoothstep(d, 90, 200);
  return fade * (4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 3 * Math.sin((x + z) * 0.05) + 5);
}

export function createEnvironment({ scene, renderer, camera, sun, hemi }) {
  const updaters = [];

  // ----- Sky ---------------------------------------------------------------
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  camera.far = 6000;
  camera.updateProjectionMatrix();

  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 40), THREE.MathUtils.degToRad(40));
  const makeSky = () => new THREE.Mesh(
    new THREE.SphereGeometry(3000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1f5fbf) },
        uMid: { value: new THREE.Color(0x5c9be0) },
        uHorizon: { value: new THREE.Color(0xc6e0f5) },
        uBottom: { value: new THREE.Color(0xd9e6ee) },
        uSun: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uHorizon, uBottom, uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0
            ? mix(mix(uHorizon, uMid, smoothstep(0.0, 0.25, h)), uTop, smoothstep(0.25, 0.9, h))
            : mix(uHorizon, uBottom, smoothstep(0.0, -0.1, h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 12.0) * 0.25 + pow(s, 300.0) * 0.8);
          col = mix(col, vec3(1.0, 0.98, 0.92), smoothstep(0.9992, 0.9996, s));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(makeSky());

  // Image-based lighting from the sky so materials pick up its colour.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(makeSky());
  scene.environment = pmrem.fromScene(skyScene).texture;
  scene.environmentIntensity = 1;
  scene.background = null;
  scene.fog = new THREE.Fog(0xc6e0f5, 200, 900);

  sun.position.copy(sunDir).multiplyScalar(80);
  sun.color.set(0xfff1dc);
  sun.intensity = 2.6;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  hemi.color.set(0xcfe6ff);
  hemi.groundColor.set(0x6b7d4a);
  hemi.intensity = 1.5;

  // ----- Clouds ------------------------------------------------------------
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 1, flatShading: true, transparent: true, opacity: 0.95, fog: false });
  const clouds = [];
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group();
    const puffs = 5 + Math.floor(rand() * 5);
    for (let p = 0; p < puffs; p++) {
      const s = between(4, 9);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), cloudMat);
      m.position.set(between(-10, 10), between(-1.5, 2.5), between(-5, 5));
      m.scale.y = 0.6;
      c.add(m);
    }
    c.position.set(between(-350, 350), between(70, 120), between(-350, 250));
    c.userData.speed = between(1.5, 4);
    scene.add(c);
    clouds.push(c);
  }
  updaters.push((dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 380) c.position.x = -380;
    }
  });

  // ----- Ground ------------------------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(900, 900, 180, 180);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = [];
  const grassA = new THREE.Color(0x6f9a3e);
  const grassB = new THREE.Color(0x8db352);
  const dry = new THREE.Color(0xa8a15c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13);
    const c = grassA.clone().lerp(grassB, n);
    if (Math.hypot(x, z) > 120) c.lerp(dry, 0.35);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Paved plaza where the semantic model sits.
  const plazaW = PLAZA.maxX - PLAZA.minX;
  const plazaD = PLAZA.maxZ - PLAZA.minZ;
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(plazaW, 0.2, plazaD), mat(0xd8d2c4, { flatShading: false, roughness: 0.95 }));
  plaza.position.set((PLAZA.minX + PLAZA.maxX) / 2, -0.09, (PLAZA.minZ + PLAZA.maxZ) / 2);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const grid = new THREE.GridHelper(Math.max(plazaW, plazaD), Math.max(plazaW, plazaD) / 2, 0xc4bcac, 0xcdc6b7);
  grid.position.copy(plaza.position).setY(0.02);
  grid.scale.set(plazaW / Math.max(plazaW, plazaD), 1, plazaD / Math.max(plazaW, plazaD));
  scene.add(grid);
  const curb = mat(0x9c9486);
  [[plazaW + 0.6, 0.35, 0.3, 0, PLAZA.minZ], [plazaW + 0.6, 0.35, 0.3, 0, PLAZA.maxZ], [0.3, 0.35, plazaD, PLAZA.minX, 3], [0.3, 0.35, plazaD, PLAZA.maxX, 3]].forEach(([w, h, d, x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), curb);
    m.position.set(x, 0.17, z);
    m.receiveShadow = true;
    scene.add(m);
  });

  // Footpath from the plaza to the lake.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(LAKE.x - LAKE.rx - PLAZA.maxX + 1, 2.2), mat(0xcbb994, { flatShading: false }));
  path.rotation.x = -Math.PI / 2;
  path.position.set((PLAZA.maxX + LAKE.x - LAKE.rx) / 2, 0.03, LAKE.z);
  path.receiveShadow = true;
  scene.add(path);

  // ----- Lake --------------------------------------------------------------
  const shore = new THREE.Mesh(new THREE.CircleGeometry(1, 64), mat(0xd6c79a, { flatShading: false }));
  shore.rotation.x = -Math.PI / 2;
  shore.scale.set(LAKE.rx + 1.4, LAKE.rz + 1.4, 1);
  shore.position.set(LAKE.x, 0.02, LAKE.z);
  shore.receiveShadow = true;
  scene.add(shore);

  const waterUniforms = {
    uTime: { value: 0 },
    uSun: { value: sunDir.clone() },
    uDeep: { value: new THREE.Color(0x0f4c5c) },
    uShallow: { value: new THREE.Color(0x3fa7a0) },
    uSky: { value: new THREE.Color(0x8fc0ea) },
    fogColor: { value: scene.fog.color },
    fogNear: { value: scene.fog.near },
    fogFar: { value: scene.fog.far },
  };
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      transparent: true,
      fog: true,
      vertexShader: `
        varying vec3 vWorld; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uSun, uDeep, uShallow, uSky;
        varying vec3 vWorld; varying vec2 vUv;
        #include <fog_pars_fragment>
        float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }
        void main() {
          vec2 p = vWorld.xz;
          float e = 0.05;
          float h0 = wave(p, vec2(0.8, 0.6), 1.3, 1.6) + 0.6 * wave(p, vec2(-0.5, 0.9), 2.1, 2.3) + 0.3 * wave(p, vec2(0.2, -1.0), 3.7, 3.1);
          float hx = wave(p + vec2(e, 0.0), vec2(0.8, 0.6), 1.3, 1.6) + 0.6 * wave(p + vec2(e, 0.0), vec2(-0.5, 0.9), 2.1, 2.3) + 0.3 * wave(p + vec2(e, 0.0), vec2(0.2, -1.0), 3.7, 3.1);
          float hz = wave(p + vec2(0.0, e), vec2(0.8, 0.6), 1.3, 1.6) + 0.6 * wave(p + vec2(0.0, e), vec2(-0.5, 0.9), 2.1, 2.3) + 0.3 * wave(p + vec2(0.0, e), vec2(0.2, -1.0), 3.7, 3.1);
          vec3 n = normalize(vec3(-(hx - h0) / e * 0.06, 1.0, -(hz - h0) / e * 0.06));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float edge = length(vUv - 0.5) * 2.0;
          vec3 col = mix(uDeep, uShallow, smoothstep(0.55, 1.0, edge));
          col = mix(col, uSky, 0.25 + 0.6 * fres);
          vec3 r = reflect(-uSun, n);
          float spec = pow(max(dot(r, v), 0.0), 120.0);
          col += vec3(1.0, 0.95, 0.85) * spec * 1.6;
          gl_FragColor = vec4(col, 0.93);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(LAKE.rx, LAKE.rz, 1);
  water.position.set(LAKE.x, 0.06, LAKE.z);
  scene.add(water);
  updaters.push((dt, t) => (waterUniforms.uTime.value = t));

  // Small wooden jetty.
  const plank = mat(0x8a6440);
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 1.6), plank);
  jetty.position.set(LAKE.x - LAKE.rx + 1.4, 0.35, LAKE.z);
  jetty.castShadow = jetty.receiveShadow = true;
  scene.add(jetty);

  // Reeds and lily pads.
  const reedMat = mat(0x5d7f2e);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) < 0) continue; // keep the jetty side open
    const k = between(0.95, 1.08);
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, between(0.9, 1.8), 4), reedMat);
    reed.position.set(LAKE.x + Math.cos(a) * LAKE.rx * k, 0.5, LAKE.z + Math.sin(a) * LAKE.rz * k);
    reed.rotation.z = between(-0.15, 0.15);
    scene.add(reed);
  }
  const padMat = mat(0x3f7d3a, { side: THREE.DoubleSide });
  const flowerMat = mat(0xf7c6d9);
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const k = between(0.3, 0.8);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(between(0.3, 0.55), 10, 0.3, Math.PI * 1.85), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rand() * 6;
    pad.position.set(LAKE.x + Math.cos(a) * LAKE.rx * k, 0.09, LAKE.z + Math.sin(a) * LAKE.rz * k);
    scene.add(pad);
    if (rand() > 0.5) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), flowerMat);
      f.position.copy(pad.position).setY(0.18);
      scene.add(f);
    }
  }

  // ----- Trees -------------------------------------------------------------
  const trunkMat = mat(0x7a5434);
  const birchMat = mat(0xe8e2d6);
  const leafMats = [0x3f7f3a, 0x4f8f3f, 0x2f6b3a, 0x6a9a3a, 0x356e2f].map((c) => mat(c));
  const autumnMats = [0xd08a2e, 0xc2562f].map((c) => mat(c));
  const swaying = [];

  function pine(h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * h, 0.22 * h, h * 0.5, 6), trunkMat);
    trunk.position.y = h * 0.25;
    g.add(trunk);
    const crown = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.55 - i * 0.13), h * 0.55, 7), leafMats[2]);
      cone.position.y = h * (0.55 + i * 0.28);
      crown.add(cone);
    }
    g.add(crown);
    g.userData.crown = crown;
    return g;
  }
  function broadleaf(h, autumn) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * h, 0.2 * h, h * 0.55, 6), trunkMat);
    trunk.position.y = h * 0.27;
    g.add(trunk);
    const crown = new THREE.Group();
    const m = autumn ? autumnMats[Math.floor(rand() * 2)] : leafMats[Math.floor(rand() * leafMats.length)];
    for (let i = 0; i < 4; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(h * between(0.28, 0.4), 0), m);
      blob.position.set(between(-0.25, 0.25) * h, h * between(0.7, 0.95), between(-0.25, 0.25) * h);
      crown.add(blob);
    }
    g.add(crown);
    g.userData.crown = crown;
    return g;
  }
  function birch(h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * h, 0.11 * h, h * 0.8, 6), birchMat);
    trunk.position.y = h * 0.4;
    g.add(trunk);
    const crown = new THREE.Group();
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.3, 1), leafMats[3]);
    blob.scale.y = 1.5;
    blob.position.y = h * 0.85;
    crown.add(blob);
    g.add(crown);
    g.userData.crown = crown;
    return g;
  }

  function placeTree(x, z, h) {
    const kind = rand();
    const t = kind < 0.35 ? pine(h * 1.2) : kind < 0.8 ? broadleaf(h, rand() < 0.12) : birch(h);
    t.position.set(x, terrainHeight(x, z), z);
    t.rotation.y = rand() * Math.PI * 2;
    const near = Math.hypot(x, z) < 75;
    t.traverse((m) => { if (m.isMesh) { m.castShadow = near; m.receiveShadow = true; } });
    t.userData.phase = rand() * 10;
    scene.add(t);
    swaying.push(t);
  }

  let placed = 0;
  for (let tries = 0; placed < 170 && tries < 3000; tries++) {
    const r = Math.sqrt(rand()) * 160 + 24;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!isClear(x, z, 3)) continue;
    placeTree(x, z, between(3.5, 7));
    placed++;
  }
  // A row of trees lining the plaza.
  for (let x = PLAZA.minX + 2; x <= PLAZA.maxX - 2; x += 5) placeTree(x, PLAZA.minZ - 3, between(4, 5.5));
  for (let z = PLAZA.minZ + 3; z <= PLAZA.maxZ - 2; z += 5.5) placeTree(PLAZA.minX - 3, z, between(4, 5.5));

  updaters.push((dt, t) => {
    for (const tree of swaying) {
      const c = tree.userData.crown;
      c.rotation.z = Math.sin(t * 1.2 + tree.userData.phase) * 0.03;
      c.rotation.x = Math.cos(t * 0.9 + tree.userData.phase) * 0.02;
    }
  });

  // Bushes and flowers.
  const bushMat = mat(0x4d8a3c);
  const petalColors = [0xf2c94c, 0xeb5757, 0xbb6bd9, 0xffffff, 0xf2994a].map((c) => mat(c));
  for (let i = 0; i < 90; i++) {
    const x = between(-90, 90);
    const z = between(-80, 90);
    if (!isClear(x, z, 1)) continue;
    if (rand() < 0.35) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(between(0.6, 1.2), 0), bushMat);
      b.position.set(x, terrainHeight(x, z) + 0.4, z);
      b.scale.y = 0.7;
      b.castShadow = true;
      scene.add(b);
    } else {
      const m = petalColors[Math.floor(rand() * petalColors.length)];
      for (let k = 0; k < 6; k++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), m);
        f.position.set(x + between(-1, 1), terrainHeight(x, z) + 0.25, z + between(-1, 1));
        scene.add(f);
      }
    }
  }

  // ----- Meadow with fence -------------------------------------------------
  const fenceMat = mat(0x9a7b55);
  const corners = [
    [MEADOW.x - MEADOW.w / 2, MEADOW.z - MEADOW.d / 2], [MEADOW.x + MEADOW.w / 2, MEADOW.z - MEADOW.d / 2],
    [MEADOW.x + MEADOW.w / 2, MEADOW.z + MEADOW.d / 2], [MEADOW.x - MEADOW.w / 2, MEADOW.z + MEADOW.d / 2],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 2.5);
    for (let k = 0; k <= n; k++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), fenceMat);
      post.position.set(ax + ((bx - ax) * k) / n, 0.6, az + ((bz - az) * k) / n);
      post.castShadow = true;
      scene.add(post);
    }
    for (const y of [0.5, 0.95]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), fenceMat);
      rail.position.set((ax + bx) / 2, y, (az + bz) / 2);
      rail.rotation.y = -Math.atan2(bz - az, bx - ax);
      scene.add(rail);
    }
  }

  // ----- Animals -----------------------------------------------------------
  // Generic four-legged animal with swinging legs.
  function quadruped({ body, belly = body, size = 1, len = 1.6, legLen = 0.7, neck = 0.3, ears = 'point', tail = 'short', spots = null, antlers = false }) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.setScalar(size);
    g.add(inner);
    const bodyMat = mat(body);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, len), bodyMat);
    torso.position.y = legLen + 0.3;
    inner.add(torso);
    const under = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, len * 0.8), mat(belly));
    under.position.y = legLen + 0.02;
    inner.add(under);
    if (spots) {
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.72, between(0.2, 0.35), between(0.25, 0.45)), mat(spots));
        s.position.set(0, legLen + 0.3 + between(-0.1, 0.12), between(-len / 2.6, len / 2.6));
        inner.add(s);
      }
    }
    const head = new THREE.Group();
    head.position.set(0, legLen + 0.55 + neck, len / 2 + 0.15);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.55), bodyMat);
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.25), mat(belly));
    snout.position.set(0, -0.08, 0.35);
    head.add(snout);
    const eyeMat = mat(0x111111);
    for (const sx of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), eyeMat);
      eye.position.set(sx, 0.08, 0.27);
      head.add(eye);
      const ear = new THREE.Mesh(ears === 'long' ? new THREE.BoxGeometry(0.1, 0.5, 0.08) : ears === 'flop' ? new THREE.BoxGeometry(0.12, 0.28, 0.06) : new THREE.ConeGeometry(0.09, 0.25, 4), bodyMat);
      ear.position.set(sx * 0.9, ears === 'flop' ? 0.05 : 0.3, -0.1);
      if (ears === 'flop') ear.position.x = sx * 1.4;
      head.add(ear);
      if (antlers) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 4), mat(0xd9c9a3));
        ant.position.set(sx * 0.7, 0.5, -0.05);
        ant.rotation.z = sx > 0 ? -0.4 : 0.4;
        head.add(ant);
      }
    }
    if (neck > 0.2) {
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.3, neck + 0.3, 0.3), bodyMat);
      n.position.set(0, legLen + 0.45 + neck / 2, len / 2 - 0.05);
      inner.add(n);
    }
    inner.add(head);
    const legs = [];
    for (const [lx, lz] of [[-0.22, len / 2 - 0.2], [0.22, len / 2 - 0.2], [-0.22, -len / 2 + 0.2], [0.22, -len / 2 + 0.2]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, legLen, lz);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, legLen, 0.16), bodyMat);
      leg.position.y = -legLen / 2;
      pivot.add(leg);
      inner.add(pivot);
      legs.push(pivot);
    }
    const tl = new THREE.Mesh(tail === 'long' ? new THREE.BoxGeometry(0.08, 0.08, 0.6) : tail === 'puff' ? new THREE.IcosahedronGeometry(0.16, 0) : new THREE.BoxGeometry(0.1, 0.1, 0.25), tail === 'puff' ? mat(0xffffff) : bodyMat);
    tl.position.set(0, legLen + 0.45, -len / 2 - 0.2);
    tl.rotation.x = tail === 'long' ? 0.6 : 0;
    inner.add(tl);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.userData = { legs, head, tail: tl };
    return g;
  }

  function animateLegs(a, t, speed, amp = 0.6) {
    a.userData.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * speed + (i % 3 === 0 ? 0 : Math.PI)) * amp));
  }

  // Walkers follow a closed path at a constant speed.
  function walker(animal, pathFn, speed, legSpeed) {
    scene.add(animal);
    let s = rand();
    updaters.push((dt, t) => {
      s = (s + dt * speed) % 1;
      const p = pathFn(s);
      const q = pathFn((s + 0.002) % 1);
      animal.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      animal.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      animateLegs(animal, t, legSpeed);
      animal.userData.tail.rotation.y = Math.sin(t * 10) * 0.5;
    });
  }

  // Grazers wander slowly inside a region, pausing to eat.
  function grazer(animal, region, speed = 0.8) {
    scene.add(animal);
    const st = { x: between(region.x0, region.x1), z: between(region.z0, region.z1), tx: 0, tz: 0, wait: rand() * 4 };
    const pick = () => { st.tx = between(region.x0, region.x1); st.tz = between(region.z0, region.z1); };
    pick();
    updaters.push((dt, t) => {
      const dx = st.tx - st.x;
      const dz = st.tz - st.z;
      const d = Math.hypot(dx, dz);
      if (st.wait > 0) {
        st.wait -= dt;
        animal.userData.head.rotation.x = 0.6 + Math.sin(t * 3) * 0.1; // head down, eating
        animateLegs(animal, t, 0, 0);
        if (st.wait <= 0) pick();
      } else if (d < 0.3) {
        st.wait = between(3, 8);
      } else {
        st.x += (dx / d) * speed * dt;
        st.z += (dz / d) * speed * dt;
        animal.rotation.y = Math.atan2(dx, dz);
        animal.userData.head.rotation.x = 0;
        animateLegs(animal, t, 6, 0.45);
      }
      animal.position.set(st.x, terrainHeight(st.x, st.z), st.z);
    });
  }

  // Cows in the fenced meadow.
  const meadowRegion = { x0: MEADOW.x - MEADOW.w / 2 + 2, x1: MEADOW.x + MEADOW.w / 2 - 2, z0: MEADOW.z - MEADOW.d / 2 + 2, z1: MEADOW.z + MEADOW.d / 2 - 2 };
  for (let i = 0; i < 4; i++) grazer(quadruped({ body: 0xf4f1ea, belly: 0xf0b8b0, spots: 0x2b2b2b, size: 1.3, len: 1.8, legLen: 0.75, ears: 'flop', tail: 'long' }), meadowRegion, 0.6);
  // Sheep in the meadow too.
  for (let i = 0; i < 3; i++) grazer(quadruped({ body: 0xf7f5ef, belly: 0x3a3a3a, size: 0.9, len: 1.2, legLen: 0.5, ears: 'flop', tail: 'puff' }), meadowRegion, 0.5);
  // Deer near the woods north-east.
  for (let i = 0; i < 3; i++) grazer(quadruped({ body: 0xa86b3c, belly: 0xe6d3b5, size: 1.1, len: 1.5, legLen: 1.0, neck: 0.5, tail: 'puff', antlers: i === 0 }), { x0: 25, x1: 55, z0: -45, z1: -25 }, 1.2);
  // Horses beside the meadow.
  for (let i = 0; i < 2; i++) grazer(quadruped({ body: i ? 0x5a3a24 : 0xc9a46e, belly: 0x3a2a1a, size: 1.4, len: 1.9, legLen: 1.1, neck: 0.6, tail: 'long' }), { x0: -60, x1: -40, z0: -40, z1: -20 }, 1.0);

  // Dogs walking around the plaza.
  const loop = (cx, cz, w, d) => (s) => {
    const per = 2 * (w + d);
    let k = s * per;
    if (k < w) return { x: cx - w / 2 + k, z: cz - d / 2 };
    k -= w;
    if (k < d) return { x: cx + w / 2, z: cz - d / 2 + k };
    k -= d;
    if (k < w) return { x: cx + w / 2 - k, z: cz + d / 2 };
    k -= w;
    return { x: cx - w / 2, z: cz + d / 2 - k };
  };
  walker(quadruped({ body: 0xc68642, belly: 0xf1d3a5, size: 0.75, len: 1.2, legLen: 0.55, ears: 'flop', tail: 'short' }), loop(0, 3, 50, 52), 0.012, 14);
  walker(quadruped({ body: 0x2e2e2e, belly: 0xdddddd, size: 0.65, len: 1.1, legLen: 0.5, ears: 'point', tail: 'short' }), loop(0, 3, 54, 56), 0.01, 15);
  // A cat strolling around the lake shore.
  walker(quadruped({ body: 0xe08a3c, belly: 0xfff0dd, size: 0.45, len: 1.0, legLen: 0.45, ears: 'point', tail: 'long' }), (s) => ({ x: LAKE.x + Math.cos(s * Math.PI * 2) * (LAKE.rx + 2.6), z: LAKE.z + Math.sin(s * Math.PI * 2) * (LAKE.rz + 2.6) }), 0.008, 12);

  // Rabbits hopping in the grass.
  const rabbitRegions = [{ x0: -38, x1: -26, z0: 28, z1: 40 }, { x0: 8, x1: 22, z0: 30, z1: 42 }, { x0: -30, x1: -24, z0: -30, z1: -24 }];
  for (let i = 0; i < 6; i++) {
    const r = quadruped({ body: i % 2 ? 0xb8a48c : 0xe9e4da, belly: 0xffffff, size: 0.35, len: 0.9, legLen: 0.35, ears: 'long', tail: 'puff' });
    scene.add(r);
    const reg = rabbitRegions[i % rabbitRegions.length];
    const st = { x: between(reg.x0, reg.x1), z: between(reg.z0, reg.z1), dir: rand() * 6, phase: rand() * 5 };
    updaters.push((dt, t) => {
      const hop = Math.max(0, Math.sin(t * 5 + st.phase));
      if (hop > 0) {
        st.x += Math.sin(st.dir) * dt * 1.6;
        st.z += Math.cos(st.dir) * dt * 1.6;
      }
      if (st.x < reg.x0 || st.x > reg.x1 || st.z < reg.z0 || st.z > reg.z1 || rand() < 0.004) {
        st.dir += Math.PI * between(0.5, 1.5);
        st.x = THREE.MathUtils.clamp(st.x, reg.x0, reg.x1);
        st.z = THREE.MathUtils.clamp(st.z, reg.z0, reg.z1);
      }
      r.position.set(st.x, terrainHeight(st.x, st.z) + hop * 0.35, st.z);
      r.rotation.y = st.dir;
    });
  }

  // Ducks swimming on the lake.
  function duck(male) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), mat(male ? 0x8a7a66 : 0xa0886a));
    body.scale.set(0.8, 0.6, 1.2);
    g.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), mat(male ? 0x1f6b3a : 0x8a6f52));
    head.position.set(0, 0.3, 0.32);
    g.add(head);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.18), mat(0xf2b134));
    beak.position.set(0, 0.27, 0.5);
    g.add(beak);
    g.traverse((m) => m.isMesh && (m.castShadow = true));
    return g;
  }
  for (let i = 0; i < 6; i++) {
    const d = duck(i % 2 === 0);
    scene.add(d);
    const k = between(0.35, 0.75);
    const sp = between(0.05, 0.12) * (rand() < 0.5 ? -1 : 1);
    const ph = rand() * Math.PI * 2;
    const offset = i < 3 ? i * 0.12 : 0; // the first three swim as a little family
    updaters.push((dt, t) => {
      const a = (i < 3 ? t * 0.08 - offset : t * sp + ph);
      const kk = i < 3 ? 0.6 : k;
      d.position.set(LAKE.x + Math.cos(a) * LAKE.rx * kk, 0.15 + Math.sin(t * 2 + i) * 0.03, LAKE.z + Math.sin(a) * LAKE.rz * kk);
      const dir = i < 3 || sp > 0 ? 1 : -1;
      d.rotation.y = Math.atan2(-Math.sin(a) * LAKE.rx * dir, Math.cos(a) * LAKE.rz * dir);
    });
  }

  // Fish jumping out of the lake now and then.
  const fish = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 5), mat(0xc0c8cc, { metalness: 0.4 }));
  fish.rotation.z = Math.PI / 2;
  fish.visible = false;
  scene.add(fish);
  let fishT = 3;
  let fishFrom = new THREE.Vector3();
  updaters.push((dt) => {
    fishT -= dt;
    if (fishT < 0 && fishT > -1) {
      const k = -fishT;
      fish.visible = true;
      fish.position.set(fishFrom.x + k * 1.5, 0.1 + Math.sin(k * Math.PI) * 1.4, fishFrom.z);
      fish.rotation.z = Math.PI / 2 - (k - 0.5) * 2.5;
    } else if (fishT <= -1) {
      fish.visible = false;
      fishT = between(4, 9);
      fishFrom.set(LAKE.x + between(-3, 2), 0, LAKE.z + between(-5, 5));
    }
  });

  // Birds flying in loose circles, flapping their wings.
  const birdMat = mat(0x2d2d33);
  const gullMat = mat(0xf4f4f4);
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const m = i % 3 === 0 ? gullMat : birdMat;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 5), m);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.35), m);
      wing.position.x = side * 0.45;
      pivot.add(wing);
      g.add(pivot);
      wings.push([pivot, side]);
    }
    scene.add(g);
    const flock = i < 7 ? { cx: 10, cz: -10, r: 45, h: 26 } : { cx: 30, cz: 10, r: 18, h: 16 };
    const r = flock.r + between(-6, 6);
    const h = flock.h + between(-3, 3);
    const sp = between(0.12, 0.2);
    const ph = rand() * Math.PI * 2;
    updaters.push((dt, t) => {
      const a = t * sp + ph;
      g.position.set(flock.cx + Math.cos(a) * r, h + Math.sin(t * 0.7 + ph) * 1.5, flock.cz + Math.sin(a) * r);
      g.rotation.y = -a;
      g.rotation.z = 0.25;
      const flap = Math.sin(t * 9 + ph) * 0.7;
      wings.forEach(([p, side]) => (p.rotation.z = side * flap));
    });
  }

  // Butterflies around the flowers by the lake.
  const wingColors = [0xf2c94c, 0x56ccf2, 0xff7eb6, 0xffffff];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const m = mat(wingColors[i % wingColors.length], { side: THREE.DoubleSide });
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2), m);
    const wr = wl.clone();
    wl.position.x = -0.13;
    wr.position.x = 0.13;
    const pl = new THREE.Group(); pl.add(wl);
    const pr = new THREE.Group(); pr.add(wr);
    g.add(pl, pr);
    scene.add(g);
    const c = i < 5 ? { x: LAKE.x - LAKE.rx - 3, z: LAKE.z + between(-6, 6) } : { x: between(-15, 15), z: PLAZA.maxZ + 4 };
    const ph = rand() * 10;
    updaters.push((dt, t) => {
      g.position.set(c.x + Math.sin(t * 0.7 + ph) * 2.5, 1 + Math.sin(t * 1.9 + ph) * 0.4, c.z + Math.cos(t * 0.5 + ph) * 2.5);
      g.rotation.y = t * 0.7 + ph;
      const f = Math.sin(t * 22 + ph) * 1.1;
      pl.rotation.y = f;
      pr.rotation.y = -f;
    });
  }

  return {
    update(dt, t) {
      for (const fn of updaters) fn(dt, t);
    },
  };
}
