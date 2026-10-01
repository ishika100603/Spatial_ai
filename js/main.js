// Neighborhood — Food Delivery semantic model: state, simulation, rules and UI.
import {
  World, route, pathLength, makeSlots, IDLE_SPOTS, HQ_DOOR, ROADS,
  restaurantLabel, customerLabel, partnerLabel, esc,
} from './world.js';
import {
  CUISINES, STORE_TYPES, PREP_TIME, COMMUTE_TYPES, MEMBERSHIPS, ROLES, CUSTOMER_FIELDS,
  priceOf, money, privateView, canSee,
} from './model.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const world = new World($('#scene'));
const slots = makeSlots();

const state = {
  hq: { serviceCharge: 3.99 },
  restaurants: [],
  partners: [],
  customers: [],
  orders: [],
  nextId: { restaurant: 1, partner: 1, customer: 1, order: 1001 },
  time: 0,
  paused: false,
  auto: false,
  autoTimer: 0,
  role: 'UberEats',
  selected: null, // { kind, id }
};

const byId = (list, id) => list.find((x) => x.id === id);
const R = (id) => byId(state.restaurants, id);
const C = (id) => byId(state.customers, id);
const P = (id) => byId(state.partners, id);
const O = (id) => byId(state.orders, id);
const activeOrders = () => state.orders.filter((o) => o.status !== 'Delivered');
const firstName = (n) => n.split(' ')[0];
const speedOf = (p) => COMMUTE_TYPES[p.commute].speed;
const serviceCharge = (c) => (c.membership === 'Uber One' ? 0 : state.hq.serviceCharge);

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
const STREETS = ['Maple Ave', 'Oak St', 'Pine St', 'Cedar Ave', 'Elm St', 'Birch Rd'];

function takeSlot(preferred) {
  const order = preferred === 1 ? [slots.ring1, slots.ring2] : [slots.ring2, slots.ring1];
  for (const ring of order) {
    const s = ring.find((x) => !x.used);
    if (s) { s.used = true; return s; }
  }
  return null;
}
const freeSlots = () => [...slots.ring1, ...slots.ring2].filter((s) => !s.used).length;

function addRestaurant({ name, cuisine, storeType }) {
  const slot = takeSlot(1);
  if (!slot) return null;
  const r = { id: state.nextId.restaurant++, name, cuisine, storeType, slot, door: slot.door, received: 0 };
  state.restaurants.push(r);
  world.setRestaurant(r);
  world.setPartnerWith(r);
  return r;
}

function addPartner({ name, commute, rating = 4.7, tips = 0 }) {
  const spot = IDLE_SPOTS[state.partners.length % IDLE_SPOTS.length];
  const p = {
    id: state.nextId.partner++, name, commute, rating, ratingCount: 20, tips, deliveries: 0,
    pos: spot.clone(), heading: 0, path: [], task: null,
  };
  state.partners.push(p);
  world.setPartner(p);
  world.syncPartner(p);
  return p;
}

function addCustomer({ name, email, phone, membership, instructions = 'Leave at the door' }) {
  const slot = takeSlot(2);
  if (!slot) return null;
  const c = {
    id: state.nextId.customer++, name, email, phone, membership, instructions, slot, door: slot.door,
    address: `${Math.round((slot.x + 64) * 10 + (slot.z + 60) / 3)} ${STREETS[ROADS.indexOf(slot.door.z)] || 'Main St'}`,
    history: [], card: null, joinedAt: state.time,
  };
  state.customers.push(c);
  world.setCustomer(c);
  return c;
}

// ---------------------------------------------------------------------------
// Orders, payments, dispatch
// ---------------------------------------------------------------------------
function createOrder({ customerId, restaurantId, items, instructions }) {
  const c = C(customerId), r = R(restaurantId);
  const subtotal = items.reduce((s, i) => s + priceOf(i), 0);
  const o = {
    id: state.nextId.order++, customerId, restaurantId, items, instructions: instructions || c.instructions,
    subtotal, serviceCharge: serviceCharge(c), status: 'Awaiting payment', partnerId: null,
    payment: null, prepRemaining: 0, ready: false, createdAt: state.time, eta: 0, etaInitial: 0, timeline: [],
  };
  o.total = o.subtotal + o.serviceCharge;
  state.orders.push(o);
  r.received++;
  o.eta = o.etaInitial = computeEta(o); // Rule 2: no order exists without an estimate
  mark(o, 'Order received by restaurant');
  world.packet(c.top, world.hqTop, `🧾 #${o.id}`, 0x3a86ff);
  setTimeout(() => {
    // Rule 1: the restaurant gets the order number, items and first name — no address or payment.
    world.packet(world.hqTop, r.top, `🧾 #${o.id} · ${items.length} item${items.length > 1 ? 's' : ''} · ${firstName(c.name)}`, 0x3a86ff);
  }, 900);
  log(`🧾 <b>${esc(r.name)}</b> received order <b>#${o.id}</b> from ${esc(firstName(c.name))} — ETA ${Math.ceil(o.eta)} min`);
  refresh();
  return o;
}

function payOrder(o, cardNumber) {
  const c = C(o.customerId), r = R(o.restaurantId);
  const digits = cardNumber.replace(/\D/g, '');
  // Rule 1: the full card number is never stored — only the last 4 digits and a processor token.
  o.payment = { last4: digits.slice(-4), token: 'tok_' + Math.random().toString(36).slice(2, 10), amount: o.total, at: state.time };
  c.card = { last4: o.payment.last4, token: o.payment.token };
  o.status = 'Preparing';
  o.prepRemaining = PREP_TIME[r.storeType] + o.items.length * 0.6;
  mark(o, `Payment of ${money(o.total)} processed`);
  world.packet(c.top, world.hqTop, '🔒 payment', 0xffbe0b);
  setTimeout(() => world.packet(world.hqTop, r.top, `✅ #${o.id} paid — start cooking`, UE), 1000);
  log(`💳 Payment <b>${money(o.total)}</b> for <b>#${o.id}</b> processed (card •••• ${o.payment.last4}; details kept private)`);
  dispatch();
  refresh();
}
const UE = 0x06c167;

function nearestIdle(target) {
  let best = null;
  for (const p of state.partners) {
    if (p.task) continue;
    const time = pathLength(p.pos, route(p.pos, target)) / speedOf(p);
    if (!best || time < best.time) best = { p, time };
  }
  return best;
}

function dispatch() {
  const waiting = state.orders.filter((o) => o.status === 'Preparing' && !o.partnerId).sort((a, b) => a.createdAt - b.createdAt);
  for (const o of waiting) {
    const r = R(o.restaurantId), c = C(o.customerId);
    const best = nearestIdle(r.door);
    if (!best) return;
    const p = best.p;
    o.partnerId = p.id;
    p.task = { orderId: o.id, phase: 'toRestaurant' };
    p.path = route(p.pos, r.door);
    mark(o, `${firstName(p.name)} assigned — driving to ${r.name}`);
    // Rule 1: the partner gets address, instructions and order number only.
    world.packet(world.hqTop, p.pos.clone().setY(3), `📍 ${c.address} · 📝 #${o.id}`, 0xff8c1a);
    log(`🛵 <b>${esc(p.name)}</b> drives to <b>${esc(r.name)}</b> for order #${o.id}`);
  }
}

function mark(o, text) {
  o.timeline.push({ t: state.time, text, eta: o.status === 'Delivered' ? 0 : Math.ceil(o.eta || computeEta(o)) });
}

// Rule 2 — estimated delivery time in minutes (1 simulated minute = 1 second).
function computeEta(o) {
  const r = R(o.restaurantId), c = C(o.customerId);
  const rc = pathLength(r.door, route(r.door, c.door));
  const p = o.partnerId ? P(o.partnerId) : null;
  if (o.status === 'Delivered') return 0;
  if (o.status === 'On the way') return pathLength(p.pos, p.path) / speedOf(p);
  if (o.status === 'Preparing' && p) {
    const toR = p.task.phase === 'toRestaurant' ? pathLength(p.pos, p.path) / speedOf(p) : 0;
    return Math.max(o.prepRemaining, toR) + rc / speedOf(p);
  }
  const best = nearestIdle(r.door);
  const toR = best ? best.time : 12; // queue penalty when the fleet is busy
  const sp = best ? speedOf(best.p) : 9;
  const prep = o.status === 'Preparing' ? o.prepRemaining : PREP_TIME[r.storeType] + o.items.length * 0.6 + 2;
  return Math.max(prep, toR) + rc / sp;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function move(p, dt) {
  let dist = speedOf(p) * dt;
  while (dist > 0 && p.path.length) {
    const target = p.path[0];
    const d = p.pos.distanceTo(target);
    if (d > 1e-4) p.heading = Math.atan2(target.x - p.pos.x, target.z - p.pos.z);
    if (d <= dist) { p.pos.copy(target); p.path.shift(); dist -= d; }
    else { p.pos.add(target.clone().sub(p.pos).multiplyScalar(dist / d)); dist = 0; }
  }
  return p.path.length === 0;
}

function updatePartner(p, dt) {
  const t = p.task;
  if (!t) { if (p.path.length) move(p, dt); return; }
  const o = O(t.orderId), r = R(o.restaurantId), c = C(o.customerId);
  if (t.phase === 'toRestaurant') {
    if (move(p, dt)) { t.phase = 'waiting'; mark(o, `${firstName(p.name)} arrived at ${r.name}`); }
    world.setDrives(p.id, p.pos, r.top);
  } else if (t.phase === 'waiting') {
    world.setDrives(p.id, p.pos, r.top);
    if (o.ready) {
      t.phase = 'toCustomer';
      o.status = 'On the way';
      p.path = route(p.pos, c.door);
      world.clearDrives(p.id);
      world.addRoute(o.id, p.pos, p.path);
      world.pulse(r.door, 0xff8c1a);
      mark(o, `Picked up by ${firstName(p.name)} — on the way`);
      log(`📦 <b>${esc(p.name)}</b> picked up #${o.id} — ETA ${Math.ceil(computeEta(o))} min`);
    }
  } else if (t.phase === 'toCustomer') {
    if (move(p, dt)) deliver(p, o, c, r);
  }
}

function deliver(p, o, c, r) {
  o.status = 'Delivered';
  o.eta = 0;
  o.deliveredAt = state.time;
  const tip = Math.round(rand(1.5, c.membership === 'Uber One' ? 8 : 6) * 4) / 4;
  p.tips += tip;
  p.deliveries++;
  const score = Math.min(5, rand(4.2, 5.2));
  p.rating = (p.rating * p.ratingCount + score) / (p.ratingCount + 1);
  p.ratingCount++;
  c.history.push({ id: o.id, restaurant: r.name, total: o.total, items: o.items.slice(), minutes: Math.round(o.deliveredAt - o.createdAt) });
  mark(o, `Delivered — ${firstName(p.name)} earned a ${money(tip)} tip`);
  world.removeRoute(o.id);
  world.pulse(c.door, UE);
  world.packet(c.top, p.pos.clone().setY(3), `💵 +${money(tip)} tip`, 0x2ec4b6);
  log(`✅ Order <b>#${o.id}</b> delivered to ${esc(firstName(c.name))} in ${Math.round(o.deliveredAt - o.createdAt)} min · tip ${money(tip)}`);
  p.task = null;
  // head back towards the HQ staging area
  const spot = IDLE_SPOTS.slice().sort((a, b) => a.distanceTo(p.pos) - b.distanceTo(p.pos))[state.partners.indexOf(p) % 3];
  p.path = route(p.pos, spot);
  dispatch();
  refresh();
}

function step(dt) {
  state.time += dt;
  for (const o of state.orders) {
    if (o.status === 'Preparing' && !o.ready) {
      o.prepRemaining = Math.max(0, o.prepRemaining - dt);
      if (o.prepRemaining === 0) {
        o.ready = true;
        const r = R(o.restaurantId);
        world.pulse(r.door, 0xffbe0b);
        mark(o, `Food ready at ${r.name}`);
      }
    }
  }
  for (const p of state.partners) updatePartner(p, dt);
  for (const o of activeOrders()) o.eta = computeEta(o); // Rule 2: estimates are continuously updated
  // Archive delivered orders after a short while (they stay in the customer's history)
  const before = state.orders.length;
  state.orders = state.orders.filter((o) => o.status !== 'Delivered' || state.time - o.deliveredAt < 8);
  if (state.orders.length !== before && state.selected?.kind === 'order' && !O(state.selected.id)) select(null);
  if (state.auto) autoDemo(dt);
}

function autoDemo(dt) {
  state.autoTimer -= dt;
  for (const o of state.orders) {
    if (o.status === 'Awaiting payment' && state.time - o.createdAt > 3) payOrder(o, '4242 4242 4242 ' + String(1000 + Math.floor(Math.random() * 9000)));
  }
  if (state.autoTimer > 0) return;
  state.autoTimer = rand(4, 8);
  if ((Math.random() < 0.2 || state.customers.length < 3) && freeSlots() > 0 && state.customers.length < 16) {
    const s = suggestProfile();
    const c = addCustomer(s);
    if (c) { world.pulse(c.door, 0x3a86ff); log(`👤 New account: <b>${esc(c.name)}</b> (${c.membership})`); }
    return;
  }
  if (activeOrders().length >= 7 || !state.customers.length || !state.restaurants.length) return;
  const r = pick(state.restaurants);
  const menu = CUISINES[r.cuisine].menu;
  const items = menu.filter(() => Math.random() < 0.4);
  createOrder({ customerId: pick(state.customers).id, restaurantId: r.id, items: items.length ? items : [pick(menu)] });
}

// ---------------------------------------------------------------------------
// UI: toolbar, modals, panels
// ---------------------------------------------------------------------------
function log(html) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  $('#log').prepend(el);
  setTimeout(() => el.classList.add('fade'), 6000);
  setTimeout(() => el.remove(), 7000);
  while ($('#log').children.length > 6) $('#log').lastChild.remove();
}

let modalSubmit = null;
function openModal({ title, body, ok = 'OK', onOpen, onSubmit }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalOk').textContent = ok;
  $('#modalError').textContent = '';
  $('#modal').hidden = false;
  modalSubmit = onSubmit;
  onOpen?.($('#modalForm'));
  setTimeout(() => $('#modalBody input, #modalBody select')?.focus(), 30);
}
function closeModal() { $('#modal').hidden = true; modalSubmit = null; }
$('#modalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!modalSubmit) return;
  const err = modalSubmit(new FormData($('#modalForm')), $('#modalForm'));
  if (err) $('#modalError').textContent = err;
  else closeModal();
});
$$('[data-close-modal]').forEach((b) => b.addEventListener('click', closeModal));
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const FIRST = ['Ava', 'Noah', 'Zoe', 'Liam', 'Emma', 'Mia', 'Ethan', 'Aria', 'Lucas', 'Isla', 'Omar', 'Sofia', 'Kai', 'Nina', 'Ravi', 'Hana'];
const LAST = ['Chen', 'Patel', 'Kim', 'Garcia', 'Rossi', 'Nguyen', 'Okafor', 'Silva', 'Müller', 'Haddad', 'Tanaka', 'Singh'];
function suggestProfile() {
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  return {
    name,
    email: name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com',
    phone: `+1 (555) ${100 + Math.floor(Math.random() * 900)}-${1000 + Math.floor(Math.random() * 9000)}`,
    membership: Math.random() < 0.35 ? 'Uber One' : 'Standard',
  };
}

const options = (list, sel) => list.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

const actions = {
  profile() {
    if (!freeSlots()) return log('⚠️ The neighborhood is full — no free lots for a new home.');
    const s = suggestProfile();
    openModal({
      title: '👤 Profile / account creation',
      ok: 'Create account',
      body: `
        <label>Name<input name="name" value="${esc(s.name)}" required></label>
        <label>Email<input name="email" type="email" value="${esc(s.email)}" required></label>
        <label>Phone<input name="phone" value="${esc(s.phone)}" required></label>
        <label>Membership</label>
        <div class="seg">${Object.keys(MEMBERSHIPS).map((m) => `<label><input type="radio" name="membership" value="${m}" ${m === s.membership ? 'checked' : ''}> ${MEMBERSHIPS[m].icon} ${m}</label>`).join('')}</div>
        <p class="note">🔒 Rule 1 — email, phone and account history are visible to the customer and UberEats only. Delivery partners reach the customer through a masked relay number.</p>`,
      onSubmit(f) {
        const name = f.get('name').trim(), email = f.get('email').trim(), phone = f.get('phone').trim();
        if (name.length < 2) return 'Please enter a name.';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Please enter a valid email.';
        if (phone.replace(/\D/g, '').length < 7) return 'Please enter a valid phone number.';
        if (state.customers.some((c) => c.email.toLowerCase() === email.toLowerCase())) return 'An account with this email already exists.';
        const c = addCustomer({ name, email, phone, membership: f.get('membership') });
        if (!c) return 'No free lots left.';
        world.pulse(c.door, 0x3a86ff);
        log(`👤 Account created for <b>${esc(c.name)}</b> · ${c.membership} · ${esc(c.address)}`);
        select('customer', c.id);
      },
    });
  },

  order() {
    if (!state.customers.length) return log('⚠️ Create a customer account first.');
    if (!state.restaurants.length) return log('⚠️ UberEats needs a partner restaurant first.');
    const sel = state.selected;
    const cSel = sel?.kind === 'customer' ? sel.id : pick(state.customers).id;
    const rSel = sel?.kind === 'restaurant' ? sel.id : pick(state.restaurants).id;
    const menuHTML = (r) => CUISINES[r.cuisine].menu.map((m, i) =>
      `<label class="item"><input type="checkbox" name="items" value="${esc(m)}" ${i === 0 ? 'checked' : ''}> ${esc(m)} <span>${money(priceOf(m))}</span></label>`).join('');
    openModal({
      title: '🧾 Receiving orders',
      ok: 'Place order',
      body: `
        <label>Customer<select name="customer">${state.customers.map((c) => `<option value="${c.id}" ${c.id === cSel ? 'selected' : ''}>${esc(c.name)} — ${c.membership}</option>`).join('')}</select></label>
        <label>Restaurant<select name="restaurant">${state.restaurants.map((r) => `<option value="${r.id}" ${r.id === rSel ? 'selected' : ''}>${CUISINES[r.cuisine].emoji} ${esc(r.name)} — ${r.cuisine}, ${r.storeType}</option>`).join('')}</select></label>
        <label>Items</label><div class="menu" id="menuBox">${menuHTML(R(rSel))}</div>
        <label>Delivery instructions<input name="instructions" placeholder="e.g. Ring the bell, 2nd floor"></label>
        <p class="note">⏱ Rule 2 — the order gets an estimated delivery time the moment it is created.</p>`,
      onOpen(form) {
        form.restaurant.addEventListener('change', () => { $('#menuBox').innerHTML = menuHTML(R(+form.restaurant.value)); });
      },
      onSubmit(f) {
        const items = f.getAll('items');
        if (!items.length) return 'Pick at least one item.';
        const o = createOrder({ customerId: +f.get('customer'), restaurantId: +f.get('restaurant'), items, instructions: f.get('instructions').trim() });
        select('order', o.id);
      },
    });
  },

  payment() {
    const unpaid = state.orders.filter((o) => o.status === 'Awaiting payment');
    if (!unpaid.length) return log('💳 No orders are awaiting payment. Use <b>Receive order</b> first.');
    const pre = state.selected?.kind === 'order' && unpaid.find((o) => o.id === state.selected.id) ? state.selected.id : unpaid[0].id;
    const summary = (o) => {
      const c = C(o.customerId);
      return `<table class="kv">
        <tr><td>Subtotal</td><td>${money(o.subtotal)}</td></tr>
        <tr><td>Service charge <small>(${c.membership})</small></td><td>${o.serviceCharge ? money(o.serviceCharge) : '<b class="ok">Free with Uber One</b>'}</td></tr>
        <tr class="total"><td>Total</td><td>${money(o.total)}</td></tr></table>`;
    };
    openModal({
      title: '💳 Receiving payment',
      ok: 'Process payment',
      body: `
        <label>Order<select name="order">${unpaid.map((o) => `<option value="${o.id}" ${o.id === pre ? 'selected' : ''}>#${o.id} — ${esc(C(o.customerId).name)} @ ${esc(R(o.restaurantId).name)}</option>`).join('')}</select></label>
        <div id="paySummary">${summary(O(pre))}</div>
        <label>Card number<input name="card" value="4242 4242 4242 4242" inputmode="numeric" autocomplete="off"></label>
        <div class="row"><label>Expiry<input name="exp" value="12/29"></label><label>CVC<input name="cvc" value="123" type="password"></label></div>
        <p class="note">🔒 Rule 1 — only the last 4 digits and a payment token are kept. Restaurants and delivery partners never see payment details.</p>`,
      onOpen(form) { form.order.addEventListener('change', () => { $('#paySummary').innerHTML = summary(O(+form.order.value)); }); },
      onSubmit(f) {
        const o = O(+f.get('order'));
        if (!o || o.status !== 'Awaiting payment') return 'This order is no longer awaiting payment.';
        if (f.get('card').replace(/\D/g, '').length < 12) return 'Card number looks incomplete.';
        if (!/^\d{2}\/\d{2}$/.test(f.get('exp').trim())) return 'Expiry must be MM/YY.';
        if (!/^\d{3,4}$/.test(f.get('cvc').trim())) return 'CVC must be 3–4 digits.';
        payOrder(o, f.get('card'));
        select('order', o.id);
      },
    });
  },

  chat() { toggleChat(); },

  restaurant() {
    if (!freeSlots()) return log('⚠️ No free lots for a new restaurant.');
    const names = ['Spice Route', 'Noodle Bar', 'Curry Leaf', 'Wok This Way', 'El Fuego', 'Trattoria Sole', 'Smash Shack', 'Sakura Box'];
    openModal({
      title: '🏪 UberEats — Partner with → Restaurant',
      ok: 'Partner with restaurant',
      body: `
        <label>Restaurant name<input name="name" value="${pick(names)}" required></label>
        <label>Cuisine type<select name="cuisine">${options(Object.keys(CUISINES), pick(Object.keys(CUISINES)))}</select></label>
        <label>Store type<select name="storeType">${options(STORE_TYPES, pick(STORE_TYPES))}</select></label>`,
      onSubmit(f) {
        const name = f.get('name').trim();
        if (!name) return 'Please enter a name.';
        const r = addRestaurant({ name, cuisine: f.get('cuisine'), storeType: f.get('storeType') });
        if (!r) return 'No free lots left.';
        world.packet(world.hqTop, r.top, '🤝 Partner with', UE);
        log(`🤝 UberEats now <b>partners with</b> ${esc(r.name)} (${r.cuisine}, ${r.storeType})`);
        select('restaurant', r.id);
      },
    });
  },

  partner() {
    openModal({
      title: '🛵 Add delivery partner',
      ok: 'Add partner',
      body: `
        <label>Name<input name="name" value="${pick(FIRST)} ${pick(LAST)[0]}." required></label>
        <label>Commute type</label>
        <div class="seg">${Object.keys(COMMUTE_TYPES).map((m, i) => `<label><input type="radio" name="commute" value="${m}" ${i === 0 ? 'checked' : ''}> ${COMMUTE_TYPES[m].icon} ${m}</label>`).join('')}</div>`,
      onSubmit(f) {
        const name = f.get('name').trim();
        if (!name) return 'Please enter a name.';
        const p = addPartner({ name, commute: f.get('commute'), rating: 5, tips: 0 });
        p.ratingCount = 1;
        world.pulse(p.pos, 0xff8c1a);
        log(`🛵 <b>${esc(p.name)}</b> joined the fleet (${p.commute})`);
        dispatch();
        select('partner', p.id);
      },
    });
  },

  relations(btn) { const on = btn.classList.toggle('on'); world.setRelVisible(on); },
  labels(btn) { const on = btn.classList.toggle('on'); world.setLabelsVisible(on); },
  auto(btn) { state.auto = btn.classList.toggle('on'); state.autoTimer = 0.5; log(state.auto ? '✨ Auto demo on — customers will sign up, order and pay.' : '✨ Auto demo off.'); },
  pause(btn) { state.paused = btn.classList.toggle('on'); btn.querySelector('span').textContent = state.paused ? 'Resume' : 'Pause'; },
  view() { world.resetView(); },
};

$$('#toolbar [data-action]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.action](b)));
$$('[data-collapse]').forEach((b) => b.addEventListener('click', () => {
  const panel = $('#' + b.dataset.collapse);
  panel.classList.toggle('collapsed');
}));
$$('.diagram [data-focus]').forEach((n) => n.addEventListener('click', () => {
  const kind = n.dataset.focus;
  if (kind === 'hq') return select('hq', 'hq');
  const list = kind === 'partner' ? state.partners : state.restaurants;
  if (!list.length) return;
  const cur = state.selected?.kind === kind ? list.findIndex((x) => x.id === state.selected.id) : -1;
  select(kind, list[(cur + 1) % list.length].id);
}));

// Click to select in the 3D view (ignore drags)
let down = null;
world.renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
world.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const hit = world.pick(e);
  select(hit?.kind ?? null, hit?.id);
});

function select(kind, id) {
  state.selected = kind ? { kind, id } : null;
  world.select(kind === 'order' ? 'customer' : kind, kind === 'order' ? O(id)?.customerId : id);
  inspectorHTML = '';
  if (kind) $('#right').classList.remove('collapsed');
  refresh();
}

function setRole(role) { state.role = role; inspectorHTML = ''; refresh(); }

// ---------- Left panel ----------
function renderLeft() {
  $('#counts').innerHTML = `
    <span>🛵 ${state.partners.length} partners</span><span>🏪 ${state.restaurants.length} restaurants</span>
    <span>🏠 ${state.customers.length} customers</span><span>🧾 ${activeOrders().length} active</span>`;
  const chips = ROLES.map((r) => `<button class="chip ${r === state.role ? 'on' : ''}" data-role="${r}">${r}</button>`).join('');
  if ($('#roleChips').innerHTML !== chips) $('#roleChips').innerHTML = chips;
  const sym = { full: '✓', first: '◐', count: '◐', relay: '◐', last4: '◐', token: '◐' };
  const matrix = `<table class="matrix"><tr><th>${state.role} sees…</th></tr>${CUSTOMER_FIELDS.map((f) => {
    const m = f.see[state.role];
    return `<tr class="${m ? (m === 'full' ? 'yes' : 'part') : 'no'}"><td>${m ? sym[m] : '✗'} ${f.label}${m && m !== 'full' ? ` <small>(${m === 'first' ? 'first name' : m === 'count' ? 'item count' : m === 'relay' ? 'masked relay' : m === 'last4' ? 'last 4 digits' : 'token only'})</small>` : ''}</td></tr>`;
  }).join('')}</table>`;
  if ($('#matrix').innerHTML !== matrix) $('#matrix').innerHTML = matrix;

  const act = activeOrders();
  const withEta = act.filter((o) => Number.isFinite(o.eta) && o.eta >= 0);
  const ok = withEta.length === act.length;
  $('#rule2status').innerHTML = `<div class="check ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${withEta.length}/${act.length} active orders have a live ETA</div>` +
    (act.length ? `<div class="eta-bars">${act.map((o) => `<div><span>#${o.id}</span><i style="width:${Math.min(100, (o.eta / 40) * 100)}%"></i><b>${Math.ceil(o.eta)}m</b></div>`).join('')}</div>` : '');
}
$('#roleChips').addEventListener('click', (e) => { const b = e.target.closest('[data-role]'); if (b) setRole(b.dataset.role); });

// ---------- Orders list ----------
const STATUS_ICON = { 'Awaiting payment': '💳', 'Preparing': '🍳', 'On the way': '🛵', 'Delivered': '✅' };
function partnerPhase(o) {
  const p = o.partnerId && P(o.partnerId);
  if (o.status === 'Awaiting payment') return 'Waiting for payment';
  if (o.status === 'Delivered') return 'Delivered';
  if (!p) return 'Looking for a delivery partner…';
  if (p.task.phase === 'toRestaurant') return `${firstName(p.name)} driving to restaurant`;
  if (p.task.phase === 'waiting') return `${firstName(p.name)} waiting for food`;
  return `${firstName(p.name)} heading to customer`;
}
function renderOrders() {
  const list = state.orders.slice().sort((a, b) => (a.status === 'Delivered') - (b.status === 'Delivered') || a.id - b.id);
  $('#orderCount').textContent = activeOrders().length;
  const html = list.length ? list.map((o) => {
    const c = C(o.customerId), r = R(o.restaurantId);
    const nameRow = privateView(state.role, c, o).find((x) => x.key === 'name');
    const progress = o.status === 'Delivered' ? 100 : Math.max(4, Math.min(98, (1 - o.eta / Math.max(o.etaInitial, o.eta + 0.01)) * 100));
    return `<div class="order s-${o.status.replace(/\s/g, '-').toLowerCase()} ${state.selected?.kind === 'order' && state.selected.id === o.id ? 'sel' : ''}" data-order="${o.id}">
      <div class="top"><b>#${o.id}</b><span class="status">${STATUS_ICON[o.status]} ${o.status}</span><span class="eta">${o.status === 'Delivered' ? '✓' : Math.ceil(o.eta) + '<small> min</small>'}</span></div>
      <div class="who">${CUISINES[r.cuisine].emoji} ${esc(r.name)} → ${esc(nameRow.value)}</div>
      <div class="bar"><i style="width:${progress}%"></i></div>
      <div class="phase">${esc(partnerPhase(o))}</div>
    </div>`;
  }).join('') : '<p class="muted">No orders yet. Click <b>🧾 Receive order</b>.</p>';
  if ($('#orders').innerHTML !== html) $('#orders').innerHTML = html;
}
$('#orders').addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-order]'); if (el) select('order', +el.dataset.order); });

// ---------- Inspector ----------
let inspectorHTML = '';
const stars = (v) => '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));
const roleSelect = () => `<label class="viewas">🔒 View as <select data-role-select>${options(ROLES, state.role)}</select></label>`;
const rows = (pairs) => `<table class="kv">${pairs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
const privRows = (list) => `<table class="kv priv">${list.map((r) => `<tr class="${r.hidden ? 'hidden' : ''}"><td>${r.label}</td><td>${r.hidden ? '🔒 <i>hidden (Rule 1)</i>' : esc(r.value)}</td></tr>`).join('')}</table>`;
const accessList = (role) => `<div class="access"><b>Rule 1 — customer data ${role === 'Restaurant' ? 'a restaurant' : 'a delivery partner'} receives</b>${CUSTOMER_FIELDS.map((f) => `<span class="${f.see[role] ? 'yes' : 'no'}">${f.see[role] ? '✓' : '✗'} ${f.label}</span>`).join('')}</div>`;

function inspector() {
  const s = state.selected;
  if (!s) return '<p class="muted">Select an entity or an order.</p>';
  if (s.kind === 'hq') {
    const act = activeOrders();
    const avg = act.length ? act.reduce((a, o) => a + o.eta, 0) / act.length : 0;
    const std = state.customers.filter((c) => c.membership === 'Standard').length;
    const routes = act.filter((o) => o.status === 'On the way').map((o) => `${esc(R(o.restaurantId).name)} → ${esc(C(o.customerId).address)}`);
    return `<div class="ent"><span class="tag t-ue">Entity</span><h3>UberEats</h3></div>
      ${rows([
        ['Service charge', `Standard <input type="number" step="0.01" min="0" data-edit="serviceCharge" value="${state.hq.serviceCharge.toFixed(2)}" class="num"> · Uber One <b class="ok">$0.00</b>`],
        ['Route', routes.length ? routes.join('<br>') : '<span class="muted">No order on the road</span>'],
        ['Delivery time', act.length ? `${Math.ceil(avg)} min avg · ${act.length} active` : '—'],
        ['Membership', `⭐ Standard ${std} · 💎 Uber One ${state.customers.length - std}`],
      ])}
      <h4>Relationships</h4>
      <div class="rels">${state.restaurants.map((r) => `<div class="rel"><span class="e-partner">Partner with ►</span> <a data-go="restaurant:${r.id}">${CUISINES[r.cuisine].emoji} ${esc(r.name)}</a></div>`).join('') || '<span class="muted">None</span>'}</div>
      <p class="note">🔒 UberEats holds the full customer record, but stores payment cards only as tokens.</p>`;
  }
  if (s.kind === 'restaurant') {
    const r = R(s.id);
    if (!r) return '';
    const drivers = state.partners.filter((p) => p.task && O(p.task.orderId)?.restaurantId === r.id && p.task.phase !== 'toCustomer');
    const act = activeOrders().filter((o) => o.restaurantId === r.id);
    return `<div class="ent"><span class="tag t-rest">Entity · Restaurant</span><h3>${CUISINES[r.cuisine].emoji} ${esc(r.name)}</h3></div>
      ${rows([
        ['Cuisine type', `<select data-edit="cuisine">${options(Object.keys(CUISINES), r.cuisine)}</select>`],
        ['Store type', `<select data-edit="storeType">${options(STORE_TYPES, r.storeType)}</select>`],
        ['Prep time', `~${PREP_TIME[r.storeType]} min`],
        ['Orders received', `${r.received} total · ${act.length} active`],
      ])}
      <h4>Relationships</h4>
      <div class="rels">
        <div class="rel"><a data-go="hq:hq">UberEats</a> <span class="e-partner">Partner with ►</span> this restaurant</div>
        ${drivers.map((p) => `<div class="rel"><a data-go="partner:${p.id}">${p.commute === 'Car' ? '🚗' : '🚲'} ${esc(p.name)}</a> <span class="e-drives">Drives to ►</span> this restaurant</div>`).join('') || '<div class="rel muted">No partner currently driving here</div>'}
      </div>
      ${act.length ? `<h4>Active orders</h4>${act.map((o) => `<a class="chip" data-go="order:${o.id}">#${o.id} · ${STATUS_ICON[o.status]} ${Math.ceil(o.eta)}m</a>`).join(' ')}` : ''}
      ${accessList('Restaurant')}`;
  }
  if (s.kind === 'partner') {
    const p = P(s.id);
    if (!p) return '';
    const o = p.task && O(p.task.orderId);
    const r = o && R(o.restaurantId);
    return `<div class="ent"><span class="tag t-partner">Entity · Delivery Partner</span><h3>${esc(p.name)}</h3></div>
      ${rows([
        ['Rating', `<span class="stars">${stars(p.rating)}</span> ${p.rating.toFixed(2)} / 5`],
        ['Commute type', `<select data-edit="commute">${options(Object.keys(COMMUTE_TYPES), p.commute)}</select>`],
        ['Tips', `<b>${money(p.tips)}</b>`],
        ['Deliveries', p.deliveries],
        ['Status', o ? `${esc(partnerPhase(o))} · <a data-go="order:${o.id}">#${o.id}</a> · ${Math.ceil(o.eta)} min` : 'Available'],
      ])}
      <h4>Relationships</h4>
      <div class="rels">${r && p.task.phase !== 'toCustomer'
        ? `<div class="rel">this partner <span class="e-drives">Drives to ►</span> <a data-go="restaurant:${r.id}">${CUISINES[r.cuisine].emoji} ${esc(r.name)}</a></div>`
        : '<div class="rel muted">Not driving to a restaurant right now</div>'}</div>
      ${o ? `<h4>Order info received (Rule 1)</h4>${privRows(privateView('Delivery Partner', C(o.customerId), o))}` : ''}
      ${accessList('Delivery Partner')}`;
  }
  if (s.kind === 'customer') {
    const c = C(s.id);
    if (!c) return '';
    const act = activeOrders().filter((o) => o.customerId === c.id);
    const hist = canSee(state.role, 'history') && c.history.length
      ? `<h4>Account history</h4><ul class="hist">${c.history.slice(-5).reverse().map((h) => `<li>#${h.id} · ${esc(h.restaurant)} · ${money(h.total)} · ${h.minutes} min</li>`).join('')}</ul>` : '';
    return `<div class="ent"><span class="tag t-cust">Customer</span><h3>${esc(privateView(state.role, c).find((x) => x.key === 'name').value)}</h3></div>
      ${roleSelect()}
      ${privRows(privateView(state.role, c))}
      ${rows([['Membership', canSee(state.role, 'email') ? `<select data-edit="membership">${options(Object.keys(MEMBERSHIPS), c.membership)}</select>` : esc(c.membership)],
        ['Service charge', serviceCharge(c) ? money(serviceCharge(c)) : '<b class="ok">Free (Uber One)</b>']])}
      ${act.length ? `<h4>Active orders</h4>${act.map((o) => `<a class="chip" data-go="order:${o.id}">#${o.id} · ${STATUS_ICON[o.status]} ${Math.ceil(o.eta)}m</a>`).join(' ')}` : ''}
      ${hist}`;
  }
  if (s.kind === 'order') {
    const o = O(s.id);
    if (!o) return '';
    const c = C(o.customerId), r = R(o.restaurantId), p = o.partnerId && P(o.partnerId);
    const seesMoney = state.role === 'Customer' || state.role === 'UberEats';
    return `<div class="ent"><span class="tag t-order">Order</span><h3>#${o.id} <small>${STATUS_ICON[o.status]} ${o.status}</small></h3></div>
      <div class="eta-big ${o.status === 'Delivered' ? 'done' : ''}">${o.status === 'Delivered' ? 'Delivered' : `⏱ ${Math.ceil(o.eta)} min`}<small>${o.status === 'Delivered' ? `in ${Math.round(o.deliveredAt - o.createdAt)} min` : `first estimate ${Math.ceil(o.etaInitial)} min · updated live (Rule 2)`}</small></div>
      ${rows([
        ['Restaurant', `<a data-go="restaurant:${r.id}">${CUISINES[r.cuisine].emoji} ${esc(r.name)}</a>`],
        ['Delivery partner', p ? `<a data-go="partner:${p.id}">${esc(firstName(p.name))}</a> · ${p.commute} · ★${p.rating.toFixed(1)}` : '<span class="muted">Not assigned</span>'],
        ['Route', `${esc(r.name)} → ${canSee(state.role, 'address') ? esc(c.address) : 'Customer 🔒'}`],
        ...(seesMoney ? [['Total', `${money(o.total)} <small class="muted">(incl. ${money(o.serviceCharge)} service)</small>`]] : []),
      ])}
      ${roleSelect()}
      ${privRows(privateView(state.role, c, o))}
      <h4>Timeline</h4>
      <ol class="timeline">${o.timeline.map((t) => `<li><span>${Math.round(t.t - o.createdAt)}m</span>${esc(t.text)}${t.eta ? ` <small>ETA ${t.eta}m</small>` : ''}</li>`).join('')}</ol>`;
  }
  return '';
}

function renderInspector() {
  const box = $('#inspector');
  if (box.contains(document.activeElement) && document.activeElement !== box) return; // don't disturb an open control
  const html = inspector();
  if (html !== inspectorHTML) { box.innerHTML = html; inspectorHTML = html; }
}

$('#inspector').addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-role-select]')) { setRole(el.value); el.blur(); return; }
  const key = el.dataset.edit;
  if (!key) return;
  const s = state.selected;
  if (s.kind === 'hq' && key === 'serviceCharge') {
    const v = Math.max(0, parseFloat(el.value) || 0);
    state.hq.serviceCharge = v;
    log(`💲 Standard service charge set to ${money(v)} (applies to new orders)`);
  } else if (s.kind === 'restaurant') {
    const r = R(s.id);
    r[key] = el.value;
    world.setRestaurant(r);
    world.setPartnerWith(r);
    world.pulse(r.door, UE);
    log(`🏪 ${esc(r.name)} → ${key === 'cuisine' ? 'Cuisine type' : 'Store type'}: <b>${esc(el.value)}</b>`);
  } else if (s.kind === 'partner') {
    const p = P(s.id);
    p.commute = el.value;
    world.setPartner(p);
    world.syncPartner(p);
    log(`🛵 ${esc(p.name)} now commutes by <b>${p.commute}</b>`);
  } else if (s.kind === 'customer') {
    const c = C(s.id);
    c.membership = el.value;
    world.setCustomer(c);
    log(`💎 ${esc(c.name)} membership: <b>${c.membership}</b>`);
  }
  el.blur();
  inspectorHTML = '';
  refresh();
});
$('#inspector').addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (!a) return;
  const [kind, id] = a.dataset.go.split(':');
  select(kind, kind === 'hq' ? 'hq' : +id);
});

// ---------- 3D labels ----------
function renderLabels() {
  for (const r of state.restaurants) {
    const n = activeOrders().filter((o) => o.restaurantId === r.id).length;
    world.setLabel('restaurant', r.id, restaurantLabel(r, n ? `<em class="badge-o">🧾 ${n}</em>` : ''));
  }
  for (const c of state.customers) {
    const o = activeOrders().filter((x) => x.customerId === c.id).sort((a, b) => a.eta - b.eta)[0];
    world.setLabel('customer', c.id, customerLabel(c, o ? `<em class="badge-eta">⏱ ${Math.ceil(o.eta)} min</em>` : ''));
  }
  for (const p of state.partners) {
    const o = p.task && O(p.task.orderId);
    world.setLabel('partner', p.id, partnerLabel(p, o ? `<em class="badge-eta">#${o.id} · ${Math.ceil(o.eta)}m</em>` : ''));
  }
  const unpaid = state.orders.filter((o) => o.status === 'Awaiting payment').length;
  $('#unpaidBadge').hidden = !unpaid;
  $('#unpaidBadge').textContent = unpaid;
}

function refresh() {
  renderLeft();
  renderOrders();
  renderInspector();
  renderLabels();
  renderChatAs();
}

// ---------------------------------------------------------------------------
// Chatbot / assistance
// ---------------------------------------------------------------------------
const chatChips = ['Where is my order?', 'When will it arrive?', 'Who is my driver?', 'What is my membership?', 'Payment details', 'Order history'];
$('#chatChips').innerHTML = chatChips.map((c) => `<button type="button" class="chip">${c}</button>`).join('');
let chatGreeted = false;

function toggleChat(force) {
  const el = $('#chat');
  el.hidden = force === undefined ? !el.hidden : !force;
  $('#toolbar [data-action="chat"]').classList.toggle('on', !el.hidden);
  if (!el.hidden) {
    renderChatAs();
    if (!chatGreeted) { chatGreeted = true; botSay(greeting()); }
    $('#chatInput').focus();
  }
}
$('[data-close-chat]').addEventListener('click', () => toggleChat(false));

function renderChatAs() {
  const sel = $('#chatAs');
  const html = state.customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (sel.dataset.html !== html) {
    const prev = sel.value;
    sel.innerHTML = html;
    sel.dataset.html = html;
    if (prev && C(+prev)) sel.value = prev;
  }
}
$('#chatAs').addEventListener('change', () => botSay(greeting()));
const chatCustomer = () => C(+$('#chatAs').value);
function greeting() {
  const c = chatCustomer();
  return c ? `Hi ${esc(firstName(c.name))}! 👋 I can help with order status, delivery time, your driver, membership and payments.` : 'Hi! Create an account first so I can help with your orders.';
}

function say(who, html) {
  const el = document.createElement('div');
  el.className = 'msg ' + who;
  el.innerHTML = html;
  $('#chatLog').append(el);
  $('#chatLog').scrollTop = 1e6;
}
function botSay(html) {
  const t = document.createElement('div');
  t.className = 'msg bot typing';
  t.textContent = '…';
  $('#chatLog').append(t);
  $('#chatLog').scrollTop = 1e6;
  setTimeout(() => { t.remove(); say('bot', html); }, 450);
}

function answer(text, c) {
  const q = text.toLowerCase();
  if (!c) return 'Please create an account first (👤 Create account).';
  const act = activeOrders().filter((o) => o.customerId === c.id).sort((a, b) => b.id - a.id);
  const o = act[0];
  const has = (...w) => w.some((x) => q.includes(x));
  if (has('hi', 'hello', 'hey', 'help') && q.length < 12) return greeting();
  if (has('upgrade', 'uber one') && has('upgrade', 'join', 'get', 'switch')) {
    if (c.membership === 'Uber One') return 'You are already an 💎 Uber One member — delivery service charges are on us.';
    c.membership = 'Uber One';
    world.setCustomer(c);
    inspectorHTML = '';
    refresh();
    return '🎉 Done! You are now an 💎 <b>Uber One</b> member — no service charge on new orders.';
  }
  if (has('history', 'past', 'previous')) {
    if (!c.history.length) return 'You have no past orders yet.';
    return 'Your recent orders:<br>' + c.history.slice(-4).reverse().map((h) => `• #${h.id} ${esc(h.restaurant)} — ${money(h.total)}, ${h.minutes} min`).join('<br>');
  }
  if (has('pay', 'card', 'charge', 'refund', 'bill')) {
    const card = c.card ? `card ending •••• <b>${c.card.last4}</b>` : 'no card on file yet';
    return `You have ${card}. 🔒 For your privacy, payment details are never shared with restaurants or delivery partners${o ? `. Order #${o.id} total: <b>${money(o.total)}</b> (${o.serviceCharge ? money(o.serviceCharge) + ' service charge' : 'no service charge with Uber One'})` : ''}.`;
  }
  if (has('member', 'fee', 'service', 'subscription')) {
    return c.membership === 'Uber One'
      ? 'You are an 💎 <b>Uber One</b> member: $0 service charge on every order.'
      : `You are on <b>Standard</b>: ${money(state.hq.serviceCharge)} service charge per order. Say “upgrade to Uber One” to remove it.`;
  }
  if (!o) return 'You have no active orders right now. Want to place one? Use 🧾 <b>Receive order</b>.';
  const r = R(o.restaurantId), p = o.partnerId && P(o.partnerId);
  if (has('driver', 'partner', 'who', 'courier', 'rider')) {
    if (!p) return `No delivery partner is assigned to #${o.id} yet${o.status === 'Awaiting payment' ? ' — the order is waiting for payment' : ' — we are finding one now'}.`;
    return `${esc(firstName(p.name))} (${p.commute === 'Car' ? '🚗 car' : '🚲 bike'}, ★${p.rating.toFixed(1)}) is delivering #${o.id}. You can reach them through the in‑app relay — personal numbers stay private on both sides 🔒.`;
  }
  if (has('time', 'when', 'long', 'eta', 'arrive', 'late', 'minutes')) {
    return `Order #${o.id} from ${esc(r.name)} should arrive in about <b>${Math.ceil(o.eta)} min</b> (first estimate was ${Math.ceil(o.etaInitial)} min). I update this as your order moves forward.`;
  }
  if (has('where', 'status', 'track', 'order')) {
    return `Order #${o.id} from ${esc(r.name)}: <b>${STATUS_ICON[o.status]} ${o.status}</b> — ${esc(partnerPhase(o))}. ETA <b>${Math.ceil(o.eta)} min</b>.`;
  }
  if (has('cancel')) return 'I can’t cancel orders in this demo, but I’ve noted your request for our support team.';
  return 'I can help with: order status, delivery time, your driver, membership, payments and order history. Try one of the buttons below!';
}

function ask(text) {
  if (!text.trim()) return;
  say('me', esc(text));
  const c = chatCustomer();
  botSay(answer(text, c));
}
$('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); ask($('#chatInput').value); $('#chatInput').value = ''; });
$('#chatChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });

// ---------------------------------------------------------------------------
// Demonstrative example
// ---------------------------------------------------------------------------
function seed() {
  const rs = [
    { name: 'Lotus Bowl', cuisine: 'Asian', storeType: 'Fast Food' },
    { name: 'Bangkok Street', cuisine: 'Thai', storeType: 'Food Truck' },
    { name: 'Saffron House', cuisine: 'Indian', storeType: 'Fine Dining' },
    { name: 'Golden Dragon', cuisine: 'Chinese', storeType: 'Ghost Kitchen' },
    { name: 'Casa Taco', cuisine: 'Mexican', storeType: 'Food Truck' },
    { name: 'Bella Notte', cuisine: 'Italian', storeType: 'Café' },
  ].map(addRestaurant);
  [
    { name: 'Maya R.', commute: 'Car', rating: 4.8, tips: 12.5 },
    { name: 'Leo T.', commute: 'Bike', rating: 4.6, tips: 8.25 },
    { name: 'Priya S.', commute: 'Car', rating: 4.9, tips: 21 },
    { name: 'Sam K.', commute: 'Bike', rating: 4.7, tips: 5.75 },
  ].forEach(addPartner);
  const cs = [
    { name: 'Ava Chen', email: 'ava.chen@example.com', phone: '+1 (555) 201-4410', membership: 'Uber One', instructions: 'Ring the bell twice' },
    { name: 'Noah Patel', email: 'noah.patel@example.com', phone: '+1 (555) 388-1022', membership: 'Standard' },
    { name: 'Zoe Kim', email: 'zoe.kim@example.com', phone: '+1 (555) 742-9130', membership: 'Uber One', instructions: 'Leave with the concierge' },
    { name: 'Liam Garcia', email: 'liam.garcia@example.com', phone: '+1 (555) 519-6677', membership: 'Standard' },
    { name: 'Emma Rossi', email: 'emma.rossi@example.com', phone: '+1 (555) 630-2284', membership: 'Standard' },
  ].map((c) => addCustomer(c));
  cs[3].history.push({ id: 998, restaurant: 'Casa Taco', total: 24.49, items: ['Burrito'], minutes: 22 });
  cs[0].history.push({ id: 999, restaurant: 'Lotus Bowl', total: 31.75, items: ['Ramen', 'Gyoza'], minutes: 27 });

  const o1 = createOrder({ customerId: cs[0].id, restaurantId: rs[1].id, items: ['Pad Thai', 'Mango sticky rice'] });
  payOrder(o1, '4242 4242 4242 4242');
  const o2 = createOrder({ customerId: cs[2].id, restaurantId: rs[5].id, items: ['Margherita pizza'] });
  payOrder(o2, '5555 5555 5555 4444');
  createOrder({ customerId: cs[1].id, restaurantId: rs[2].id, items: ['Butter chicken', 'Garlic naan'], instructions: 'Gate code 4021' });
  select('order', o1.id);
}

seed();
log('👋 Welcome! Use the toolbar to create accounts, receive orders and payments, or chat with the assistant.');

let uiTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = world.render();
  if (!state.paused) step(dt);
  for (const p of state.partners) world.syncPartner(p);
  uiTimer -= dt;
  if (uiTimer <= 0) { uiTimer = 0.25; refresh(); }
}
loop();
if (innerWidth < 760) $('#right').classList.add('collapsed');
