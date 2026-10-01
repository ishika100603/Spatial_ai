// Food Delivery semantic model: entity vocabularies, relationships, rules.

export const CUISINES = {
  Asian:    { emoji: '🥢', color: '#e76f51', menu: ['Bao buns', 'Ramen', 'Gyoza', 'Bibimbap'] },
  Thai:     { emoji: '🍜', color: '#f4a261', menu: ['Pad Thai', 'Green curry', 'Tom yum', 'Mango sticky rice'] },
  Indian:   { emoji: '🍛', color: '#e9b949', menu: ['Butter chicken', 'Paneer tikka', 'Biryani', 'Garlic naan'] },
  Chinese:  { emoji: '🥡', color: '#d62828', menu: ['Kung pao chicken', 'Dumplings', 'Fried rice', 'Mapo tofu'] },
  Mexican:  { emoji: '🌮', color: '#2a9d8f', menu: ['Tacos al pastor', 'Burrito', 'Quesadilla', 'Churros'] },
  Italian:  { emoji: '🍝', color: '#7fb069', menu: ['Margherita pizza', 'Carbonara', 'Lasagna', 'Tiramisu'] },
  American: { emoji: '🍔', color: '#457b9d', menu: ['Cheeseburger', 'Fries', 'Wings', 'Milkshake'] },
};

export const STORE_TYPES = ['Food Truck', 'Fine Dining', 'Fast Food', 'Café', 'Ghost Kitchen'];

// Prep-time multiplier per store type (sim minutes).
export const PREP_TIME = { 'Food Truck': 6, 'Fine Dining': 12, 'Fast Food': 5, 'Café': 7, 'Ghost Kitchen': 8 };

export const COMMUTE_TYPES = {
  Car:  { speed: 11, icon: '🚗' },
  Bike: { speed: 7, icon: '🚲' },
};

export const MEMBERSHIPS = {
  'Standard': { icon: '⭐' },
  'Uber One': { icon: '💎' },
};

export const ORDER_STATUS = ['Awaiting payment', 'Preparing', 'On the way', 'Delivered'];

export const RELATIONSHIPS = [
  { from: 'Delivery Partner', name: 'Drives to', to: 'Restaurant', meaning: 'The partner drives to the restaurant to pick up an order' },
  { from: 'UberEats', name: 'Partner with', to: 'Restaurant', meaning: 'UberEats partners with the restaurant to deliver its food' },
];

// Deterministic menu price, so the same dish always costs the same.
export function priceOf(item) {
  let h = 0;
  for (const ch of item) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 7 + (h % 12) + ((h >> 4) % 4) * 0.25;
}

export const money = (v) => '$' + v.toFixed(2);

// ---------------------------------------------------------------------------
// Rule 1 — Confidentiality of the customer's details.
// Each role only sees the customer information it needs.
// Modes: full | first (first name) | count (item count) | relay (masked phone)
//        last4 (card last 4 digits) | token (payment token) | null (hidden)
// ---------------------------------------------------------------------------
export const ROLES = ['Customer', 'UberEats', 'Restaurant', 'Delivery Partner'];

export const CUSTOMER_FIELDS = [
  { key: 'orderNo',      label: 'Order number',      see: { Customer: 'full', UberEats: 'full', Restaurant: 'full', 'Delivery Partner': 'full' } },
  { key: 'name',         label: 'Customer name',     see: { Customer: 'full', UberEats: 'full', Restaurant: 'first', 'Delivery Partner': 'first' } },
  { key: 'address',      label: 'Delivery address',  see: { Customer: 'full', UberEats: 'full', Restaurant: null, 'Delivery Partner': 'full' } },
  { key: 'instructions', label: 'Instructions',      see: { Customer: 'full', UberEats: 'full', Restaurant: null, 'Delivery Partner': 'full' } },
  { key: 'items',        label: 'Items',             see: { Customer: 'full', UberEats: 'full', Restaurant: 'full', 'Delivery Partner': 'count' } },
  { key: 'phone',        label: 'Phone',             see: { Customer: 'full', UberEats: 'full', Restaurant: null, 'Delivery Partner': 'relay' } },
  { key: 'email',        label: 'Email',             see: { Customer: 'full', UberEats: 'full', Restaurant: null, 'Delivery Partner': null } },
  { key: 'payment',      label: 'Payment details',   see: { Customer: 'last4', UberEats: 'token', Restaurant: null, 'Delivery Partner': null } },
  { key: 'history',      label: 'Account history',   see: { Customer: 'full', UberEats: 'full', Restaurant: null, 'Delivery Partner': null } },
  { key: 'eta',          label: 'Delivery time',     see: { Customer: 'full', UberEats: 'full', Restaurant: 'full', 'Delivery Partner': 'full' } },
];

export function canSee(role, key) {
  const f = CUSTOMER_FIELDS.find((x) => x.key === key);
  return !!(f && f.see[role]);
}

// Produce the role-filtered view of a customer (and optionally one of their orders).
export function privateView(role, customer, order) {
  const rows = [];
  for (const f of CUSTOMER_FIELDS) {
    if (!order && (f.key === 'orderNo' || f.key === 'items' || f.key === 'eta' || f.key === 'instructions')) continue;
    const mode = f.see[role];
    let value = null;
    if (mode) value = fieldValue(f.key, mode, customer, order);
    rows.push({ key: f.key, label: f.label, hidden: !mode, mode, value });
  }
  return rows;
}

function fieldValue(key, mode, c, o) {
  switch (key) {
    case 'orderNo': return '#' + o.id;
    case 'name': return mode === 'first' ? c.name.split(' ')[0] : c.name;
    case 'address': return c.address;
    case 'instructions': return (o && o.instructions) || c.instructions || '—';
    case 'items':
      if (mode === 'count') return `${o.items.length} item${o.items.length === 1 ? '' : 's'} (sealed bag)`;
      return o.items.join(', ');
    case 'phone': return mode === 'relay' ? '+1 (555) 010-•••• (UberEats relay)' : c.phone;
    case 'email': return c.email;
    case 'payment': {
      const p = o ? o.payment : c.card;
      if (!p) return o ? 'Not paid yet' : 'No card on file';
      return mode === 'last4' ? `Card •••• ${p.last4}` : `Token ${p.token}`;
    }
    case 'history': return c.history.length ? `${c.history.length} past order${c.history.length === 1 ? '' : 's'}` : 'No past orders';
    case 'eta': return o.status === 'Delivered' ? 'Delivered' : `${Math.ceil(o.eta)} min`;
  }
  return '';
}
