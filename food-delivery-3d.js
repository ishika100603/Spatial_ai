import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { createCity, textSprite } from './food-delivery-city.js?v=8';
import {
  AVENUES, STREETS, BLOCK, LANDMARKS, streetZ, streetShort, junction, route, describe, relativeTo,
  nearestLandmark, egocentric, toLatLon, parsePlace, nearestJunction, avenue, CLOSURES, NODES, edgeById, streetWidth,
} from './food-delivery-location.js?v=8';
import { createDistancePanel, PRESET_CLOSURES } from './food-delivery-distance.js?v=8';
import { createProximity } from './food-delivery-proximity.js?v=8';
import { createPosition } from './food-delivery-position.js?v=8';

// ===========================================================================
// 1. Semantic data — entities, attributes, relationships (no Three.js here)
// ===========================================================================
// Positions are part of the model: every entity occupies a location in the street grid.
const P = (x, z) => ({ x, z });

function initialModel() {
  return {
    deliveryPartners: [
      { id: 'DP01', type: 'DeliveryPartner', name: 'Arjun', rating: 4.8, commuteType: 'Bike', vehicle: 'Motorbike', tips: 12.5, position: P(-129, streetZ(111) - 25), heading: P(0, -1) },
      { id: 'DP02', type: 'DeliveryPartner', name: 'Maya', rating: 4.6, commuteType: 'Car', vehicle: 'Toyota Prius', tips: 8.0, position: P(116, streetZ(115) + 30), heading: P(0, -1) },
      { id: 'DP03', type: 'DeliveryPartner', name: 'Leo', rating: 4.9, commuteType: 'Bicycle', vehicle: 'E-bike', tips: 15.25, position: P(249, streetZ(115) + 20), heading: P(0, 1) },
    ],
    restaurants: [
      { id: 'R01', type: 'Restaurant', name: 'Indian Kitchen', cuisineType: ['Indian', 'Asian'], storeType: 'Restaurant', prepTime: 14, color: 0xb5402a, face: P(-123, 200), facing: 'w', menu: ['Paneer Tikka', 'Garlic Naan', 'Chicken Biryani', 'Dal Makhani'] },
      { id: 'R02', type: 'Restaurant', name: 'Thai Leaf', cuisineType: ['Thai'], storeType: 'Cafe', prepTime: 10, color: 0x2f7d4f, face: P(90.5, 215), facing: 'e', menu: ['Pad Thai', 'Green Curry', 'Tom Yum', 'Mango Sticky Rice'] },
      { id: 'R03', type: 'Restaurant', name: 'Wok on Wheels', cuisineType: ['Chinese'], storeType: 'Food Truck', prepTime: 6, color: 0xd1342f, face: P(-170.5, streetZ(116) + 42), facing: 'truck', menu: ['Kung Pao Chicken', 'Veg Lo Mein', 'Pork Dumplings', 'Scallion Pancake'] },
      { id: 'R04', type: 'Restaurant', name: 'Trattoria Roma', cuisineType: ['Italian'], storeType: 'Fine Dining', prepTime: 22, color: 0x3b2f6b, face: P(129.5, 40), facing: 'w', menu: ['Cacio e Pepe', 'Margherita Pizza', 'Tiramisu', 'Burrata'] },
    ],
    service: { id: 'UE01', type: 'UberEats', name: 'UberEats', serviceCharge: 3.99, route: 'computed on the street grid', deliveryTime: null, membership: 'Uber One' },
    customers: [
      { id: 'C01', type: 'Customer', name: 'Priya', face: P(240.5, -125), facing: 'e', profile: { email: 'priya@example.com', phone: '+1 555 0142', membership: 'Uber One', password: '••••••', payment: 'Visa •••• 4242', history: '41 past orders' }, delivery: { address: 'Morningside Dr, Apt 4B (between W 115th & W 116th St)', instructions: 'Buzz 4B, leave with doorman', orderNumber: 'O01' } },
      { id: 'C02', type: 'Customer', name: 'Sam', face: P(-40, 70.5), facing: 's', profile: { email: 'sam@example.com', phone: '+1 555 0177', membership: 'Standard', password: '••••••', payment: 'Amex •••• 1009', history: '7 past orders' }, delivery: { address: 'W 113th St, Apt 2F (between Broadway & Amsterdam)', instructions: 'Meet at the lobby', orderNumber: '—' } },
      { id: 'C03', type: 'Customer', name: 'Ana', face: P(190, 70.5), facing: 's', profile: { email: 'ana@example.com', phone: '+1 555 0110', membership: 'Guest', password: '—', payment: 'Apple Pay', history: 'first order' }, delivery: { address: 'W 113th St, Apt 9C (between Amsterdam & Morningside Dr)', instructions: 'Doorman building', orderNumber: '—' } },
    ],
    orders: [
      { id: 'O01', type: 'Order', customer: 'C01', restaurant: 'R01', deliveryPartner: 'DP01', status: 'Placed', paid: false, active: false, items: ['2 × Paneer Tikka', '1 × Garlic Naan'], orderValue: 31.5, deliveryFee: 0, estimatedDeliveryTime: null, parcel: 'R01' },
    ],
    relationships: [
      { type: 'drivesTo', from: 'DP01', to: 'R01' },
      { type: 'drivesTo', from: 'DP02', to: 'R02' },
      { type: 'drivesTo', from: 'DP03', to: 'R03' },
      { type: 'partnersWith', from: 'UE01', to: 'R01' },
      { type: 'partnersWith', from: 'UE01', to: 'R02' },
      { type: 'partnersWith', from: 'UE01', to: 'R03' },
      { type: 'partnersWith', from: 'UE01', to: 'R04' },
      { type: 'orderedFrom', from: 'O01', to: 'R01' },
      { type: 'assignedTo', from: 'O01', to: 'DP01' },
      { type: 'placedBy', from: 'O01', to: 'C01' },
      { type: 'deliveredThrough', from: 'O01', to: 'UE01' },
    ],
    stats: { delivered: 26, totalMinutes: 26 * 24 },
  };
}

let model = initialModel();
const byId = (id) => [...model.deliveryPartners, ...model.restaurants, model.service, ...model.customers, ...model.orders].find((e) => e.id === id);
const OUT = { w: P(-1, 0), e: P(1, 0), n: P(0, -1), s: P(0, 1), truck: P(-1, 0) };
// The pavement point in front of a storefront or door — where pickups and drop-offs happen.
const anchorOf = (e) => P(e.face.x + OUT[e.facing].x * 3, e.face.z + OUT[e.facing].z * 3);

const SPEED = { Bike: 5.5, Scooter: 5, Car: 4.5, Bicycle: 4.2, Walking: 1.3 }; // m/s door to door in Manhattan traffic (lights, turns, double-parking)
const HANDOFF = { Bike: 1, Scooter: 1, Car: 2, Bicycle: 1, Walking: 1 }; // minutes to park & hand over

// ===========================================================================
// 2. Rules
// ===========================================================================
// Rule 1 — confidentiality: each entity only sees the customer data it needs.
const ADVANCED = ['Accepted', 'Preparing', 'Ready for Pickup', 'Picked Up', 'Out for Delivery'];
function customerViewFor(viewer, customer) {
  const order = model.orders.find((o) => o.customer === customer.id && o.active && (o.deliveryPartner === viewer.id || o.restaurant === viewer.id));
  let allowed = [];
  if (viewer.type === 'DeliveryPartner') {
    // Proximity rule: the buzzer / apartment instructions are only revealed within 1 block of the door.
    const near = Math.hypot(viewer.position.x - anchorOf(customer).x, viewer.position.z - anchorOf(customer).z) < BLOCK;
    allowed = order && ADVANCED.includes(order.status) ? ['address', 'orderNumber', ...(near ? ['instructions'] : [])] : ['orderNumber'];
  }
  else if (viewer.type === 'Restaurant') allowed = ['orderNumber'];
  else if (viewer.type === 'UberEats') allowed = ['address', 'instructions', 'orderNumber', 'membership'];
  const all = { ...customer.delivery, ...customer.profile };
  const visible = {};
  const hidden = [];
  for (const [k, v] of Object.entries(all)) (allowed.includes(k) ? (visible[k] = v) : hidden.push(k));
  return { visible, hidden, approximate: viewer.type === 'DeliveryPartner' && !allowed.includes('address') };
}

// Rule 2 — delivery time: every active order has an estimate built from prep + travel time.
function validateOrder(order) {
  if (!order.restaurant) return 'Order must have a restaurant.';
  if (!order.deliveryPartner) return 'Order requires a delivery partner before dispatch.';
  if (order.status !== 'Delivered' && order.estimatedDeliveryTime == null) return 'Active orders must have an estimated delivery time.';
  return null;
}

// ===========================================================================
// 3. Scene
// ===========================================================================
const root = document.getElementById('fd3d');
const canvasHost = root.querySelector('.fd-canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 1, 12000);
const HOME = { pos: new THREE.Vector3(290, 300, 460), target: new THREE.Vector3(40, 0, 40) };
camera.position.copy(HOME.pos);
// Map-style navigation: drag = pan, right-drag (or two fingers) = rotate, scroll = zoom toward the cursor.
const controls = new MapControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.zoomSpeed = 1.3;
controls.panSpeed = 1.1;
controls.rotateSpeed = 0.5;
controls.maxPolarAngle = 1.32;
controls.minDistance = 15;
controls.maxDistance = 900;
controls.listenToKeyEvents(window); // arrow keys pan
const BOUNDS = { x0: -290, x1: 420, z0: -330, z1: 370 }; // keep the view on the site
const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
scene.add(sun);
const city = createCity({ scene, renderer, camera, sun, hemi });

const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  b.position.set(x, y, z);
  b.castShadow = true;
  return b;
};
const UE_GREEN = 0x06c167;

function signTexture(text, bg, fg = '#fff', w = 512, h = 96) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `700 ${Math.round(h * 0.55)}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2, w - 20);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ueDecalTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#06c167';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.font = '800 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('Uber', 64, 54);
  g.fillText('Eats', 64, 88);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
// The green "Uber Eats" sticker in a partner's window — the visible trace of "partners with".
function ueDecal(size = 1) {
  const d = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: ueDecalTex, emissive: 0x06c167, emissiveIntensity: 0.15 }));
  d.userData.id = 'UE01';
  return d;
}

function storefront(r) {
  const g = new THREE.Group();
  const frame = box(11, 4.8, 0.4, m(0x2a2522), 0, 2.55, 0.1);
  const glass = box(7, 3.4, 0.1, m(0x9ab3c4, { roughness: 0.1, metalness: 0.6 }), -1.2, 2.1, 0.35);
  const door = box(1.6, 3.2, 0.1, m(0x3b2a1e), 3.6, 1.75, 0.35);
  const awning = box(11.4, 0.35, 2.6, m(r.color), 0, 4.7, 1.4);
  awning.rotation.x = 0.18;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshStandardMaterial({ map: signTexture(r.name, '#' + r.color.toString(16).padStart(6, '0')) }));
  sign.position.set(0, 5.8, 0.32);
  const decal = ueDecal(1.1);
  decal.position.set(1.6, 2.5, 0.42);
  g.add(frame, glass, door, awning, sign, decal);
  for (const tx of [-3.6, 0.2]) {
    const table = box(0.9, 0.08, 0.9, m(0x222222), tx, 1.1, 3.2);
    const leg = box(0.1, 1.1, 0.1, m(0x222222), tx, 0.55, 3.2);
    g.add(table, leg, box(0.5, 0.9, 0.5, m(r.color), tx - 0.8, 0.45, 3.2), box(0.5, 0.9, 0.5, m(r.color), tx + 0.8, 0.45, 3.2));
  }
  g.rotation.y = r.facing === 'w' ? -Math.PI / 2 : r.facing === 'e' ? Math.PI / 2 : r.facing === 'n' ? Math.PI : 0;
  g.position.set(r.face.x, 0.16, r.face.z);
  return g;
}

function foodTruck(r) {
  const g = new THREE.Group();
  g.add(box(2.5, 2.9, 7.2, m(0xf3efe6), 0, 2.0, 0.6)); // box body
  g.add(box(2.4, 1.9, 2.2, m(r.color), 0, 1.45, -3.9)); // cab
  g.add(box(2.42, 0.8, 1.3, m(0x22303a, { roughness: 0.2, metalness: 0.6 }), 0, 1.95, -4.4));
  g.add(box(0.1, 1.3, 3.6, m(0x2b2b2b), -1.28, 2.3, 0.8)); // serving window (sidewalk side)
  const flap = box(0.1, 0.12, 3.8, m(r.color), -1.9, 3.15, 0.8);
  flap.rotation.z = -0.9;
  g.add(flap);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshStandardMaterial({ map: signTexture(r.name, '#' + r.color.toString(16).padStart(6, '0')), side: THREE.DoubleSide }));
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(-1.27, 3.15, 0.6);
  g.add(sign);
  const decal = ueDecal(0.8);
  decal.rotation.y = -Math.PI / 2;
  decal.position.set(-1.27, 2.2, 3.2);
  g.add(decal);
  for (const z of [-3.6, 2.6]) g.add(box(2.7, 0.9, 0.9, m(0x111111), 0, 0.45, z));
  g.position.set(r.face.x, 0, r.face.z);
  return g;
}

function doorway(c) {
  const g = new THREE.Group();
  g.add(box(3.4, 4, 0.3, m(0xd8cfbc), 0, 2, 0.1));
  g.add(box(1.6, 2.8, 0.1, m(0x1f3b2c), 0, 1.4, 0.3));
  const canopy = box(3.6, 0.3, 4, m(0x1f3b2c), 0, 3.4, 2.1);
  g.add(canopy);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.28), new THREE.MeshStandardMaterial({ map: signTexture(`${c.id} · ${c.name}`, '#1f3b2c', '#e9dfc7', 384, 48) }));
  plate.position.set(0, 3.42, 4.12);
  g.add(plate);
  // the customer, waiting by the door
  const person = new THREE.Group();
  person.add(box(0.5, 1.0, 0.32, m(0x8e5cd9), 0, 1.15, 0));
  person.add(box(0.42, 0.75, 0.3, m(0x26303a), 0, 0.38, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m(0xc68642));
  head.position.y = 1.85;
  person.add(head);
  person.scale.setScalar(1.6);
  person.position.set(0.9, 0, 1.6);
  g.add(person);
  g.rotation.y = c.facing === 'w' ? -Math.PI / 2 : c.facing === 'e' ? Math.PI / 2 : c.facing === 'n' ? Math.PI : 0;
  g.position.set(c.face.x, 0.16, c.face.z);
  return g;
}

function riderMesh(dp) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const wheels = [];
  const wheel = (r, z) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.25, 8, 20), m(0x151515));
    w.rotation.y = Math.PI / 2;
    w.position.set(0, r, z);
    inner.add(w);
    wheels.push(w);
  };
  const jacket = m(0x1d1d1f);
  const bag = box(0.62, 0.62, 0.62, m(UE_GREEN), 0, 0, 0);
  const bagDecal = ueDecal(0.5);
  bagDecal.rotation.y = Math.PI / 2;
  bagDecal.position.x = 0.32;
  bag.add(bagDecal);
  if (dp.commuteType === 'Car') {
    inner.add(box(1.85, 0.85, 4.4, m(0xf1f1f1, { metalness: 0.4, roughness: 0.3 }), 0, 0.78, 0));
    inner.add(box(1.65, 0.62, 2.3, m(0x26303a, { roughness: 0.2, metalness: 0.5 }), 0, 1.5, 0.1));
    for (const z of [-1.4, 1.4]) inner.add(box(1.95, 0.66, 0.66, m(0x151515), 0, 0.33, z));
    for (const s of [-1, 1]) {
      const d = ueDecal(0.7);
      d.rotation.y = s * Math.PI / 2;
      d.position.set(s * 0.94, 0.85, 0.3);
      inner.add(d);
    }
    inner.scale.setScalar(1.25);
  } else {
    const bike = dp.commuteType === 'Bicycle';
    wheel(bike ? 0.36 : 0.32, -0.6);
    wheel(bike ? 0.36 : 0.32, 0.6);
    inner.add(box(0.14, bike ? 0.08 : 0.42, 1.15, m(bike ? 0x1b6fb5 : 0xb31b1b, { metalness: 0.5 }), 0, bike ? 0.62 : 0.55, 0));
    inner.add(box(0.7, 0.06, 0.06, m(0x222222), 0, 1.0, -0.5));
    inner.add(box(0.36, 0.7, 0.3, jacket, 0, 1.3, 0.08)); // torso
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m(0xd9a066));
    head.position.set(0, 1.78, 0.02);
    inner.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(bike ? 0x1b6fb5 : 0x111111));
    helmet.position.set(0, 1.82, 0.02);
    inner.add(helmet);
    for (const s of [-1, 1]) inner.add(box(0.12, 0.6, 0.12, m(0x26303a), s * 0.12, 0.85, 0.05));
    bag.position.set(0, bike ? 1.45 : 1.15, bike ? 0.38 : 0.62);
    inner.add(bag);
    inner.scale.setScalar(1.7);
  }
  g.userData.wheels = wheels;
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

function parcelMesh() {
  const g = new THREE.Group();
  g.add(box(0.36, 0.44, 0.24, m(0xc8a06a, { roughness: 0.9 }), 0, 0.22, 0));
  g.add(box(0.37, 0.08, 0.25, m(UE_GREEN), 0, 0.34, 0));
  g.scale.setScalar(2.4);
  return g;
}

// --- Building / rebuilding entity objects ---------------------------------------------
const objects = new Map(); // id -> Object3D
const labels = new Map(); // id -> Sprite
const pickables = [];
let dynamic = [];
const COLORS = { DeliveryPartner: '#2f80ed', Restaurant: '#c2410c', UberEats: '#06a35a', Customer: '#7c3aed', Order: '#8a6a2f' };

function addObject(id, obj, labelText, color, labelY) {
  obj.userData.id = obj.userData.id || id;
  scene.add(obj);
  objects.set(id, obj);
  pickables.push(obj);
  dynamic.push(obj);
  const l = textSprite(labelText, { color, border: color, size: 0.022 });
  l.userData.offsetY = labelY;
  scene.add(l);
  labels.set(id, l);
  dynamic.push(l);
}

function buildEntities() {
  dynamic.forEach((o) => scene.remove(o));
  dynamic = [];
  pickables.length = 0;
  objects.clear();
  labels.clear();
  for (const r of model.restaurants) addObject(r.id, r.facing === 'truck' ? foodTruck(r) : storefront(r), `🍽 ${r.name}`, COLORS.Restaurant, r.facing === 'truck' ? 6 : 9);
  for (const c of model.customers) addObject(c.id, doorway(c), `🏠 ${c.name} (${c.id})`, COLORS.Customer, 7);
  for (const dp of model.deliveryPartners) {
    const g = riderMesh(dp);
    addObject(dp.id, g, `${dp.commuteType === 'Car' ? '🚗' : dp.commuteType === 'Bicycle' ? '🚲' : '🛵'} ${dp.id} ${dp.name}`, COLORS.DeliveryPartner, 5.5);
  }
  for (const o of model.orders) addParcel(o);
}

function addParcel(o) {
  const g = parcelMesh();
  g.userData.id = o.id;
  addObject(o.id, g, `📦 ${o.id}`, COLORS.Order, 2.2);
}

// ===========================================================================
// 4. Location of things (the "where" of the model)
// ===========================================================================
// Where is a parcel? It is wherever its container is: the kitchen, a rider's bag or the customer's door.
function parcelPlace(o) {
  const c = byId(o.parcel);
  if (!c) return null;
  if (c.type === 'Restaurant') {
    const ready = ['Ready for Pickup'].includes(o.status);
    const inside = P(c.face.x - OUT[c.facing].x * 2, c.face.z - OUT[c.facing].z * 2);
    return { ...(ready ? anchorOf(c) : inside), y: ready ? 1.2 : 0.5, visible: ready, container: ready ? `on the pickup shelf at ${c.name}` : o.status === 'Placed' && !o.active ? `not yet ordered — will be cooked at ${c.name}` : `being prepared in ${c.name}'s kitchen` };
  }
  if (c.type === 'DeliveryPartner') return { ...c.position, y: c.commuteType === 'Car' ? 2.4 : 3.6, visible: true, container: `in ${c.id} ${c.name}'s insulated Uber Eats bag` };
  if (c.type === 'Customer') return { ...anchorOf(c), y: 1.0, visible: true, container: `handed to ${c.name} at the door` };
  return null;
}

function locationOf(id) {
  const lm = LANDMARKS.find((l) => l.id === id);
  if (lm) return { x: lm.x, z: lm.z, what: lm.name };
  const e = byId(id);
  if (!e) return null;
  if (e.type === 'Order') { const p = parcelPlace(e); return p && { x: p.x, z: p.z, what: `Parcel ${e.id}`, container: p.container }; }
  if (e.type === 'DeliveryPartner') return { ...e.position, what: `${e.id} ${e.name}`, heading: e.heading };
  if (e.type === 'UberEats') return null;
  return { ...anchorOf(e), what: e.name };
}

function nameOf(id) {
  const lm = LANDMARKS.find((l) => l.id === id);
  if (lm) return lm.name;
  const e = byId(id);
  if (!e) return id;
  if (e.type === 'Order') return `Parcel ${e.id}`;
  if (e.type === 'DeliveryPartner') return `${e.id} ${e.name} (${e.commuteType})`;
  return e.name;
}

// What occupies a place? Entities, parcels and landmarks within a radius — plus live traffic and people.
function occupantsAt(x, z, radius = 45) {
  const out = [];
  const consider = (id, p) => { if (p) { const d = Math.hypot(p.x - x, p.z - z); if (d <= radius) out.push({ id, d, name: nameOf(id) }); } };
  model.deliveryPartners.forEach((e) => consider(e.id, e.position));
  model.restaurants.forEach((e) => consider(e.id, anchorOf(e)));
  model.customers.forEach((e) => consider(e.id, anchorOf(e)));
  model.orders.forEach((o) => consider(o.id, parcelPlace(o)));
  LANDMARKS.forEach((l) => { const d = Math.hypot(l.x - x, l.z - z); if (d <= radius * 1.8) out.push({ id: l.id, d, name: l.name, landmark: true }); });
  out.sort((a, b) => a.d - b.d);
  const vehicles = city.occupants.vehicles.filter((v) => Math.hypot(v.x - x, v.z - z) <= radius).length;
  const people = city.occupants.people.filter((v) => Math.hypot(v.x - x, v.z - z) <= radius).length;
  return { list: out, vehicles, people };
}

// ===========================================================================
// 5. Time: routes, travel and preparation
// ===========================================================================
let simMin = 12 * 60; // 12:00 noon
let timeScale = 10; // simulated seconds per real second (traffic, people, lights, riders and kitchens share one clock)
const clockText = (min) => { const h = Math.floor(min / 60) % 24; const mm = Math.floor(min % 60); return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const travelMin = (from, to, mode) => route(from, to, mode).length / SPEED[mode] / 60;

// Pre-compute a drivable polyline offset into the right-hand lane.
// Riders keep to a lane: bikes and bicycles ride the curb-side bike lane, cars use the traffic lane.
function laneOffset(a, b, mode) {
  const vertical = Math.abs(b.x - a.x) < Math.abs(b.z - a.z);
  const bike = mode !== 'Car';
  if (vertical) {
    const mx = (a.x + b.x) / 2;
    const ave = AVENUES.reduce((best, v) => (Math.abs(v.x - mx) < Math.abs(best.x - mx) ? v : best));
    if (bike) return ave.w / 2 - 2.2;
    return ave.median ? ave.median / 2 + 4 : ave.oneWay ? 2 : ave.w / 4;
  }
  const n = Math.round(114 - (a.z + b.z) / 2 / BLOCK);
  return bike ? streetWidth(n) / 2 - 2 : n === 110 ? 4 : 2;
}
function lanePath(points, mode) {
  const n = points.length;
  const seg = [];
  for (let i = 1; i < n; i++) {
    const a = points[i - 1], b = points[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    seg[i] = { nx: -(b.z - a.z) / L, nz: (b.x - a.x) / L, off: i === 1 || i === n - 1 ? 0 : laneOffset(a, b, mode) };
  }
  return points.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    const s1 = seg[i], s2 = seg[i + 1];
    if (Math.abs(s1.nx * s2.nx + s1.nz * s2.nz) < 0.5) return P(p.x + s1.nx * s1.off + s2.nx * s2.off, p.z + s1.nz * s1.off + s2.nz * s2.off);
    const o = (s1.off + s2.off) / 2;
    return P(p.x + ((s1.nx + s2.nx) / 2) * o, p.z + ((s1.nz + s2.nz) / 2) * o);
  });
}

const trips = new Map(); // riderId -> { points, len, s, purpose, order, target }
let position = null; // position + movement indicators (created below)
function startTrip(dp, target, purpose, order = null, targetId = null) {
  const r = route(dp.position, target, dp.commuteType);
  const points = lanePath(r.points, dp.commuteType);
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  // AROUND: is this route longer than the ideal one because of a closure?
  const ideal = route(dp.position, target, dp.commuteType, { ignoreClosures: true });
  let around = null;
  if (r.length > ideal.length + 20) {
    const closures = [...CLOSURES.keys()].map((id) => edgeById(id)).filter(Boolean).map((e) => {
      const A = NODES.get(e.a), B = NODES.get(e.b);
      return { id: e.id, x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    }).filter((c) => ideal.points.some((p, i) => i > 0 && segDist(c, ideal.points[i - 1], p) < 6));
    around = { extra: r.length - ideal.length, closures };
    position?.event('around', `${dp.id} is going AROUND a closure (+${Math.round(around.extra)} m)`, closures[0]?.x, closures[0]?.z);
  }
  trips.set(dp.id, { points, len, s: 0, purpose, order, target, targetId, steps: r.steps, around });
  drawRoute(dp.id);
  return r;
}
function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}
function tripRemainingMin(dp) {
  const t = trips.get(dp.id);
  return t ? (t.len - t.s) / SPEED[dp.commuteType] / 60 : 0;
}

const etaParts = (o, est) => (o.status === 'Delivered' ? `delivered ${Math.round((o.deliveredAt ?? simMin) - o.placedAt)} min after ordering`
  : ['Picked Up', 'Out for Delivery'].includes(o.status) ? `on the way · ${min(est.ride)} ride + hand-off`
  : `cooking ${min(est.prep)} · rider arrives ${min(est.toRestaurant)} · ride ${min(est.ride)}`);

// Estimated delivery time (rule 2), broken down into its parts.
function estimate(o) {
  const r = byId(o.restaurant);
  const c = byId(o.customer);
  const dp = byId(o.deliveryPartner);
  const now = simMin;
  const mode = dp ? dp.commuteType : 'Bike';
  const handoff = HANDOFF[mode];
  const ride = travelMin(anchorOf(r), anchorOf(c), mode);
  if (o.status === 'Delivered') return { total: 0, prep: 0, toRestaurant: 0, ride: 0 };
  if (['Picked Up', 'Out for Delivery'].includes(o.status)) {
    const left = trips.get(dp.id)?.order === o.id ? tripRemainingMin(dp) : travelMin(dp.position, anchorOf(c), mode);
    return { total: left + handoff, prep: 0, toRestaurant: 0, ride: left };
  }
  const readyAt = o.readyAt ?? now + 0.5 + r.prepTime;
  let riderAt = now;
  if (dp) {
    const t = trips.get(dp.id);
    if (t && t.order === o.id) riderAt = now + tripRemainingMin(dp);
    else if (o.departAt != null) riderAt = Math.max(now, o.departAt) + travelMin(dp.position, anchorOf(r), mode);
    else riderAt = now + travelMin(dp.position, anchorOf(r), mode);
  }
  const pickup = Math.max(readyAt, riderAt) + handoff;
  return { total: pickup + ride + handoff - now, prep: Math.max(0, readyAt - now), toRestaurant: Math.max(0, riderAt - now), ride };
}

// ===========================================================================
// 6. UI
// ===========================================================================
const panel = root.querySelector('.fd-panel');
const statusEl = root.querySelector('.fd-status');
const toastHost = root.querySelector('.fd-toasts');
const locBody = root.querySelector('.fd-tabbody');
let selectedId = null;
let showRoutes = true;

function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = 'fd-toast ' + kind;
  t.textContent = msg;
  toastHost.appendChild(t);
  while (toastHost.children.length > 5) toastHost.firstChild.remove();
  setTimeout(() => t.remove(), 5200);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const row = (k, v) => `<div class="fd-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
const link = (id) => `<a data-go="${id}">${esc(nameOf(id))}</a>`;
const min = (x) => (x < 1 ? '<1 min' : `${Math.round(x)} min`);
const FIELD_NAMES = { address: 'Delivery address', instructions: 'Instructions', orderNumber: 'Order number', email: 'Email', phone: 'Phone', membership: 'Membership', password: 'Password', payment: 'Payment details', history: 'Account history' };

function locationBlock(id) {
  const loc = locationOf(id);
  if (!loc) return '';
  const d = describe(loc.x, loc.z);
  return `<div class="fd-loc-line">📍 ${loc.container ? `${esc(loc.container)} · ` : ''}${esc(d.text)}</div>
    ${det(`loc-${id}`, 'More about this location', `<div class="fd-loc-sub">Nearest junction: <b>${esc(d.junction.name)}</b> · ${Math.round(d.junction.d)} m</div>
    <div class="fd-loc-sub">${esc(relativeTo(nearestLandmark(loc.x, loc.z), loc.x, loc.z))}</div><div class="fd-loc-sub">${esc(d.latlon)}</div>`)}`;
}

function confidentialityBlock(viewer) {
  const related = viewer.type === 'UberEats' ? model.customers : model.customers.filter((c) => model.orders.some((o) => o.customer === c.id && (o.deliveryPartner === viewer.id || o.restaurant === viewer.id)));
  const lines = related.map((c) => {
    const v = customerViewFor(viewer, c);
    if (!Object.keys(v.visible).length && viewer.type !== 'UberEats') return '';
    return `<div class="fd-note"><b>${esc(c.name)}</b>${v.approximate ? ' — area only: Morningside Heights' : ''}</div>
      ${Object.entries(v.visible).map(([k, val]) => `<div class="fd-ok">✓ ${FIELD_NAMES[k]}: ${esc(val)}</div>`).join('')}
      ${v.hidden.slice(0, 4).map((k) => `<div class="fd-locked">🔒 ${FIELD_NAMES[k]}</div>`).join('')}`;
  }).join('');
  return det(`conf-${viewer.id}`, '🔒 What customer data it can see', lines || '<div class="fd-note">Nothing until it is linked to an order.</div>');
}

function statusHTML() {
  const o = model.orders[0];
  const est = estimate(o);
  return `<span class="fd-clock">🕛 ${clockText(simMin)}</span>
    <span class="fd-sline"><b>O01</b> ${esc(o.status)} · ${o.status === 'Delivered' ? '✓ delivered' : `ETA <b>${min(est.total)}</b>`}</span>`;
}

// Collapsible sections that stay open across live re-renders.
const openDetails = new Set();
document.addEventListener('toggle', (e) => { const k = e.target.dataset?.key; if (k) (e.target.open ? openDetails.add(k) : openDetails.delete(k)); }, true);
const det = (key, title, body) => `<details data-key="${key}" ${openDetails.has(key) ? 'open' : ''}><summary>${title}</summary>${body}</details>`;

function renderPanel() {
  panel.style.display = selectedId ? '' : 'none';
  if (!selectedId) { panel.dataset.html = ''; return; }
  const e = byId(selectedId);
  const lm = LANDMARKS.find((l) => l.id === selectedId);
  if (lm) {
    const occ = occupantsAt(lm.x, lm.z, 60);
    panel.innerHTML = `<button class="fd-x" data-close title="Close">×</button><div class="fd-type" style="background:#555">PLACE</div><h3>${esc(lm.name)}</h3>${locationBlock(lm.id)}
      <h4>OCCUPIED BY</h4>${occ.list.filter((x) => !x.landmark).map((x) => `<div class="fd-rel">${link(x.id)} · ${Math.round(x.d)} m</div>`).join('') || '<div class="fd-note">No delivery entities here right now.</div>'}`;
    return;
  }
  const rels = model.relationships;
  let html = '';
  if (e.type === 'DeliveryPartner') {
    const to = rels.filter((r) => r.type === 'drivesTo' && r.from === e.id).map((r) => r.to);
    const current = model.orders.find((o) => o.deliveryPartner === e.id && o.active);
    const trip = trips.get(e.id);
    html = `<div class="fd-type" style="background:${COLORS.DeliveryPartner}">DELIVERY PARTNER</div><h3>${e.id} · ${esc(e.name)}</h3>
      ${row('Rating', e.rating + ' / 5')}${row('Commute', `${e.commuteType} · ${Math.round(SPEED[e.commuteType] * 3.6)} km/h`)}${row('Current order', current ? current.id : '—')}
      ${locationBlock(e.id)}
      <h4>DRIVES TO</h4>${to.map((id) => `<div class="fd-rel">→ ${link(id)} · ${min(travelMin(e.position, anchorOf(byId(id)), e.commuteType))} by ${e.commuteType.toLowerCase()}</div>`).join('')}
      ${trip ? det(`dir-${e.id}`, `🧭 Directions · ${esc(trip.purpose)}`, trip.steps.map((s) => `<div class="fd-step">${esc(s)}</div>`).join('')) : ''}
      ${confidentialityBlock(e)}
      <h4>ACTIONS</h4><button data-act="track">Track delivery</button>`;
  } else if (e.type === 'Restaurant') {
    const drivers = rels.filter((r) => r.type === 'drivesTo' && r.to === e.id).map((r) => r.from);
    const orders = model.orders.filter((o) => o.restaurant === e.id);
    html = `<div class="fd-type" style="background:${COLORS.Restaurant}">RESTAURANT</div><h3>${e.id} · ${esc(e.name)}</h3>
      ${row('Cuisine · type', `${e.cuisineType.join(', ')} · ${e.storeType}`)}${row('Prep time', e.prepTime + ' min')}
      ${locationBlock(e.id)}
      <h4>RELATIONSHIPS</h4><div class="fd-rel">partners with ← ${link('UE01')} <span class="fd-chip-ue">sticker in window</span></div>
      ${drivers.map((id) => `<div class="fd-rel">driven to by ← ${link(id)}</div>`).join('')}
      ${orders.map((o) => `<div class="fd-rel">order ${link(o.id)} · ${esc(o.status)}</div>`).join('')}
      ${confidentialityBlock(e)}
      <h4>ACTIONS</h4><button data-act="receiveOrder">Receive order</button>`;
  } else if (e.type === 'UberEats') {
    const partners = rels.filter((r) => r.type === 'partnersWith').map((r) => r.to);
    html = `<div class="fd-type" style="background:${COLORS.UberEats}">UBEREATS · PLATFORM</div><h3>${esc(e.name)}</h3>
      ${row('Service charge', '$' + e.serviceCharge)}${row('Route', 'shortest path on the street grid')}${row('Membership', e.membership)}
      <h4>LOCATION</h4><div class="fd-note">UberEats is a service, not a place. It is present wherever a partner displays its sticker:</div>
      ${partners.map((id) => `<div class="fd-rel">partners with → ${link(id)} · ${esc(describe(anchorOf(byId(id)).x, anchorOf(byId(id)).z).junction.name)}</div>`).join('')}
      <h4>ACTIONS</h4><button data-act="pay">Receive payment</button><button data-act="track">Track delivery</button><button data-act="profile">Create profile</button>
      <h4>ASSISTANCE</h4><div class="fd-chat"></div>
      <form class="fd-ask"><input placeholder="Ask: where is my order?" /><button>Ask</button></form>
      <div class="fd-chips">${['Where is my order?', 'How long until it arrives?', "What's at Broadway & 112th?", 'Where is my driver?', 'Payment status?', "What's Sam's address?"].map((q) => `<button data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
  } else if (e.type === 'Customer') {
    html = `<div class="fd-type" style="background:${COLORS.Customer}">CUSTOMER</div><h3>${e.id} · ${esc(e.name)}</h3>
      ${locationBlock(e.id)}
      ${det(`prof-${e.id}`, '🔒 Private profile', Object.entries(e.profile).map(([k, v]) => row(FIELD_NAMES[k], v)).join(''))}
      ${det(`deliv-${e.id}`, '📦 Delivery info (shared only when needed)', Object.entries(e.delivery).map(([k, v]) => row(FIELD_NAMES[k], v)).join(''))}
      <h4>ACTIONS</h4><button data-act="profile">Edit profile</button>`;
  } else if (e.type === 'Order') {
    const err = validateOrder(e);
    const est = estimate(e);
    html = `<div class="fd-type" style="background:${COLORS.Order}">ORDER · PARCEL</div><h3>${e.id}</h3>
      ${row('Status', e.status)}${row('Items', e.items.join(', '))}${row('Paid', e.paid ? `Yes · $${e.orderValue.toFixed(2)}` : 'No')}
      <div class="fd-eta"><span>Estimated delivery<small>${etaParts(e, est)}</small></span><b>${e.status === 'Delivered' ? '✓' : min(est.total)}</b></div>
      ${locationBlock(e.id)}
      <h4>RELATIONSHIPS</h4><div class="fd-rel">placed by → ${link(e.customer)}</div><div class="fd-rel">ordered from → ${link(e.restaurant)}</div>
      <div class="fd-rel">assigned to → ${e.deliveryPartner ? link(e.deliveryPartner) : '—'}</div><div class="fd-rel">delivered through → ${link('UE01')}</div>
      <div class="${err ? 'fd-locked' : 'fd-ok'}">${err ? '⚠ ' + esc(err) : '✓ Valid order with a delivery time'}</div>
      <h4>ACTIONS</h4><button data-act="pay">Receive payment</button><button data-act="track">Track delivery</button>`;
  }
  html = `<button class="fd-x" data-close title="Close">×</button>` + html;
  if (panel.dataset.html === html) return; // unchanged — keep the DOM (and any click in progress)
  const chat = panel.querySelector('.fd-chat')?.innerHTML;
  panel.innerHTML = html;
  panel.dataset.html = html;
  if (chat && panel.querySelector('.fd-chat')) panel.querySelector('.fd-chat').innerHTML = chat;
}

// Live UI refresh — skipped while the pointer is over a panel so clicks are never lost.
statusEl.innerHTML = `<div class="fd-speed" title="Simulation speed">${[1, 5, 10, 30].map((x) => `<button data-speed="${x}">×${x}</button>`).join('')}</div><div class="fd-status-body"></div>`;
const statusBody = statusEl.querySelector('.fd-status-body');
function render(force = false) {
  const html = statusHTML();
  if (statusBody.dataset.html !== html) { statusBody.innerHTML = html; statusBody.dataset.html = html; }
  statusEl.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === timeScale));
  if (force || (!panel.matches(':hover') && !panel.contains(document.activeElement))) renderPanel();
}

// --- Location panel: the four location questions ------------------------------------
let locTab = 'where';
const loc = { where: 'O01', hereAve: 'broadway', hereStreet: 112, herePoint: null, frameOf: 'O01', frame: 'grid', text: '' };
const refOptions = () => [
  ...model.orders.map((o) => [o.id, `📦 Parcel ${o.id} (${byId(o.restaurant).name} → ${byId(o.customer).name})`]),
  ...model.deliveryPartners.map((d) => [d.id, `${d.id} ${d.name} (${d.commuteType})`]),
  ...model.restaurants.map((r) => [r.id, `${r.name}`]),
  ...model.customers.map((c) => [c.id, `${c.name}'s door`]),
  ['UE01', 'UberEats'],
  ...LANDMARKS.map((l) => [l.id, l.name]),
];
const options = (list, sel) => list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`).join('');

function renderLocTab() {
  root.querySelectorAll('.fd-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === locTab));
  if (locTab === 'where') {
    locBody.innerHTML = `<div class="fd-q-title">Given a referent, what is its location?</div>
      <select data-loc="where">${options(refOptions(), loc.where)}</select><div class="fd-out"></div><button data-fly-sel>Show on map</button>`;
  } else if (locTab === 'here') {
    const aves = AVENUES.map((a) => [a.id, a.name]);
    const sts = STREETS.map((n) => [n, streetShort(n)]);
    locBody.innerHTML = `<div class="fd-q-title">Given a location, what is occupying it?</div>
      <div class="fd-inline"><select data-loc="hereAve">${options(aves, loc.hereAve)}</select><span>&amp;</span><select data-loc="hereStreet">${options(sts, loc.hereStreet)}</select></div>
      <div class="fd-note">…or click anywhere on the map.</div><div class="fd-out"></div>`;
  } else if (locTab === 'frame') {
    const frames = [['grid', 'Street grid (avenues & streets)'], ['landmark', 'Nearest landmark'], ['gates', 'Columbia Main Gates'], ['customer', "Customer's doorstep"], ['rider', "Rider's own view (egocentric)"], ['geo', 'Geographic (lat / long)']];
    locBody.innerHTML = `<div class="fd-q-title">Given a frame of reference, where is an occupant?</div>
      <select data-loc="frameOf">${options(refOptions().filter(([v]) => v !== 'UE01'), loc.frameOf)}</select>
      <select data-loc="frame">${options(frames, loc.frame)}</select><div class="fd-out"></div>`;
  } else {
    locBody.innerHTML = `<div class="fd-q-title">Given a description, infer a more specific location.</div>
      <form class="fd-desc"><input value="${esc(loc.text)}" placeholder="e.g. the Indian place near the cathedral" /><button>Find</button></form>
      <div class="fd-chips">${['the Indian place near the cathedral', 'corner of 116th and Amsterdam', 'food truck by the Columbia gates', 'one block north of the cathedral', 'where my food is', "Priya's building"].map((q) => `<button data-desc="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="fd-out"></div>`;
  }
  updateLocOut();
}

function occupantsHTML(x, z) {
  const occ = occupantsAt(x, z, 45);
  const items = occ.list.map((o) => `<div class="fd-rel">${o.landmark ? '🏛' : '•'} ${link(o.id)} · ${Math.round(o.d)} m</div>`).join('');
  return `${items || '<div class="fd-note">Nothing from the delivery model is here right now.</div>'}
    <div class="fd-loc-sub">Also here: ${occ.vehicles} vehicle${occ.vehicles === 1 ? '' : 's'} in traffic · ${occ.people} pedestrian${occ.people === 1 ? '' : 's'}</div>`;
}

function updateLocOut() {
  const real = locBody.querySelector('.fd-out');
  if (!real) return;
  // build into a scratch object, then copy only if something changed (keeps links clickable)
  const out = { innerHTML: '' };
  fillLocOut(out);
  if (out.innerHTML && real.dataset.html !== out.innerHTML) { real.innerHTML = out.innerHTML; real.dataset.html = out.innerHTML; }
}

function fillLocOut(out) {
  if (locTab === 'where') {
    const id = loc.where;
    if (id === 'UE01') { out.innerHTML = '<div class="fd-loc-line">UberEats has no physical location — it is a platform. Its presence is the sticker in each partner storefront.</div>'; return; }
    const l = locationOf(id);
    if (!l) { out.innerHTML = '—'; return; }
    const d = describe(l.x, l.z);
    let time = '';
    const e = byId(id);
    if (e?.type === 'Order') {
      const est = estimate(e);
      time = e.status === 'Delivered' ? '<div class="fd-ok">✓ Delivered</div>' : `<div class="fd-time">⏱ ${e.active ? `arrives in <b>${min(est.total)}</b> (${clockText(simMin + est.total)})` : `if ordered now: <b>${min(est.total)}</b>`}${est.prep > 0 ? ` · ready in ${min(est.prep)}` : ''}</div>`;
    } else if (e?.type === 'DeliveryPartner' && trips.get(id)) {
      time = `<div class="fd-time">⏱ ${esc(trips.get(id).purpose)} · ${min(tripRemainingMin(e))} to go</div>`;
    }
    out.innerHTML = `${l.container ? `<div class="fd-loc-line">📦 ${esc(l.container)}</div>` : ''}
      <div class="fd-loc-line">📍 ${esc(d.text)}</div><div class="fd-loc-sub">Junction: <b>${esc(d.junction.name)}</b></div>${time}`;
  } else if (locTab === 'here') {
    const p = loc.herePoint || junction(loc.hereAve, +loc.hereStreet) || (() => { const a = avenue(loc.hereAve); return { x: a.x, z: streetZ(+loc.hereStreet) }; })();
    const d = describe(p.x, p.z);
    out.innerHTML = `<div class="fd-loc-line">📍 ${esc(loc.herePoint ? d.text : d.junction.name)}</div>${occupantsHTML(p.x, p.z)}`;
    marker.position.set(p.x, 0.3, p.z);
    marker.visible = true;
  } else if (locTab === 'frame') {
    const l = locationOf(loc.frameOf);
    if (!l) { out.innerHTML = '—'; return; }
    out.innerHTML = `<div class="fd-loc-line">${esc(frameSentence(loc.frameOf, l, loc.frame))}</div>`;
  } else if (locTab === 'describe' && loc.result) {
    out.innerHTML = loc.result;
  }
}

function frameSentence(id, l, frame) {
  const who = nameOf(id);
  if (frame === 'grid') return `${who} is ${describe(l.x, l.z).text}.`;
  if (frame === 'landmark') return `${who} is ${relativeTo(nearestLandmark(l.x, l.z), l.x, l.z)}.`;
  if (frame === 'gates') return `${who} is ${relativeTo(LANDMARKS.find((x) => x.id === 'mainGates'), l.x, l.z)}.`;
  if (frame === 'geo') return `${who} is at ${toLatLon(l.x, l.z)}.`;
  if (frame === 'customer') {
    const o = model.orders.find((x) => x.id === id) || model.orders[0];
    const c = byId(o.customer);
    const a = anchorOf(c);
    const mode = byId(o.deliveryPartner)?.commuteType || 'Bike';
    const r = route(l, a, mode);
    return `From ${c.name}'s doorstep, ${who} is ${relativeTo({ name: `${c.name}'s door`, x: a.x, z: a.z }, l.x, l.z).replace(` of ${c.name}'s door`, '')} — ${Math.round(r.length)} m by road, about ${min(r.length / SPEED[mode] / 60)} by ${mode.toLowerCase()}.`;
  }
  if (frame === 'rider') {
    const o = model.orders.find((x) => x.id === id);
    const dp = byId(o?.deliveryPartner) || model.deliveryPartners[0];
    if (dp.id === id) return `${who} is the observer here — pick another occupant to see it from ${dp.name}'s point of view.`;
    return `From ${dp.id} ${dp.name}'s seat (facing ${Math.abs(dp.heading.z) > Math.abs(dp.heading.x) ? (dp.heading.z < 0 ? 'north' : 'south') : dp.heading.x > 0 ? 'east' : 'west'}), ${who} is ${egocentric(dp.position, dp.heading, l.x, l.z)}.`;
  }
  return '';
}

// Q4: interpret a written description and resolve it to a specific place.
const WORD_NUM = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5 };
function resolveDescription(text) {
  const s = text.toLowerCase();
  const pp = parsePlace(text);
  let point = null;
  let how = '';
  let entity = null;
  // entities mentioned by name, cuisine or role
  const entityHits = [];
  for (const r of model.restaurants) {
    const words = [r.name.toLowerCase(), ...r.cuisineType.map((c) => c.toLowerCase()), r.storeType.toLowerCase(), ...r.name.toLowerCase().split(' ').filter((w) => w.length > 3)];
    if (words.some((w) => s.includes(w))) entityHits.push(r);
  }
  if (/pizza|pasta/.test(s)) entityHits.push(byId('R04'));
  if (/truck/.test(s) && !entityHits.includes(byId('R03'))) entityHits.push(byId('R03'));
  for (const c of model.customers) if (s.includes(c.name.toLowerCase())) entityHits.push(c);
  for (const d of model.deliveryPartners) if (s.includes(d.name.toLowerCase()) || s.includes(d.id.toLowerCase())) entityHits.push(d);
  if (/my food|my order|parcel|package|my delivery|the order|the bag/.test(s)) entityHits.push(model.orders.find((o) => o.active) || model.orders[0]);
  if (/my driver|my rider|courier/.test(s)) entityHits.push(byId((model.orders.find((o) => o.active) || model.orders[0]).deliveryPartner));

  const st = pp.streets;
  if (pp.aves.length && st.length) {
    const a = pp.aves[0];
    if (st.length >= 2) { point = P(a.x, (streetZ(st[0]) + streetZ(st[1])) / 2); how = `on ${a.name} between ${streetShort(st[0])} & ${streetShort(st[1])}`; }
    else { const j = junction(a.id, st[0]); point = j ? P(j.x, j.z) : P(a.x, streetZ(st[0])); how = `${a.name} & ${streetShort(st[0])}`; }
  } else if (st.length && pp.aves.length === 0 && pp.landmarks.length === 0 && entityHits.length === 0) {
    if (st.length >= 2) { const aves = pp.aves; point = P(-150, (streetZ(st[0]) + streetZ(st[1])) / 2); how = `between ${streetShort(st[0])} & ${streetShort(st[1])} (assuming Broadway, the main avenue)`; void aves; }
    else { point = P(-20, streetZ(st[0])); how = `${streetShort(st[0])} (middle of the Broadway–Amsterdam block — add an avenue to be more specific)`; }
  }
  const ref = pp.landmarks[0];
  if (!point && entityHits.length) {
    // several candidates? pick the one nearest the referenced landmark/avenue/street
    const near = ref ? P(ref.x, ref.z) : pp.aves[0] ? P(pp.aves[0].x, pp.streets[0] ? streetZ(pp.streets[0]) : 0) : null;
    entity = entityHits.sort((a, b) => (near ? Math.hypot(locationOf(a.id).x - near.x, locationOf(a.id).z - near.z) - Math.hypot(locationOf(b.id).x - near.x, locationOf(b.id).z - near.z) : 0))[0];
    const l = locationOf(entity.id);
    point = P(l.x, l.z);
    how = `${nameOf(entity.id)}${ref ? ` (the one near ${ref.name})` : ''}`;
  }
  if (!point && ref) {
    point = P(ref.x, ref.z);
    how = ref.name;
    if (pp.aves[0]) { point = P(pp.aves[0].x, ref.z); how = `${pp.aves[0].name} by ${ref.name}`; }
  }
  if (!point && pp.aves.length) {
    const a = pp.aves[0];
    point = P(a.x, streetZ(114));
    how = `${a.name} (no cross street given — showing ${a.name} & W 114th St; add a street number to be precise)`;
  }
  if (!point) return null;
  // directional modifiers: "two blocks north of …"
  const m2 = s.match(/(\d+(?:\.\d)?|a|one|two|three|four|five|half)\s*(?:a\s*)?blocks?\s+(north|south|east|west|uptown|downtown)/);
  const dir = m2 ? m2[2] : pp.dir;
  const nBlocks = m2 ? (WORD_NUM[m2[1]] ?? parseFloat(m2[1])) : 1;
  if (dir && dir !== 'across') {
    const dz = { north: -1, uptown: -1, south: 1, downtown: 1 }[dir] || 0;
    const dx = { east: 1, west: -1 }[dir] || 0;
    point = P(point.x + dx * nBlocks * 120, point.z + dz * nBlocks * BLOCK);
    how += ` → ${nBlocks} block${nBlocks === 1 ? '' : 's'} ${dir}`;
    entity = null;
  }
  const d = describe(point.x, point.z);
  return { point, how, entity, d };
}

function runDescribe(text) {
  loc.text = text;
  const r = resolveDescription(text);
  if (!r) {
    loc.result = '<div class="fd-locked">Could not place that description. Mention an avenue, a street number, a landmark or a restaurant.</div>';
  } else {
    loc.result = `<div class="fd-note">Understood as: <i>${esc(r.how)}</i></div>
      <div class="fd-loc-line">📍 ${esc(r.d.text)}</div>
      <div class="fd-loc-sub">Nearest junction: <b>${esc(r.d.junction.name)}</b> · ${esc(r.d.latlon)}</div>
      <h4>WHAT IS THERE</h4>${occupantsHTML(r.point.x, r.point.z)}`;
    marker.position.set(r.point.x, 0.3, r.point.z);
    marker.visible = true;
    flyTo(r.point, 140);
  }
  updateLocOut();
}

root.querySelector('.fd-tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  locTab = b.dataset.tab;
  if (locTab !== 'here') loc.herePoint = null;
  marker.visible = false;
  renderLocTab();
});
locBody.addEventListener('change', (ev) => {
  const k = ev.target.dataset.loc;
  if (!k) return;
  loc[k] = ev.target.value;
  if (k === 'hereAve' || k === 'hereStreet') {
    loc.herePoint = null;
    const j = junction(loc.hereAve, +loc.hereStreet);
    if (j) flyTo(P(j.x, j.z), 160);
    else toast(`${avenue(loc.hereAve).name} does not meet ${streetShort(+loc.hereStreet)} — there is no such junction.`, 'warn');
  }
  updateLocOut();
});
locBody.addEventListener('submit', (ev) => {
  ev.preventDefault();
  runDescribe(ev.target.querySelector('input').value);
});
locBody.addEventListener('click', (ev) => {
  const d = ev.target.closest('[data-desc]');
  if (d) return runDescribe(d.dataset.desc);
  if (ev.target.closest('[data-fly-sel]')) select(loc.where);
  const go = ev.target.closest('[data-go]');
  if (go) select(go.dataset.go);
});

// --- Selection, highlights and camera ----------------------------------------------
const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.55 }));
marker.geometry.translate(0, 15, 0);
marker.visible = false;
scene.add(marker);
const rings = [];
function ring(color) {
  const r = new THREE.Mesh(new THREE.RingGeometry(5.5, 7, 40), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
  r.rotation.x = -Math.PI / 2;
  r.renderOrder = 5;
  scene.add(r);
  return r;
}
let highlights = []; // { id, color }
function setHighlights(list) {
  rings.forEach((r) => (r.visible = false));
  highlights = list;
  list.forEach((h, i) => {
    if (!rings[i]) rings[i] = ring(h.color);
    rings[i].material.color.set(h.color);
    rings[i].visible = true;
  });
}

function select(id) {
  selectedId = id;
  if (!id) { setHighlights([]); renderPanel(); return; }
  const e = byId(id);
  const hl = [{ id, color: 0xffb400 }];
  const rel = model.relationships;
  if (e?.type === 'DeliveryPartner') rel.filter((r) => r.type === 'drivesTo' && r.from === id).forEach((r) => hl.push({ id: r.to, color: 0x2f80ed }));
  if (e?.type === 'Restaurant') rel.filter((r) => r.type === 'drivesTo' && r.to === id).forEach((r) => hl.push({ id: r.from, color: 0x2f80ed }));
  if (e?.type === 'UberEats') rel.filter((r) => r.type === 'partnersWith').forEach((r) => hl.push({ id: r.to, color: UE_GREEN }));
  if (e?.type === 'Order') ['restaurant', 'deliveryPartner', 'customer'].forEach((k) => e[k] && hl.push({ id: e[k], color: 0x8e5cd9 }));
  setHighlights(hl.filter((h) => locationOf(h.id)));
  renderPanel();
  const l = locationOf(id);
  if (l) flyTo(l, e?.type === 'Order' || e?.type === 'DeliveryPartner' ? 130 : 150);
  else if (e?.type === 'UberEats') flyTo(P(-20, 120), 650);
}

let fly = null;
let follow = null;
function flyTo(p, dist = 120) {
  const target = new THREE.Vector3(p.x, 2, p.z);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.75) { const h = Math.hypot(dir.x, dir.z) || 1; dir.x = (dir.x / h) * 0.6; dir.z = (dir.z / h) * 0.6; dir.y = 0.8; dir.normalize(); }
  fly = { fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: target.clone().addScaledVector(dir, dist), k: 0 };
}

// Route ribbons painted on the road ("drives to", made visible as navigation)
const routeTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(14, 8); g.lineTo(50, 32); g.lineTo(14, 56); g.lineTo(24, 32); g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
})();
const ribbons = new Map();
function drawRoute(riderId) {
  const old = ribbons.get(riderId);
  if (old) { scene.remove(old); old.geometry.dispose(); }
  const t = trips.get(riderId);
  if (!t) return;
  const pos = [], uv = [], idx = [];
  let acc = 0;
  const w = 2.2;
  for (let i = 1; i < t.points.length; i++) {
    const a = t.points[i - 1], b = t.points[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.01) continue;
    const nx = -(b.z - a.z) / L * w, nz = (b.x - a.x) / L * w;
    const k = pos.length / 3;
    pos.push(a.x + nx, 0.35, a.z + nz, a.x - nx, 0.35, a.z - nz, b.x - nx, 0.35, b.z - nz, b.x + nx, 0.35, b.z + nz);
    uv.push(acc / 5, 1, acc / 5, 0, (acc + L) / 5, 0, (acc + L) / 5, 1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    acc += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const color = t.purpose.startsWith('delivering') ? 0x8e5cd9 : 0x2f80ed;
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, map: routeTex.clone(), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  mesh.material.map.needsUpdate = true;
  mesh.renderOrder = 4;
  mesh.visible = showRoutes;
  scene.add(mesh);
  ribbons.set(riderId, mesh);
}
function clearRoute(riderId) {
  const old = ribbons.get(riderId);
  if (old) scene.remove(old);
  ribbons.delete(riderId);
}

// --- Assistance (respects confidentiality) ---------------------------------------
function answer(q) {
  const s = q.toLowerCase();
  const o = model.orders.find((x) => x.active) || model.orders[0];
  const me = byId(o.customer);
  const other = model.customers.find((c) => c.id !== me.id && s.includes(c.name.toLowerCase()));
  if (/card|password|payment detail|account history/.test(s) || (other && /address|live|where/.test(s))) return 'Sorry — payment details, passwords and other customers’ addresses are protected by the customer confidentiality rule.';
  if (/payment|paid/.test(s)) return o.paid ? `Payment received for ${o.id}.` : `Payment for ${o.id} is still pending.`;
  if (/what'?s at|what is at|who is at|what is on/.test(s)) {
    const r = resolveDescription(q);
    if (!r) return 'Tell me an avenue and a street, e.g. “What’s at Amsterdam & 116th?”';
    const occ = occupantsAt(r.point.x, r.point.z, 45);
    return `${r.d.junction.name}: ${occ.list.map((x) => x.name).join(', ') || 'nothing from the delivery network'}; ${occ.vehicles} vehicles and ${occ.people} people nearby.`;
  }
  if (/driver|rider|courier|partner/.test(s)) {
    const dp = byId(o.deliveryPartner);
    return `${dp.name} (${dp.id}, ${dp.rating}★, ${dp.commuteType.toLowerCase()}) is ${describe(dp.position.x, dp.position.z).text}.`;
  }
  if (/how long|eta|when|time/.test(s)) {
    const est = estimate(o);
    if (o.status === 'Delivered') return `${o.id} has been delivered.`;
    return `${o.id} should arrive in about ${min(est.total)} (${clockText(simMin + est.total)}): ${est.prep > 0 ? `${min(est.prep)} more cooking, ` : ''}${est.toRestaurant > 0 ? `rider ${min(est.toRestaurant)} from the restaurant, ` : ''}${min(est.ride)} ride to you.`;
  }
  if (/where|status|order|food/.test(s)) {
    const p = parcelPlace(o);
    const est = estimate(o);
    return `Order ${o.id} is ${o.status.toLowerCase()} — ${p.container}, ${describe(p.x, p.z).text}.${o.status !== 'Delivered' ? ` Estimated delivery: ${min(est.total)}.` : ''}`;
  }
  if (/restaurant/.test(s)) { const r = byId(o.restaurant); return `${r.name} — ${r.cuisineType.join('/')} ${r.storeType.toLowerCase()}, ${describe(anchorOf(r).x, anchorOf(r).z).text}.`; }
  const r = resolveDescription(q);
  if (r) return `That sounds like ${r.d.text} (near ${r.d.junction.name}).`;
  return 'I can help with your order’s location and status, delivery time, your driver, payment status and what is at any corner.';
}
function ask(q) {
  const chat = panel.querySelector('.fd-chat');
  if (!chat) return;
  chat.innerHTML += `<div class="fd-q">${esc(q)}</div><div class="fd-a">${esc(answer(q))}</div>`;
  chat.scrollTop = chat.scrollHeight;
}

panel.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-close]')) return select(null);
  const go = ev.target.closest('[data-go]');
  if (go) return select(go.dataset.go);
  const q = ev.target.closest('[data-ask]');
  if (q) return ask(q.dataset.ask);
  const act = ev.target.closest('[data-act]');
  if (act) actions[act.dataset.act]();
});
panel.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = ev.target.querySelector('input');
  if (input.value.trim()) ask(input.value.trim());
  input.value = '';
});
statusEl.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-speed]');
  if (b) { timeScale = +b.dataset.speed; render(true); }
});

// ===========================================================================
// 7. Actions and the delivery simulation
// ===========================================================================
let orderCount = 1;
let restaurantCycle = 1;

function assignDriver(order) {
  const r = byId(order.restaurant);
  const cands = model.deliveryPartners.map((dp) => {
    const busy = model.orders.some((o) => o.active && o !== order && o.deliveryPartner === dp.id && o.status !== 'Delivered');
    return { dp, busy, t: travelMin(dp.position, anchorOf(r), dp.commuteType) };
  });
  const free = cands.filter((c) => !c.busy).sort((a, b) => a.t - b.t);
  if (!free.length) { toast(`No delivery partner is free for ${order.id} — it waits for the next available rider.`, 'warn'); return null; }
  const best = free[0];
  order.deliveryPartner = best.dp.id;
  model.relationships = model.relationships.filter((x) => !(x.type === 'drivesTo' && x.from === best.dp.id) && !(x.type === 'assignedTo' && x.from === order.id));
  model.relationships.push({ type: 'drivesTo', from: best.dp.id, to: r.id }, { type: 'assignedTo', from: order.id, to: best.dp.id });
  const why = cands.map((c) => `${c.dp.id} ${c.busy ? 'busy' : `${min(c.t)} by ${c.dp.commuteType.toLowerCase()}`}`).join(', ');
  toast(`Delivery Partner ${best.dp.id} assigned to ${order.id} — closest by time (${why}).`);
  return best.dp;
}

function startOrder(o) {
  o.active = true;
  o.status = 'Placed';
  o.placedAt = simMin;
  o.readyAt = null;
  o.departAt = null;
  o.parcel = o.restaurant;
  toast(`Order ${o.id} placed by ${byId(o.customer).name} at ${clockText(simMin)}.`);
}

const actions = {
  pay() {
    const o = byId(selectedId)?.type === 'Order' ? byId(selectedId) : model.orders.find((x) => !x.paid) || model.orders[0];
    if (o.paid) return toast(`Order ${o.id} is already paid.`, 'warn');
    o.paid = true;
    toast(`Payment received for Order ${o.id} ($${(o.orderValue + o.deliveryFee + model.service.serviceCharge).toFixed(2)}). Card details stay private.`, 'ok');
    render(true);
  },
  receiveOrder() {
    const sel = byId(selectedId);
    const r = sel?.type === 'Restaurant' ? sel : model.restaurants[restaurantCycle++ % model.restaurants.length];
    const c = model.customers[(orderCount + 1) % model.customers.length];
    orderCount += 1;
    const id = 'O' + String(orderCount).padStart(2, '0');
    const items = [`${1 + (orderCount % 2)} × ${r.menu[orderCount % r.menu.length]}`, `1 × ${r.menu[(orderCount + 1) % r.menu.length]}`];
    const o = { id, type: 'Order', customer: c.id, restaurant: r.id, deliveryPartner: null, status: 'Placed', paid: true, active: false, items, orderValue: 18 + (orderCount % 4) * 6.5, deliveryFee: c.profile.membership === 'Uber One' ? 0 : 2.49, estimatedDeliveryTime: null, parcel: r.id };
    model.orders.push(o);
    model.relationships.push({ type: 'orderedFrom', from: id, to: r.id }, { type: 'placedBy', from: id, to: c.id }, { type: 'deliveredThrough', from: id, to: 'UE01' });
    addParcel(o);
    startOrder(o);
    toast(`New Order ${id} for ${r.name}: ${items.join(', ')} → ${c.name}, ${describe(anchorOf(c).x, anchorOf(c).z).junction.name}. Payment received.`, 'ok');
    if (locTab === 'where' || locTab === 'frame') renderLocTab();
    render(true);
  },
  profile() {
    const c = model.customers[0];
    const name = prompt('Create profile — your name:', c.name);
    if (!name) return;
    const email = prompt('Email (kept private):', c.profile.email) || c.profile.email;
    c.name = name;
    c.profile.email = email;
    toast(`Profile created for ${name}. Account info stays private; only delivery info is shared.`, 'ok');
    buildEntities();
    select(c.id);
  },
  track() {
    const o = model.orders[0];
    if (o.status === 'Delivered') return toast('Order O01 was delivered — press Reset to run it again.', 'warn');
    if (!o.paid) { toast('Rule: payment must be received before dispatch — receiving payment now.', 'warn'); actions.pay(); }
    if (!o.active) startOrder(o);
    follow = o.id;
    select(o.id);
  },
};

function processOrders() {
  for (const o of model.orders) {
    if (!o.active) continue;
    const r = byId(o.restaurant);
    const c = byId(o.customer);
    if (o.status === 'Placed' && simMin - o.placedAt >= 0.5) {
      o.status = 'Preparing';
      o.readyAt = simMin + r.prepTime;
      toast(`Order ${o.id} received by ${r.name} — ready in ${r.prepTime} min (${clockText(o.readyAt)}).`);
      const dp = o.deliveryPartner ? byId(o.deliveryPartner) : assignDriver(o);
      if (dp) {
        const t = travelMin(dp.position, anchorOf(r), dp.commuteType);
        o.departAt = Math.max(simMin, o.readyAt - t - 0.5);
        toast(`${dp.id} will set off at ${clockText(o.departAt)} so it reaches ${r.name} (${min(t)} away) as the food is ready.`);
      }
    }
    if (o.status === 'Preparing' && !o.deliveryPartner) {
      const dp = assignDriver(o);
      if (dp) o.departAt = simMin;
    }
    const dp = byId(o.deliveryPartner);
    if (o.status === 'Preparing' && simMin >= o.readyAt) {
      o.status = 'Ready for Pickup';
      toast(`Order ${o.id} is ready for pickup at ${r.name}.`);
    }
    if (dp && ['Preparing', 'Ready for Pickup'].includes(o.status) && o.departAt != null && simMin >= o.departAt && !trips.get(dp.id)?.order && !o.riderAtRestaurant) {
      const rt = startTrip(dp, anchorOf(r), `driving to ${r.name}`, o.id, r.id);
      toast(`${dp.id} is driving to ${r.name} — ${Math.round(rt.length)} m via ${rt.steps.map((x) => x.split(' on ')[1].split(' —')[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ')}.`);
    }
    if (dp && o.riderAtRestaurant && o.status === 'Ready for Pickup' && position.isAdjacent(dp, anchorOf(r))) {
      o.status = 'Picked Up';
      o.parcel = dp.id;
      o.pickedAt = simMin;
      const est = estimate(o);
      toast(`${dp.id} is ADJACENT to ${r.name} → pickup: ${o.id} goes INTO the bag (${clockText(simMin)}).`);
      setTimeout(() => {
        if (o.status !== 'Picked Up' || !model.orders.includes(o)) return;
        o.status = 'Out for Delivery';
        startTrip(dp, anchorOf(c), `delivering ${o.id} to ${c.name}`, o.id, c.id);
        toast(`${dp.id} is travelling to ${c.name} — estimated delivery ${min(estimate(o).total)}.`);
      }, (HANDOFF[dp.commuteType] * 60 * 1000) / timeScale);
      void est;
    }
    // "deliver" capability: the hand-over happens only once the rider is ADJACENT to the door
    if (dp && o.status === 'Out for Delivery' && o.atDoor && !o.handoff && position.isAdjacent(dp, anchorOf(c))) {
      o.handoff = true;
      toast(`${dp.id} is ADJACENT to ${c.name}'s door → delivering ${o.id}.`);
      setTimeout(() => {
        if (!model.orders.includes(o)) return;
        o.status = 'Delivered';
        o.deliveredAt = simMin;
        o.parcel = o.customer;
        o.active = false;
        dp.tips += 3;
        model.stats.delivered += 1;
        model.stats.totalMinutes += simMin - o.placedAt;
        toast(`Order ${o.id} delivered to ${c.name} at ${clockText(simMin)} — ${Math.round(simMin - o.placedAt)} min after ordering.`, 'ok');
        if (follow === o.id) follow = null;
        render(true);
      }, (HANDOFF[dp.commuteType] * 60 * 1000) / timeScale);
    }
    o.estimatedDeliveryTime = Math.round(estimate(o).total);
  }
}

function arrive(dp, trip) {
  const o = model.orders.find((x) => x.id === trip.order);
  if (!o) return;
  if (trip.purpose.startsWith('driving to')) {
    o.riderAtRestaurant = true;
    if (o.status !== 'Ready for Pickup') toast(`${dp.id} arrived at ${byId(o.restaurant).name} and is waiting — the food needs ${min(o.readyAt - simMin)} more.`);
  } else {
    o.atDoor = true; // the hand-over itself waits for adjacency (see processOrders)
  }
}

function stepRiders(dtSim, factorOf = () => 1) {
  for (const dp of model.deliveryPartners) {
    const t = trips.get(dp.id);
    const obj = objects.get(dp.id);
    if (t) {
      t.s = Math.min(t.len, t.s + SPEED[dp.commuteType] * dtSim * factorOf(dp.id));
      let acc = 0;
      for (let i = 1; i < t.points.length; i++) {
        const a = t.points[i - 1], b = t.points[i];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (acc + L >= t.s || i === t.points.length - 1) {
          const k = L ? Math.min(1, (t.s - acc) / L) : 1;
          dp.position = P(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
          if (L > 0.5) dp.heading = P((b.x - a.x) / L, (b.z - a.z) / L);
          break;
        }
        acc += L;
      }
      if (obj) obj.userData.wheels?.forEach((w) => (w.rotation.x += dtSim * 2 * factorOf(dp.id)));
      if (t.s >= t.len) {
        trips.delete(dp.id);
        clearRoute(dp.id);
        arrive(dp, t);
      }
    }
    if (obj) {
      obj.position.set(dp.position.x, city.groundAt(dp.position.x, dp.position.z) - 0.1, dp.position.z);
      obj.rotation.y = Math.atan2(-dp.heading.x, -dp.heading.z);
    }
  }
}

// Riders without an order head to their usual restaurant — "drives to", acted out.
function startIdleRuns() {
  for (const dp of model.deliveryPartners) {
    if (dp.id === 'DP01') continue;
    const rel = model.relationships.find((r) => r.type === 'drivesTo' && r.from === dp.id);
    if (rel) startTrip(dp, anchorOf(byId(rel.to)), `driving to ${byId(rel.to).name} for the lunch rush`, null, rel.to);
  }
}

// ===========================================================================
// 8. Distance: three pickup → delivery routes, a 2D plan, and road closures
// ===========================================================================
// The three delivery jobs shown on the plan (pickup restaurant → customer door).
const JOBS = [
  { id: 'J1', pickup: 'R01', delivery: 'C01', rider: 'DP01' },
  { id: 'J2', pickup: 'R02', delivery: 'C03', rider: 'DP02' },
  { id: 'J3', pickup: 'R03', delivery: 'C02', rider: 'DP03' },
];
const DEFAULT_CLOSURES = [PRESET_CLOSURES[0]];
const resetClosures = () => { CLOSURES.clear(); DEFAULT_CLOSURES.forEach((c) => CLOSURES.set(c.id, c.reason)); };
resetClosures();

const distGroup = new THREE.Group(); // job routes + P/D pins (visible in distance mode)
const closureGroup = new THREE.Group(); // barricades (always visible — they are part of the street)
scene.add(distGroup, closureGroup);

const stripeTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#f26b1d';
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
})();

function ribbonMesh(points, color, width, y, opacity = 0.95) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.01) continue;
    const nx = (-(b.z - a.z) / L) * width, nz = ((b.x - a.x) / L) * width;
    const k = pos.length / 3;
    pos.push(a.x + nx, y, a.z + nz, a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz, b.x + nx, y, b.z + nz);
    uv.push(acc / 6, 1, acc / 6, 0, (acc + L) / 6, 0, (acc + L) / 6, 1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    acc += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const map = routeTex.clone();
  map.needsUpdate = true;
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  mesh.renderOrder = 4;
  return mesh;
}

function barricade(e) {
  const g = new THREE.Group();
  const A = NODES.get(e.a), B = NODES.get(e.b);
  const along = A.x === B.x ? 'z' : 'x';
  const width = along === 'z' ? avenue(A.ave).w : streetWidth(A.n);
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  // red wash along the closed block
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(along === 'x' ? len - 30 : width - 2, along === 'z' ? len - 30 : width - 2), new THREE.MeshBasicMaterial({ color: 0xd62d20, transparent: true, opacity: 0.28, depthWrite: false }));
  wash.rotation.x = -Math.PI / 2;
  wash.position.set((A.x + B.x) / 2, 0.3, (A.z + B.z) / 2);
  g.add(wash);
  const barMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
  const legMat = m(0xf2f2f2);
  const coneMat = m(0xf26b1d);
  for (const end of [A, B]) {
    const dir = end === A ? 1 : -1; // inwards along the segment
    const crossW = width - 2;
    const cx = along === 'x' ? end.x + dir * 15 : end.x;
    const cz = along === 'z' ? end.z + dir * 15 : end.z;
    const board = new THREE.Mesh(new THREE.BoxGeometry(along === 'z' ? crossW : 0.25, 0.5, along === 'x' ? crossW : 0.25), barMat);
    board.position.set(cx, 1.1, cz);
    board.castShadow = true;
    g.add(board);
    const board2 = board.clone();
    board2.position.y = 0.45;
    g.add(board2);
    for (let k = -1; k <= 1; k += 2) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), legMat);
      leg.position.set(cx + (along === 'z' ? k * crossW * 0.45 : 0), 0.7, cz + (along === 'x' ? k * crossW * 0.45 : 0));
      g.add(leg);
    }
    for (let c = -2; c <= 2; c++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 10), coneMat);
      cone.position.set(cx + (along === 'z' ? c * crossW * 0.2 : dir * 3), 0.45, cz + (along === 'x' ? c * crossW * 0.2 : dir * 3));
      g.add(cone);
    }
  }
  const why = textSprite(`⛔ CLOSED · ${CLOSURES.get(e.id)}`, { color: '#fff', bg: '#d62d20', size: 0.019 });
  why.position.set((A.x + B.x) / 2, 7, (A.z + B.z) / 2);
  g.add(why);
  return g;
}

let distanceMode = true;
function onDistanceChange(routes) {
  distGroup.clear();
  routes.forEach((r) => {
    const off = (r.i - 1) * 6; // side-by-side when routes share a street
    const shifted = r.actual.points.map((p) => P(p.x + off, p.z + off));
    distGroup.add(ribbonMesh(shifted, r.color, 3.6, 0.42 + r.i * 0.02));
    for (const [pt, tag, col] of [[r.P, `P${r.i + 1}`, '#1d1d1f'], [r.D, `D${r.i + 1}`, '#7c3aed']]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 8), m(col === '#1d1d1f' ? 0x1d1d1f : 0x7c3aed));
      pin.position.set(pt.x, 7, pt.z);
      distGroup.add(pin);
      const lab = textSprite(`${tag} · ${byId(tag.startsWith('P') ? r.job.pickup : r.job.delivery).name}`, { color: '#fff', bg: col, size: 0.02 });
      lab.position.set(pt.x, 15.5, pt.z);
      distGroup.add(lab);
    }
  });
  distGroup.visible = distanceMode;
  closureGroup.clear();
  for (const id of CLOSURES.keys()) { const e = edgeById(id); if (e) closureGroup.add(barricade(e)); }
  // riders already on the road re-plan around the closures
  for (const dp of model.deliveryPartners) {
    const t = trips.get(dp.id);
    if (!t) continue;
    const before = t.len - t.s;
    const r = startTrip(dp, t.target, t.purpose, t.order, t.targetId);
    if (r.length > before + 20) toast(`${dp.id} re-routed around the closure: +${Math.round(r.length - before)} m.`, 'warn');
  }
}

const distEl = root.querySelector('.fd-dist');
const distance = createDistancePanel(distEl, {
  jobs: () => JOBS.map((j) => ({ ...j, mode: byId(j.rider).commuteType })),
  anchorOf, byId, SPEED, HANDOFF,
  riders: () => model.deliveryPartners,
  onChange: onDistanceChange,
});

// ===========================================================================
// 9. Proximity: boundaries, perception and "too close" rules for delivery partners
// ===========================================================================
const proximity = createProximity({
  scene,
  city,
  riders: () => model.deliveryPartners,
  objectOf: (id) => objects.get(id),
  panelEl: root.querySelector('.fd-prox'),
  onFollow: (id) => { const dp = byId(id); if (dp) { flyTo(dp.position, 55); follow = id; } },
  customerDistance: (dp) => {
    const o = model.orders.find((x) => x.active && x.deliveryPartner === dp.id && ['Picked Up', 'Out for Delivery'].includes(x.status));
    if (!o) return null;
    const a = anchorOf(byId(o.customer));
    return Math.hypot(dp.position.x - a.x, dp.position.z - a.z);
  },
});

// ===========================================================================
// 10. Position + Movement (workshop): prepositions computed live, with indicators
// ===========================================================================
position = createPosition({
  scene,
  city,
  riders: () => model.deliveryPartners,
  places: () => [...model.restaurants, ...model.customers].map((e) => ({ id: e.id, name: e.name, at: anchorOf(e) })),
  orders: () => model.orders,
  parcelPlace,
  nameOf: (id) => byId(id)?.name || id,
  trips,
  clock: Object.assign(() => clockText(simMin), { raw: () => simMin }),
  closures: () => [...CLOSURES.keys()].map((id) => edgeById(id)).filter(Boolean).map((e) => ({ id: e.id, label: e.label, a: NODES.get(e.a), b: NODES.get(e.b) })),
});
const posEl = root.querySelector('.fd-pos');
const movEl = root.querySelector('.fd-mov');
posEl.innerHTML = `<div class="fd-q-title">Positioning · where things are relative to each other</div>
  <label class="fd-closure"><input type="checkbox" class="fd-pos-show" checked /> Show position indicators</label><div class="fd-pos-live"></div>`;
movEl.innerHTML = `<div class="fd-q-title">Movement · how things move relative to each other</div>
  <label class="fd-closure"><input type="checkbox" class="fd-mov-show" checked /> Show movement indicators</label><div class="fd-mov-live"></div>`;
posEl.querySelector('.fd-pos-show').addEventListener('change', (e) => (position.showPos.value = e.target.checked));
movEl.querySelector('.fd-mov-show').addEventListener('change', (e) => (position.showMov.value = e.target.checked));
const chip = (color, label) => `<span class="fd-prep" style="--c:${color}">${label}</span>`;
function renderPositionPanels() {
  const L = position.live;
  const list = (items, empty) => (items.length ? items.slice(0, 6).map((t) => `<div class="fd-rel">${esc(t)}</div>`).join('') : `<div class="fd-note">${empty}</div>`);
  const metric = (t) => `<small class="fd-metric">📏 ${t}</small>`;
  const pos = `
    <div class="fd-pgroup">${chip('#8a6a2f', 'IN / ON')}<small>Where the parcel is relative to its container</small>${metric('Containment: parcel → kitchen / pickup shelf / rider bag / door (the container\'s location is the parcel\'s location)')}${list(L.inOn, '—')}</div>
    <div class="fd-pgroup">${chip('#16a34a', 'ADJACENT')}<small>Rider and door with no occupiable location between them → pickup / delivery only happens then</small>${metric('Euclidean distance ≤ 4 m AND no person or vehicle within 0.9 m of the line between them')}${list(L.adjacent, 'No rider is adjacent to a door right now.')}</div>
    <div class="fd-pgroup">${chip('#f59e0b', 'BETWEEN')}<small>A person or vehicle between a rider and its next turn → rider yields</small>${metric('Projection onto rider→turn segment: 1 m < along < 18 m and lateral offset < 1.8 m')}${list(L.between, 'Nothing between riders and their next turn.')}</div>
    <div class="fd-pgroup">${chip('#7c3aed', 'AMONG')}<small>3+ people clustered → a circle is drawn round them; riders inside slow to half speed</small>${metric('Single-link clustering: each person within 3.5 m of another, ≥ 3 people; circle radius = farthest member + 1.6 m')}<div class="fd-rel">${L.clusters.length} cluster${L.clusters.length === 1 ? '' : 's'} of people${L.clusters.length ? ` · largest ×${Math.max(...L.clusters.map((c) => c.n))}` : ''}</div></div>
    <div class="fd-pgroup">${chip('#2563eb', 'BEHIND')}<small>Rider following a vehicle in its lane</small>${metric('Vehicle ahead along the rider\'s heading: 0–14 m along, < 2.2 m lateral')}${list(L.behind, 'No rider is behind a vehicle.')}</div>
    <div class="fd-pgroup">${chip('#dc2626', 'WARN')}<small>Capability: road-closure barricades warn riders that come near</small>${metric('Euclidean distance from rider to either end of a closed block < 24 m')}${list(L.warned, 'No warnings.')}</div>`;
  const mov = `
    <div class="fd-pgroup">${chip('#16a34a', 'TOWARD')} ${chip('#dc2626', 'AWAY FROM')}<small>Arrow over each moving rider: is it getting closer to its target?</small>${metric('Change in straight-line distance to the target per update (smoothed): falling = toward, rising = away')}${list(L.movement, 'No rider is moving.')}</div>
    <div class="fd-pgroup">${chip('#8a6a2f', 'INTO / OUT OF')}<small>Parcel into the bag / out to the customer; riders into / out of a crowd</small>${metric('Change of container, or crossing a crowd circle\'s radius')}</div>
    <div class="fd-pgroup">${chip('#0ea5e9', 'PAST')}<small>Rider goes past a restaurant, door or another rider</small>${metric('Along-heading coordinate changes sign (ahead → behind) with lateral distance < 28 m')}</div>
    <div class="fd-pgroup">${chip('#db2777', 'AROUND')}<small>Rider de-routes around a road closure</small>${metric('Street-network route length vs. the route if every street were open: > 20 m longer')}</div>
    <div class="fd-pgroup"><b>Event log</b> <small>each event also pulses on the map</small>
      ${position.log.length ? position.log.slice(0, 8).map((e) => `<div class="fd-ev"><span>${esc(e.t)}</span> ${esc(e.text)}</div>`).join('') : '<div class="fd-note">Press ▶ Track delivery to see movement events.</div>'}</div>`;
  const pl = posEl.querySelector('.fd-pos-live'), ml = movEl.querySelector('.fd-mov-live');
  if (!pl.matches(':hover') && pl.dataset.html !== pos) { pl.innerHTML = pos; pl.dataset.html = pos; }
  if (!ml.matches(':hover') && ml.dataset.html !== mov) { ml.innerHTML = mov; ml.dataset.html = mov; }
}

let leftMode = 'position';
function setLeftMode(mode) {
  leftMode = mode;
  for (const m of ['position', 'movement', 'proximity', 'distance', 'locate']) root.classList.toggle(`fd-mode-${m}`, mode === m);
  root.querySelectorAll('.fd-sidetabs button').forEach((b) => b.classList.toggle('on', b.dataset.side === mode));
  distanceMode = mode === 'distance';
  distGroup.visible = distanceMode;
  if (distanceMode) distance.refresh(true);
}
root.querySelector('.fd-sidetabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-side]');
  if (b) setLeftMode(b.dataset.side);
  if (ev.target.closest('[data-collapse]')) root.classList.toggle('fd-collapsed');
});
// on-screen navigation buttons
root.querySelector('.fd-nav').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-nav]');
  if (!b) return;
  follow = null;
  const off = camera.position.clone().sub(controls.target);
  const n = b.dataset.nav;
  if (n === 'in' || n === 'out') {
    const k = n === 'in' ? 0.7 : 1.4;
    const len = THREE.MathUtils.clamp(off.length() * k, controls.minDistance, controls.maxDistance);
    fly = { fromT: controls.target.clone(), toT: controls.target.clone(), fromP: camera.position.clone(), toP: controls.target.clone().add(off.setLength(len)), k: 0.4 };
  } else if (n === 'left' || n === 'right') {
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), n === 'left' ? 0.5 : -0.5);
    fly = { fromT: controls.target.clone(), toT: controls.target.clone(), fromP: camera.position.clone(), toP: controls.target.clone().add(off), k: 0.4 };
  } else if (n === 'top') {
    fly = { fromT: controls.target.clone(), toT: controls.target.clone(), fromP: camera.position.clone(), toP: controls.target.clone().add(new THREE.Vector3(0.01, Math.max(off.length(), 200), 40)), k: 0 };
  } else if (n === 'home') {
    fly = { fromT: controls.target.clone(), toT: HOME.target.clone(), fromP: camera.position.clone(), toP: HOME.pos.clone(), k: 0 };
  }
});

// --- Toolbar ---------------------------------------------------------------------
root.querySelector('.fd-toolbar').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const a = b.dataset.tool;
  if (a === 'reset') {
    resetAll();
    toast('Model reset to the initial example.');
  } else if (a === 'assist') {
    select('UE01');
  } else if (a === 'home') {
    follow = null;
    fly = { fromT: controls.target.clone(), toT: HOME.target.clone(), fromP: camera.position.clone(), toP: HOME.pos.clone(), k: 0 };
  } else {
    actions[a]();
  }
});

function resetAll() {
  [...ribbons.keys()].forEach(clearRoute);
  trips.clear();
  model = initialModel();
  simMin = 12 * 60;
  orderCount = 1;
  restaurantCycle = 1;
  follow = null;
  selectedId = null;
  setHighlights([]);
  marker.visible = false;
  loc.herePoint = null;
  loc.result = null;
  loc.text = '';
  resetClosures();
  buildEntities();
  startIdleRuns();
  distance.refresh(true);
  render();
  renderLocTab();
  fly = { fromT: controls.target.clone(), toT: HOME.target.clone(), fromP: camera.position.clone(), toP: HOME.pos.clone(), k: 0 };
}

// --- Picking ------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; fly = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) { follow = null; return; }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  if (hit) {
    let o = hit.object;
    while (o && !o.userData.id) o = o.parent;
    if (o) return select(o.userData.id);
  }
  // Clicked the city itself: answer "what is here?"
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, p)) {
    loc.herePoint = P(p.x, p.z);
    locTab = 'here';
    setLeftMode('locate');
    renderLocTab();
    select(null);
  }
});

// --- Resize & loop ------------------------------------------------------------------
function resize() {
  const w = canvasHost.clientWidth;
  const h = canvasHost.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvasHost);

const clock = new THREE.Clock();
let uiTimer = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const dtSim = dt * timeScale; // simulated seconds this frame
  simMin += dtSim / 60;
  processOrders();
  city.setObstacles(model.deliveryPartners.filter((d) => trips.has(d.id)).map((d) => d.position)); // parked riders sit at the kerb
  proximity.update(dt, dtSim, trips);
  stepRiders(dtSim, (id) => proximity.factor(id) * (position.inCrowd(id) ? 0.5 : 1)); // AMONG a crowd → half speed
  position.update(dt);

  // parcels follow their container
  for (const o of model.orders) {
    const obj = objects.get(o.id);
    const p = parcelPlace(o);
    if (!obj || !p) continue;
    obj.visible = p.visible;
    obj.position.set(p.x, p.y + city.groundAt(p.x, p.z), p.z);
  }
  // labels float above their objects
  labels.forEach((l, id) => {
    const obj = objects.get(id);
    if (!obj) return;
    l.position.set(obj.position.x, obj.position.y + l.userData.offsetY, obj.position.z);
    l.visible = obj.visible || byId(id)?.type === 'Order';
  });
  highlights.forEach((h, i) => {
    const l = locationOf(h.id);
    if (!l || !rings[i]) return;
    rings[i].position.set(l.x, city.groundAt(l.x, l.z) + 0.3, l.z);
    rings[i].scale.setScalar(1 + 0.08 * Math.sin(t * 4));
  });
  ribbons.forEach((r) => (r.material.map.offset.x -= dt * 0.8));
  distGroup.children.forEach((c) => c.material?.map && c.isMesh && c.geometry.attributes.uv && (c.material.map.offset.x -= dt * 0.6));
  marker.material.opacity = 0.35 + 0.25 * Math.sin(t * 3);

  if (follow && !fly) {
    const l = locationOf(follow);
    if (l) {
      const target = new THREE.Vector3(l.x, 2, l.z);
      const delta = target.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(delta);
      camera.position.add(delta);
    }
  }
  if (fly) {
    fly.k = Math.min(1, fly.k + dt / 1.2);
    const e = fly.k < 0.5 ? 2 * fly.k * fly.k : 1 - Math.pow(-2 * fly.k + 2, 2) / 2;
    controls.target.lerpVectors(fly.fromT, fly.toT, e);
    camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (fly.k >= 1) fly = null;
  }
  // keep the view over the site
  const cx = THREE.MathUtils.clamp(controls.target.x, BOUNDS.x0, BOUNDS.x1) - controls.target.x;
  const cz = THREE.MathUtils.clamp(controls.target.z, BOUNDS.z0, BOUNDS.z1) - controls.target.z;
  if (cx || cz) { controls.target.x += cx; controls.target.z += cz; camera.position.x += cx; camera.position.z += cz; }
  city.update(dt, t, controls.target, dtSim);
  uiTimer += dt;
  if (uiTimer > 0.4) {
    uiTimer = 0;
    render();
    renderPositionPanels();
    if (distanceMode) distance.refresh();
    if (!locBody.matches(':hover') && !locBody.contains(document.activeElement)) updateLocOut();
    const o0 = model.orders.find((o) => o.id === 'O01');
    labels.forEach((l, id) => {
      const o = model.orders.find((x) => x.id === id);
      if (!o) return;
      const txt = `📦 ${o.id} · ${o.status}${o.status !== 'Delivered' && o.active ? ` · ${min(estimate(o).total)}` : ''}`;
      if (l.userData.text !== txt) {
        const fresh = textSprite(txt, { color: COLORS.Order, border: COLORS.Order, size: 0.022 });
        l.material.map.dispose();
        l.material = fresh.material;
        l.scale.copy(fresh.scale);
        l.userData.text = txt;
      }
    });
    void o0;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

buildEntities();
startIdleRuns();
render();
renderLocTab();
proximity.select('DP02');
setLeftMode('position');
onDistanceChange(distance.routes());
resize();
tick();
