// LN Wardrobe – catalogue server (no dependencies, just Node.js 18+)
// NO orders / cart / payments here. Only: products + stock (managed by admin) + settings.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
const DATA = path.join(ROOT, 'data');
const PRODUCTS_FILE = path.join(DATA, 'products.json');
const CONFIG_FILE = path.join(DATA, 'config.json');

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const TAGS = ['New', 'Best Seller', 'Few Left', 'Sale'];
const DEFAULT_TEMPLATE = 'Hi LN Wardrobe! I would like to order:\n\n👕 *{product}*\n🎨 Colour: {colour}\n📏 Size: {size}\n🔢 Quantity: {qty}\n💰 Price: {price} each\n\nLink: {link}';

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

// ---------- storage helpers ----------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, rec) {
  const h = crypto.scryptSync(pw, rec.salt, 64);
  const exp = Buffer.from(rec.hash, 'hex');
  return h.length === exp.length && crypto.timingSafeEqual(h, exp);
}

let config = readJSON(CONFIG_FILE, null);
if (!config) {
  config = {
    username: 'admin',
    password: hashPassword('admin123'),
    whatsapp: '919999999999', // country code + number, digits only
    announcement: 'New collection just dropped – order on WhatsApp!',
  };
  writeJSON(CONFIG_FILE, config);
  console.log('\n  First run: admin login is  admin / admin123  – change it in Admin > Settings!\n');
}

const allSizes = (v) => Object.fromEntries(SIZES.map((s) => [s, v]));
let products = readJSON(PRODUCTS_FILE, null);
if (!products) {
  products = [
    {
      id: 'p1', name: 'Classic Oversized Tee', price: 599, category: 'Oversized',
      description: '240 GSM heavy cotton, drop shoulder, relaxed fit.', images: [], hidden: false,
      colors: [
        { name: 'Lavender', hex: '#B9A5E0', sizes: { ...allSizes(false), S: true, M: true, L: true, XL: true } },
        { name: 'White', hex: '#F4F4F6', sizes: { ...allSizes(false), M: true, L: true } },
        { name: 'Black', hex: '#1F1F24', sizes: allSizes(false) },
      ],
    },
    {
      id: 'p2', name: 'Everyday Round Neck', price: 399, category: 'Basics',
      description: 'Soft 180 GSM combed cotton. Perfect daily wear.', images: [], hidden: false,
      colors: [
        { name: 'Navy', hex: '#26324F', sizes: { ...allSizes(false), S: true, M: true, L: true, XL: true, XXL: true } },
        { name: 'Grey', hex: '#A9A9B3', sizes: { ...allSizes(false), M: true, L: true } },
      ],
    },
  ];
  writeJSON(PRODUCTS_FILE, products);
}
const save = () => writeJSON(PRODUCTS_FILE, products);

// ---------- sessions ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 1000 * 60 * 60 * 12;
const attempts = new Map(); // ip -> {n, until}

function getCookie(req, name) {
  const c = (req.headers.cookie || '').split(';').map((s) => s.trim());
  for (const p of c) if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1));
  return null;
}
function isAdmin(req) {
  const t = getCookie(req, 'lnw_sess');
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

// ---------- utils ----------
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('bad json')); } });
  });
}
const str = (v, max) => String(v ?? '').trim().slice(0, max);

function cleanProduct(b, id) {
  const name = str(b.name, 80);
  if (!name) throw new Error('Name is required');
  const colors = (Array.isArray(b.colors) ? b.colors : []).slice(0, 20).map((c) => ({
    name: str(c.name, 30) || 'Colour',
    hex: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#cccccc',
    sizes: Object.fromEntries(SIZES.map((s) => [s, !!(c.sizes && c.sizes[s])])),
    images: (Array.isArray(c.images) ? c.images : []).filter((u) => /^\/uploads\/[\w.-]+$/.test(u)).slice(0, 5),
  }));
  const images = (Array.isArray(b.images) ? b.images : []).filter((u) => /^\/uploads\/[\w.-]+$/.test(u)).slice(0, 6);
  const price = Math.max(0, Number(b.price) || 0);
  let salePrice = Math.max(0, Number(b.salePrice) || 0);
  if (salePrice >= price) salePrice = 0; // sale must be cheaper than normal price
  return {
    id, name,
    price, salePrice,
    tag: TAGS.includes(b.tag) ? b.tag : '',
    featured: !!b.featured,
    category: str(b.category, 30) || 'T-Shirts',
    description: str(b.description, 500),
    images, colors, hidden: !!b.hidden,
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveFile(res, base, rel) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function publicSettings() {
  return {
    whatsapp: config.whatsapp, announcement: config.announcement,
    instagram: config.instagram || '',
    orderTemplate: config.orderTemplate || DEFAULT_TEMPLATE,
  };
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const m = req.method;

  // public API
  if (p === '/api/products' && m === 'GET') return send(res, 200, products.filter((x) => !x.hidden), { 'Cache-Control': 'no-store' });
  if (p === '/api/settings' && m === 'GET') return send(res, 200, publicSettings(), { 'Cache-Control': 'no-store' });

  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress;
    const a = attempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const b = await readBody(req);
    if (b.username === config.username && checkPassword(String(b.password || ''), config.password)) {
      attempts.delete(ip);
      const t = crypto.randomBytes(32).toString('hex');
      sessions.set(t, Date.now() + SESSION_MS);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `lnw_sess=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
    }
    a.n++; if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
    attempts.set(ip, a);
    return send(res, 401, { error: 'Wrong username or password' });
  }
  if (p === '/api/logout' && m === 'POST') {
    const t = getCookie(req, 'lnw_sess'); if (t) sessions.delete(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'lnw_sess=; HttpOnly; Path=/; Max-Age=0' });
  }

  // admin API
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Not logged in' });
    try {
      if (p === '/api/admin/me') return send(res, 200, { ok: true, username: config.username });
      if (p === '/api/admin/products' && m === 'GET') return send(res, 200, products);
      if (p === '/api/admin/products' && m === 'POST') {
        const prod = cleanProduct(await readBody(req), 'p' + Date.now().toString(36));
        products.unshift(prod); save(); return send(res, 200, prod);
      }
      const pm = p.match(/^\/api\/admin\/products\/([\w-]+)$/);
      if (pm) {
        const i = products.findIndex((x) => x.id === pm[1]);
        if (i < 0) return send(res, 404, { error: 'Not found' });
        if (m === 'PUT') { products[i] = cleanProduct(await readBody(req), pm[1]); save(); return send(res, 200, products[i]); }
        if (m === 'DELETE') { products.splice(i, 1); save(); return send(res, 200, { ok: true }); }
      }
      if (p === '/api/admin/upload' && m === 'POST') {
        const b = await readBody(req);
        const mt = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.dataUrl || '');
        if (!mt) return send(res, 400, { error: 'Invalid image' });
        const buf = Buffer.from(mt[2], 'base64');
        if (buf.length > 4 * 1024 * 1024) return send(res, 400, { error: 'Image too large' });
        const name = crypto.randomBytes(8).toString('hex') + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]);
        fs.writeFileSync(path.join(UPLOADS, name), buf);
        return send(res, 200, { url: '/uploads/' + name });
      }
      if (p === '/api/admin/backup' && m === 'GET') {
        const out = JSON.stringify({ exportedAt: new Date().toISOString(), settings: publicSettings(), products }, null, 2);
        return send(res, 200, out, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="ln-wardrobe-backup.json"' });
      }
      if (p === '/api/admin/settings' && m === 'GET') return send(res, 200, { ...publicSettings(), username: config.username, defaultTemplate: DEFAULT_TEMPLATE });
      if (p === '/api/admin/settings' && m === 'PUT') {
        const b = await readBody(req);
        const wa = String(b.whatsapp || '').replace(/\D/g, '');
        if (wa.length < 8) return send(res, 400, { error: 'Enter WhatsApp number with country code, digits only (e.g. 919876543210)' });
        config.whatsapp = wa; config.announcement = str(b.announcement, 140);
        config.instagram = str(b.instagram, 60).replace(/^@/, '').replace(/[^\w.]/g, '');
        config.orderTemplate = str(b.orderTemplate, 800) || DEFAULT_TEMPLATE;
        writeJSON(CONFIG_FILE, config); return send(res, 200, { ok: true });
      }
      if (p === '/api/admin/password' && m === 'POST') {
        const b = await readBody(req);
        if (!checkPassword(String(b.current || ''), config.password)) return send(res, 400, { error: 'Current password is wrong' });
        if (String(b.newPassword || '').length < 6) return send(res, 400, { error: 'New password must be at least 6 characters' });
        const u = str(b.username, 30) || config.username;
        config.username = u; config.password = hashPassword(String(b.newPassword));
        writeJSON(CONFIG_FILE, config); return send(res, 200, { ok: true });
      }
    } catch (e) { return send(res, 400, { error: e.message }); }
    return send(res, 404, { error: 'Not found' });
  }

  // static
  if (p.startsWith('/uploads/')) return serveFile(res, UPLOADS, p.slice(9));
  if (p === '/admin' || p === '/admin/') return serveFile(res, PUBLIC, 'admin.html');
  return serveFile(res, PUBLIC, p === '/' ? 'index.html' : p.slice(1));
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => { try { send(res, 400, { error: e.message }); } catch {} });
}).listen(PORT, () => {
  console.log(`LN Wardrobe running:\n  Shop   -> http://localhost:${PORT}\n  Admin  -> http://localhost:${PORT}/admin`);
});
