import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './food-delivery-environment.js?v=4';

// ---------------------------------------------------------------------------
// Semantic data (kept separate from the scene)
// ---------------------------------------------------------------------------
function initialModel() {
  return {
    deliveryPartners: [
      { id: 'DP01', type: 'DeliveryPartner', name: 'Arjun', rating: 4.8, commuteType: 'Bike', vehicle: 'Motorcycle', tips: 12.5 },
      { id: 'DP02', type: 'DeliveryPartner', name: 'Maya', rating: 4.6, commuteType: 'Car', vehicle: 'Hatchback', tips: 8.0 },
      { id: 'DP03', type: 'DeliveryPartner', name: 'Leo', rating: 4.9, commuteType: 'Bicycle', vehicle: 'Road bike', tips: 15.25 },
    ],
    restaurants: [
      { id: 'R01', type: 'Restaurant', name: 'Indian Kitchen', cuisineType: ['Indian', 'Asian'], storeType: 'Restaurant' },
      { id: 'R02', type: 'Restaurant', name: 'Thai Leaf', cuisineType: ['Thai'], storeType: 'Cafe' },
      { id: 'R03', type: 'Restaurant', name: 'Wok on Wheels', cuisineType: ['Chinese'], storeType: 'Food Truck' },
      { id: 'R04', type: 'Restaurant', name: 'Trattoria Roma', cuisineType: ['Italian'], storeType: 'Fine Dining' },
    ],
    service: { id: 'UE01', type: 'UberEats', name: 'UberEats', serviceCharge: 3.99, route: 'R01 → C01', deliveryTime: 32, membership: 'Uber One' },
    customers: [
      {
        id: 'C01', type: 'Customer', name: 'Priya',
        // Profile / account information (private)
        profile: { email: 'priya@example.com', phone: '+1 555 0142', membership: 'Uber One', password: '••••••', payment: 'Visa •••• 4242', history: '41 past orders' },
        // Information required for delivery (shareable)
        delivery: { address: '221 Elm St, Apt 4', instructions: 'Leave at the door', orderNumber: 'O01' },
      },
    ],
    orders: [
      { id: 'O01', customer: 'C01', restaurant: 'R01', deliveryPartner: 'DP01', status: 'Placed', paid: false, items: ['2 × Paneer Tikka', '1 × Naan'], estimatedDeliveryTime: 35 },
    ],
    relationships: [
      { type: 'drivesTo', from: 'DP01', to: 'R01' },
      { type: 'drivesTo', from: 'DP02', to: 'R02' },
      { type: 'drivesTo', from: 'DP03', to: 'R03' },
      { type: 'partnersWith', from: 'UE01', to: 'R01' },
      { type: 'partnersWith', from: 'UE01', to: 'R02' },
      { type: 'partnersWith', from: 'UE01', to: 'R03' },
      { type: 'partnersWith', from: 'UE01', to: 'R04' },
    ],
  };
}

let model = initialModel();

const byId = (id) =>
  [...model.deliveryPartners, ...model.restaurants, model.service, ...model.customers, ...model.orders].find((e) => e.id === id);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
const VISIBLE_TO = {
  DeliveryPartner: ['address', 'instructions', 'orderNumber'],
  Restaurant: ['orderNumber'],
  UberEats: ['address', 'instructions', 'orderNumber', 'membership'],
};

// Rule 1: confidentiality — returns only the customer fields an entity may see.
function customerViewFor(entityType, customer) {
  const allowed = VISIBLE_TO[entityType] || [];
  const all = { ...customer.delivery, ...customer.profile };
  const visible = {};
  const hidden = [];
  for (const [k, v] of Object.entries(all)) {
    if (allowed.includes(k)) visible[k] = v;
    else hidden.push(k);
  }
  return { visible, hidden };
}

// Rule 2: delivery time — every active order has an ETA tied to its status.
const ETA_BY_STATUS = { Placed: 35, Accepted: 32, Preparing: 28, 'Picked Up': 18, 'Out for Delivery': 12, Delivered: 0 };

function validateOrder(order) {
  if (!order.restaurant) return 'Order must have a restaurant.';
  if (!order.deliveryPartner) return 'Order requires a delivery partner before dispatch.';
  if (order.status !== 'Delivered' && order.estimatedDeliveryTime == null) return 'Active orders must have an estimated delivery time.';
  return null;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const root = document.getElementById('fd3d');
const canvasHost = root.querySelector('.fd-canvas');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(-10, 15, 46);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(2, 2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;
controls.maxDistance = 220;

const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.castShadow = true;
scene.add(sun);

// Sky, terrain, lake, trees and animals (decorative, outside the semantic model).
const environment = createEnvironment({ scene, renderer, camera, sun, hemi });

const COLORS = { DeliveryPartner: 0x2f80ed, Restaurant: 0xe8743b, UberEats: 0x06c167, Customer: 0x8e5cd9, drivesTo: 0x2f80ed, partnersWith: 0x06c167, route: 0x8e5cd9 };

function makeLabel(text, { color = '#222', bg = 'rgba(255,255,255,0.92)', size = 1 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 44px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w;
  c.height = 72;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 72, 16);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false, fog: false }));
  sprite.scale.set((w / 72) * 0.9 * size, 0.9 * size, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function setLabelText(sprite, text, opts) {
  const fresh = makeLabel(text, opts);
  sprite.material.map.dispose();
  sprite.material.dispose();
  sprite.material = fresh.material;
  sprite.scale.copy(fresh.scale);
}

const std = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

function makeRider(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.4, 16), std(color));
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), std(0xf2d3b3));
  head.position.y = 1.75;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(color));
  helmet.position.y = 1.8;
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std(0x06c167));
  bag.position.set(0, 1.0, -0.6);
  [body, head, helmet, bag].forEach((m) => { m.castShadow = true; g.add(m); });
  return g;
}

function makeRestaurant(color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), std(0xfaf8f4));
  base.position.y = 1.2;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 0.9), std(color));
  awning.position.set(0, 1.9, 1.4);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 2.6), std(color));
  roof.position.y = 2.55;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.05), std(0x5a4636));
  door.position.set(0, 0.6, 1.22);
  [base, awning, roof, door].forEach((m) => { m.castShadow = true; g.add(m); });
  return g;
}

function makeHub(color) {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.6, 32), std(0x1d1d1f));
  plinth.position.y = 0.3;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.3), std(color));
  core.position.y = 2.3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.08, 8, 48), std(color));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 2.3;
  [plinth, core, ring].forEach((m) => { m.castShadow = true; g.add(m); });
  g.userData.spin = [core, ring];
  return g;
}

function makeHouse(color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), std(0xfaf8f4));
  base.position.y = 0.8;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.2, 4), std(color));
  roof.position.y = 2.2;
  roof.rotation.y = Math.PI / 4;
  [base, roof].forEach((m) => { m.castShadow = true; g.add(m); });
  return g;
}

function makePackage() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), std(0xc8a06a));
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.2), std(0x06c167));
  tape.position.y = 0.3;
  g.add(box, tape);
  return g;
}

const LAYOUT = {
  DP01: new THREE.Vector3(-14, 0, -7), DP02: new THREE.Vector3(-14, 0, 0), DP03: new THREE.Vector3(-14, 0, 7),
  R01: new THREE.Vector3(0, 0, -10), R02: new THREE.Vector3(0, 0, -3.3), R03: new THREE.Vector3(0, 0, 3.3), R04: new THREE.Vector3(0, 0, 10),
  UE01: new THREE.Vector3(14, 0, 0),
  C01: new THREE.Vector3(-8, 0, 17),
};

const entityObjects = new Map(); // id -> group
const pickables = [];
let dynamic = []; // objects removed on reset
const flows = []; // animated particles along curves
let relationshipGroup;
let showRelationships = true;

function addEntity(id, group, labelText, color) {
  group.position.copy(LAYOUT[id]);
  group.userData.id = id;
  group.userData.basePos = LAYOUT[id].clone();
  const label = makeLabel(labelText, { color: '#' + color.toString(16).padStart(6, '0') });
  label.position.y = 4;
  group.add(label);
  group.userData.label = label;
  scene.add(group);
  entityObjects.set(id, group);
  pickables.push(group);
  dynamic.push(group);
}

function sectionTitle(text, pos) {
  const s = makeLabel(text, { color: '#666', bg: 'rgba(0,0,0,0)', size: 1.3 });
  s.position.copy(pos);
  scene.add(s);
}
sectionTitle('DELIVERY PARTNERS', new THREE.Vector3(-14, 0.5, -14));
sectionTitle('RESTAURANTS', new THREE.Vector3(0, 0.5, -15));
sectionTitle('UBEREATS', new THREE.Vector3(14, 0.5, -5));
sectionTitle('CUSTOMER', new THREE.Vector3(-8, 0.5, 21));

function curveBetween(a, b, lift = 3) {
  const from = a.clone().setY(1.2);
  const to = b.clone().setY(1.2);
  const dir = to.clone().sub(from).normalize();
  from.addScaledVector(dir, 1.8);
  to.addScaledVector(dir, 2.0);
  const mid = from.clone().lerp(to, 0.5).setY(lift);
  return new THREE.QuadraticBezierCurve3(from, mid, to);
}

function makeArrow(curve, color, labelText, parent) {
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.07, 8), new THREE.MeshBasicMaterial({ color }));
  parent.add(tube);
  const tip = curve.getPoint(1);
  const tangent = curve.getTangent(1);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 12), new THREE.MeshBasicMaterial({ color }));
  cone.position.copy(tip);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  parent.add(cone);
  if (labelText) {
    const label = makeLabel(labelText, { color: '#fff', bg: '#' + color.toString(16).padStart(6, '0'), size: 0.75 });
    label.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.6, 0));
    parent.add(label);
  }
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    parent.add(dot);
    flows.push({ dot, curve, t: i / 3 });
  }
}

const REL_LABEL = { drivesTo: 'drives to', partnersWith: 'partners with' };

function buildRelationships() {
  if (relationshipGroup) scene.remove(relationshipGroup);
  flows.length = 0;
  relationshipGroup = new THREE.Group();
  for (const rel of model.relationships) {
    const a = LAYOUT[rel.from];
    const b = LAYOUT[rel.to];
    if (!a || !b) continue;
    makeArrow(curveBetween(a, b), COLORS[rel.type], REL_LABEL[rel.type], relationshipGroup);
  }
  relationshipGroup.visible = showRelationships;
  scene.add(relationshipGroup);
}

// Route from restaurant to customer (UberEats "route" attribute)
let routeGroup;
function buildRoute(order) {
  if (routeGroup) scene.remove(routeGroup);
  routeGroup = new THREE.Group();
  const curve = curveBetween(LAYOUT[order.restaurant], LAYOUT[order.customer], 1.5);
  const pts = curve.getPoints(60);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: COLORS.route, dashSize: 0.5, gapSize: 0.3 }));
  line.computeLineDistances();
  routeGroup.add(line);
  const label = makeLabel('route', { color: '#fff', bg: '#8e5cd9', size: 0.7 });
  label.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.6, 0));
  routeGroup.add(label);
  scene.add(routeGroup);
}

const selectionRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 48), new THREE.MeshBasicMaterial({ color: 0xffb400, side: THREE.DoubleSide, transparent: true }));
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);

let orderMarker;

function buildScene() {
  dynamic.forEach((o) => scene.remove(o));
  dynamic = [];
  pickables.length = 0;
  entityObjects.clear();
  for (const dp of model.deliveryPartners) addEntity(dp.id, makeRider(COLORS.DeliveryPartner), `${dp.id} · ${dp.name}`, COLORS.DeliveryPartner);
  for (const r of model.restaurants) addEntity(r.id, makeRestaurant(COLORS.Restaurant), `${r.id} · ${r.name}`, COLORS.Restaurant);
  addEntity('UE01', makeHub(COLORS.UberEats), 'UberEats', COLORS.UberEats);
  for (const c of model.customers) addEntity(c.id, makeHouse(COLORS.Customer), `${c.id} · Customer`, COLORS.Customer);

  orderMarker = makePackage();
  orderMarker.userData.id = 'O01';
  const ol = makeLabel('O01 · 35 min', { color: '#7a5a2a', size: 0.7 });
  ol.position.y = 1.2;
  orderMarker.add(ol);
  orderMarker.userData.label = ol;
  orderMarker.position.copy(LAYOUT.R01).add(new THREE.Vector3(1.8, 0.3, 1.8));
  scene.add(orderMarker);
  pickables.push(orderMarker);
  dynamic.push(orderMarker);

  buildRelationships();
  buildRoute(model.orders[0]);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const panel = root.querySelector('.fd-panel');
const statusEl = root.querySelector('.fd-status');
const toastHost = root.querySelector('.fd-toasts');
let selectedId = null;

function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = 'fd-toast ' + kind;
  t.textContent = msg;
  toastHost.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const row = (k, v) => `<div class="fd-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
const relLine = (label, id) => `<div class="fd-rel">${esc(label)} → <a data-go="${id}">${esc(id)} ${esc(byId(id)?.name || '')}</a></div>`;
const FIELD_NAMES = { address: 'Delivery address', instructions: 'Instructions', orderNumber: 'Order number', email: 'Email', phone: 'Phone', membership: 'Membership', password: 'Password', payment: 'Payment details', history: 'Account history' };

function confidentialityBlock(entityType) {
  const { visible, hidden } = customerViewFor(entityType, model.customers[0]);
  return `<h4>RULE · Customer confidentiality</h4>
    <div class="fd-note">What ${entityType === 'DeliveryPartner' ? 'this delivery partner' : 'this entity'} can see about customer C01:</div>
    ${Object.entries(visible).map(([k, v]) => `<div class="fd-ok">✓ ${FIELD_NAMES[k]}: ${esc(v)}</div>`).join('')}
    ${hidden.map((k) => `<div class="fd-locked">🔒 ${FIELD_NAMES[k]} — hidden</div>`).join('')}`;
}

function render() {
  const order = model.orders[0];
  const active = model.orders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled').length;
  statusEl.innerHTML = `<h4>DELIVERY NETWORK</h4>
    ${row('Restaurants', model.restaurants.length)}
    ${row('Delivery partners', model.deliveryPartners.length)}
    ${row('Active orders', active)}
    ${row('Order O01', order.status)}
    ${row('Paid', order.paid ? 'Yes' : 'No')}
    <div class="fd-eta"><span>Estimated delivery</span><b>${order.estimatedDeliveryTime} min</b></div>`;
  if (orderMarker) setLabelText(orderMarker.userData.label, `O01 · ${order.status} · ${order.estimatedDeliveryTime} min`, { color: '#7a5a2a', size: 0.7 });
  renderPanel();
}

function renderPanel() {
  if (!selectedId) {
    panel.innerHTML = `<h3>Food Delivery</h3><div class="fd-note">Click any object in the scene — a delivery partner, restaurant, UberEats hub, the customer house or the order package — to inspect its attributes, relationships, rules and actions.</div>`;
    return;
  }
  const e = byId(selectedId);
  const rels = model.relationships;
  let html = '';
  if (e.type === 'DeliveryPartner') {
    const to = rels.filter((r) => r.type === 'drivesTo' && r.from === e.id).map((r) => r.to);
    const current = model.orders.find((o) => o.deliveryPartner === e.id && o.status !== 'Delivered');
    html = `<div class="fd-type" style="background:#2f80ed">DELIVERY PARTNER</div><h3>${e.id} · ${esc(e.name)}</h3>
      ${row('Rating', e.rating + ' / 5')}${row('Commute type', e.commuteType)}${row('Vehicle', e.vehicle)}${row('Tips', '$' + e.tips.toFixed(2))}
      ${row('Current order', current ? current.id : '—')}
      <h4>RELATIONSHIPS</h4>${to.map((id) => relLine('drives to', id)).join('')}
      ${confidentialityBlock('DeliveryPartner')}
      <h4>ACTIONS</h4><button data-act="track">Track delivery</button>`;
  } else if (e.type === 'Restaurant') {
    const drivers = rels.filter((r) => r.type === 'drivesTo' && r.to === e.id).map((r) => r.from);
    const orders = model.orders.filter((o) => o.restaurant === e.id);
    html = `<div class="fd-type" style="background:#e8743b">RESTAURANT</div><h3>${e.id} · ${esc(e.name)}</h3>
      ${row('Cuisine type', e.cuisineType.join(', '))}${row('Store type', e.storeType)}${row('Orders', orders.length)}
      <h4>RELATIONSHIPS</h4>${relLine('partners with (from)', 'UE01')}${drivers.map((id) => relLine('driven to by', id)).join('')}
      ${confidentialityBlock('Restaurant')}
      <h4>ACTIONS</h4><button data-act="receiveOrder">Receive order</button>`;
  } else if (e.type === 'UberEats') {
    const partners = rels.filter((r) => r.type === 'partnersWith').map((r) => r.to);
    html = `<div class="fd-type" style="background:#06c167">UBEREATS</div><h3>${esc(e.name)}</h3>
      ${row('Service charge', '$' + e.serviceCharge)}${row('Route', e.route)}${row('Delivery time', model.orders[0].estimatedDeliveryTime + ' min')}${row('Membership', e.membership)}
      <h4>RELATIONSHIPS</h4>${partners.map((id) => relLine('partners with', id)).join('')}
      <h4>ACTIONS</h4><button data-act="pay">Receive payment</button><button data-act="track">Track delivery</button><button data-act="profile">Create profile</button>
      <h4>ASSISTANCE</h4><div class="fd-chat"></div>
      <div class="fd-chips">${['Where is my order?', 'Delivery time?', 'Payment status?', 'Who is my driver?', 'Card number?'].map((q) => `<button data-ask="${q}">${q}</button>`).join('')}</div>`;
  } else if (e.type === 'Customer') {
    html = `<div class="fd-type" style="background:#8e5cd9">CUSTOMER</div><h3>${e.id} · ${esc(e.name)}</h3>
      <h4>PROFILE (private account info)</h4>${Object.entries(e.profile).map(([k, v]) => row(FIELD_NAMES[k], v)).join('')}
      <h4>DELIVERY INFO (shared when needed)</h4>${Object.entries(e.delivery).map(([k, v]) => row(FIELD_NAMES[k], v)).join('')}
      <div class="fd-note">Only the delivery info is shared with delivery partners — see the confidentiality rule.</div>
      <h4>ACTIONS</h4><button data-act="profile">Edit profile</button>`;
  } else if (e.id.startsWith('O')) {
    const err = validateOrder(e);
    html = `<div class="fd-type" style="background:#c8a06a">ORDER</div><h3>${e.id}</h3>
      ${row('Status', e.status)}${row('Items', e.items.join(', '))}${row('Paid', e.paid ? 'Yes' : 'No')}
      <div class="fd-eta"><span>Estimated delivery</span><b>${e.estimatedDeliveryTime} min</b></div>
      <h4>RELATIONSHIPS</h4>${relLine('placed by', e.customer)}${relLine('ordered from', e.restaurant)}${relLine('assigned to', e.deliveryPartner)}${relLine('delivered through', 'UE01')}
      <h4>RULES</h4><div class="${err ? 'fd-locked' : 'fd-ok'}">${err ? '⚠ ' + esc(err) : '✓ Order is valid'}</div>
      <h4>ACTIONS</h4><button data-act="pay">Receive payment</button><button data-act="track">Track delivery</button>`;
  }
  panel.innerHTML = html;
}

function select(id) {
  selectedId = id;
  const obj = id === 'O01' ? orderMarker : entityObjects.get(id);
  selectionRing.visible = !!obj;
  if (obj) selectionRing.position.set(obj.position.x, 0.06, obj.position.z);
  renderPanel();
}

// Assistance — answers respect the confidentiality rule
function answer(q) {
  const o = model.orders[0];
  const s = q.toLowerCase();
  if (/card|password|payment detail|account/.test(s) && !/status/.test(s)) return 'Sorry, I can’t share payment or account details — they are protected under the customer confidentiality rule.';
  if (/where|status/.test(s) && !/payment/.test(s)) return `Order ${o.id} is ${o.status.toLowerCase()}. Estimated delivery time: ${o.estimatedDeliveryTime} minutes.`;
  if (/time|eta|long/.test(s)) return `Estimated delivery for ${o.id}: ${o.estimatedDeliveryTime} minutes.`;
  if (/payment|paid/.test(s)) return o.paid ? `Payment received for ${o.id}.` : `Payment for ${o.id} is still pending.`;
  if (/driver|partner|who/.test(s)) { const dp = byId(o.deliveryPartner); return `${dp.id} (${dp.name}, ${dp.rating}★, ${dp.commuteType}) is delivering your order.`; }
  if (/restaurant|food/.test(s)) { const r = byId(o.restaurant); return `${r.name} — ${r.cuisineType.join(' / ')} ${r.storeType.toLowerCase()}.`; }
  return 'I can help with order status, delivery time, payment status, restaurant info and your delivery partner.';
}

panel.addEventListener('click', (ev) => {
  const go = ev.target.closest('[data-go]');
  if (go) return select(go.dataset.go);
  const ask = ev.target.closest('[data-ask]');
  if (ask) {
    const chat = panel.querySelector('.fd-chat');
    chat.innerHTML += `<div class="fd-q">${esc(ask.dataset.ask)}</div><div class="fd-a">${esc(answer(ask.dataset.ask))}</div>`;
    chat.scrollTop = chat.scrollHeight;
    return;
  }
  const act = ev.target.closest('[data-act]');
  if (act) actions[act.dataset.act]();
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
let sim = null;
let newOrderCount = 1;

const actions = {
  pay() {
    const o = model.orders[0];
    if (o.paid) return toast(`Order ${o.id} is already paid.`, 'warn');
    o.paid = true;
    toast(`Payment received for Order ${o.id}. Card details stay private.`);
    render();
  },
  receiveOrder() {
    const r = byId(selectedId) || byId('R01');
    newOrderCount += 1;
    const id = 'O' + String(newOrderCount).padStart(2, '0');
    toast(`New Order ${id} received by ${r.name} · Status: Placed`);
    const pkg = makePackage();
    pkg.position.copy(LAYOUT[r.id]).add(new THREE.Vector3(-1.8 + Math.random() * 0.5, 0.3, 1.8));
    scene.add(pkg);
    dynamic.push(pkg);
  },
  profile() {
    const name = prompt('Create profile — your name:', model.customers[0].name);
    if (!name) return;
    const email = prompt('Email:', model.customers[0].profile.email) || model.customers[0].profile.email;
    model.customers[0].name = name;
    model.customers[0].profile.email = email;
    toast(`Profile created for ${name}. Account info stays private; only delivery info is shared.`);
    select('C01');
  },
  track() {
    const o = model.orders[0];
    if (sim) return toast('A delivery is already being tracked.', 'warn');
    if (!o.paid) toast('Rule: payment must be received first — receiving payment now.', 'warn'), actions.pay();
    const err = validateOrder(o);
    if (err) return toast(err, 'warn');
    if (o.status === 'Delivered') return toast('Order already delivered — press Reset to run again.', 'warn');
    sim = { t: 0, stage: -1 };
    selectionRing.visible = false;
  },
};

const STAGES = [
  { at: 0, status: 'Placed', msg: 'Order O01 placed by customer C01.' },
  { at: 1.5, status: 'Accepted', msg: 'Order O01 received by Indian Kitchen.' },
  { at: 3, status: 'Preparing', msg: 'DP01 is driving to Indian Kitchen.' },
  { at: 7, status: 'Picked Up', msg: 'Order O01 picked up. Estimated delivery: 18 minutes.' },
  { at: 8.5, status: 'Out for Delivery', msg: 'DP01 is travelling to the customer.' },
  { at: 14, status: 'Delivered', msg: 'Order O01 delivered!' },
];

function stepSim(dt) {
  if (!sim) return;
  sim.t += dt;
  const o = model.orders[0];
  const rider = entityObjects.get('DP01');
  while (sim.stage + 1 < STAGES.length && sim.t >= STAGES[sim.stage + 1].at) {
    sim.stage += 1;
    const s = STAGES[sim.stage];
    o.status = s.status;
    o.estimatedDeliveryTime = ETA_BY_STATUS[s.status];
    toast(s.msg, s.status === 'Delivered' ? 'ok' : 'info');
    render();
  }
  const toRestaurant = curveBetween(LAYOUT.DP01, LAYOUT.R01);
  const toCustomer = curveBetween(LAYOUT.R01, LAYOUT.C01, 1.5);
  if (sim.t >= 3 && sim.t < 7) {
    const p = toRestaurant.getPoint((sim.t - 3) / 4);
    rider.position.set(p.x, 0, p.z);
  } else if (sim.t >= 8.5 && sim.t < 14) {
    const k = (sim.t - 8.5) / 5.5;
    const p = toCustomer.getPoint(k);
    rider.position.set(p.x, 0, p.z);
    orderMarker.position.set(p.x, 2.6, p.z);
    const eta = Math.max(0, Math.round(12 * (1 - k)));
    if (eta !== o.estimatedDeliveryTime) { o.estimatedDeliveryTime = eta; render(); }
  }
  if (sim.t >= 7 && sim.t < 8.5) orderMarker.position.set(rider.position.x, 2.6, rider.position.z);
  if (sim.t >= 14) {
    orderMarker.position.copy(LAYOUT.C01).add(new THREE.Vector3(1.6, 0.3, 0));
    model.deliveryPartners[0].tips += 3;
    sim = null;
    render();
  }
}

// Toolbar
root.querySelector('.fd-toolbar').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const a = b.dataset.tool;
  if (a === 'rels') {
    showRelationships = !showRelationships;
    relationshipGroup.visible = showRelationships;
    if (routeGroup) routeGroup.visible = showRelationships;
    b.classList.toggle('on', showRelationships);
  } else if (a === 'reset') {
    sim = null;
    model = initialModel();
    newOrderCount = 1;
    selectedId = null;
    selectionRing.visible = false;
    buildScene();
    render();
    camera.position.set(-10, 15, 46);
    controls.target.set(2, 2, 0);
    toast('Model reset to the initial example.');
  } else if (a === 'assist') {
    select('UE01');
  } else {
    actions[a]();
  }
});

// Selection via raycasting
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, true).find((h) => !(h.object instanceof THREE.Sprite));
  if (!hit) return select(null);
  let o = hit.object;
  while (o && !o.userData.id) o = o.parent;
  if (o) select(o.userData.id);
});

// Resize
function resize() {
  const w = canvasHost.clientWidth;
  const h = canvasHost.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvasHost);

// Loop
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  for (const f of flows) {
    f.t = (f.t + dt * 0.25) % 1;
    f.dot.position.copy(f.curve.getPoint(f.t));
  }
  const hub = entityObjects.get('UE01');
  if (hub) hub.userData.spin.forEach((m, i) => (m.rotation[i ? 'z' : 'y'] = t * (i ? 0.6 : 0.8)));
  if (!sim && orderMarker) orderMarker.rotation.y = t * 0.8;
  selectionRing.material.opacity = 0.6 + 0.4 * Math.sin(t * 4);
  environment.update(dt, t);
  stepSim(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

buildScene();
render();
resize();
tick();
