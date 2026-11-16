const app = document.getElementById('app');
let products = [], editing = null;

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Please log in'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 2200); }
const fail = (e) => toast('⚠ ' + e.message);

// ---------- login ----------
function showLogin() {
  app.innerHTML = `<form class="login panel" id="lf">
    <img src="/logo.png" alt=""><h2 style="margin-top:1rem">Admin Login</h2>
    <div class="field"><label>Username</label><input type="text" name="u" autocomplete="username" required></div>
    <div class="field"><label>Password</label><input type="password" name="p" autocomplete="current-password" required></div>
    <div id="err"></div><button class="btn btn-primary" style="width:100%">Login</button></form>`;
  document.getElementById('lf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/login', 'POST', { username: e.target.u.value, password: e.target.p.value }); init(); }
    catch (er) { document.getElementById('err').innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
  };
}

// ---------- dashboard ----------
async function init() {
  try { await api('/api/admin/me'); } catch { return showLogin(); }
  products = await api('/api/admin/products');
  showList();
}

function header() {
  return `<div class="a-wrap"><div class="row" style="justify-content:space-between;margin-bottom:1rem">
    <div class="row"><img src="/logo.png" width="52" style="border-radius:50%"><b style="font-family:var(--serif);font-size:1.4rem;letter-spacing:.2em;color:var(--lav-dd)">ADMIN</b></div>
    <div class="row"><a class="btn btn-ghost btn-sm" href="/" target="_blank">View shop</a>
    <button class="btn btn-ghost btn-sm" id="set">Settings</button>
    <button class="btn btn-danger btn-sm" id="out">Logout</button></div></div>`;
}
function bindHeader() {
  document.getElementById('out').onclick = async () => { await api('/api/logout', 'POST'); showLogin(); };
  document.getElementById('set').onclick = showSettings;
}

function showList() {
  app.innerHTML = header() + `<div class="panel"><div class="row" style="justify-content:space-between"><h2>T-Shirts (${products.length})</h2>
    <button class="btn btn-primary btn-sm" id="add">+ Add t-shirt</button></div>
    <div class="stats">
      <div class="stat"><b>${products.length}</b><span>Total</span></div>
      <div class="stat"><b>${products.filter((p) => !p.hidden && productInStock(p)).length}</b><span>In stock</span></div>
      <div class="stat"><b style="color:var(--bad)">${products.filter((p) => !productInStock(p)).length}</b><span>Out of stock</span></div>
      <div class="stat"><b>${products.filter((p) => p.hidden).length}</b><span>Hidden</span></div>
    </div>
    <p style="color:var(--muted);font-size:.85rem;margin-top:0">Tip: tap a colour below to quickly mark it in stock / out of stock (all sizes).</p>
    <div class="alist">${products.map((p) => {
      const c = p.colors.find((x) => inStock(x) && (x.images || []).length) || p.colors.find(inStock) || p.colors[0];
      const img = c && (c.images || [])[0] || p.images[0];
      return `<div class="arow"><div class="th">${img ? `<img src="${esc(img)}">` : teeSVG(c ? c.hex : '#ccc')}</div>
      <div class="meta"><b>${esc(p.name)}</b> <span class="tag">${esc(p.category)}</span>${p.hidden ? '<span class="tag">Hidden</span>' : ''}${productInStock(p) ? '' : '<span class="tag" style="background:#fbe9ed;color:var(--bad)">Out of stock</span>'}
      ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
      <div>${priceHTML(p)}</div>
      <div>${p.colors.map((x, ci) => `<button class="cchip ${inStock(x) ? '' : 'out'}" data-tog="${p.id}:${ci}" title="${inStock(x) ? 'Click: mark OUT of stock' : 'Click: mark IN stock (all sizes)'}"><span class="dot" style="background:${esc(x.hex)}"></span>${esc(x.name)}</button>`).join('')}</div></div>
      <button class="star ${p.featured ? 'on' : ''}" data-feat="${p.id}" title="Featured (shown first in shop)">★</button>
      <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-dup="${p.id}">Duplicate</button>
      <button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button></div>`;
    }).join('') || '<p>No products yet. Click “Add t-shirt”.</p>'}</div></div></div>`;
  bindHeader();
  document.getElementById('add').onclick = () => showForm(null);
  app.onclick = async (e) => {
    const ed = e.target.closest('[data-edit]'); if (ed) return showForm(products.find((p) => p.id === ed.dataset.edit));
    const replace = (saved) => { products = products.map((x) => (x.id === saved.id ? saved : x)); showList(); };
    const tg = e.target.closest('[data-tog]');
    if (tg) {
      const [id, ci] = tg.dataset.tog.split(':'); const p = JSON.parse(JSON.stringify(products.find((x) => x.id === id)));
      const c = p.colors[+ci], on = !inStock(c); SIZES.forEach((s) => (c.sizes[s] = on));
      try { replace(await api('/api/admin/products/' + id, 'PUT', p)); toast(`${c.name}: ${on ? 'in stock' : 'out of stock'}`); } catch (er) { fail(er); }
      return;
    }
    const ft = e.target.closest('[data-feat]');
    if (ft) {
      const p = JSON.parse(JSON.stringify(products.find((x) => x.id === ft.dataset.feat))); p.featured = !p.featured;
      try { replace(await api('/api/admin/products/' + p.id, 'PUT', p)); } catch (er) { fail(er); }
      return;
    }
    const dp = e.target.closest('[data-dup]');
    if (dp) {
      const p = JSON.parse(JSON.stringify(products.find((x) => x.id === dp.dataset.dup))); delete p.id; p.name += ' (copy)'; p.featured = false;
      try { products.unshift(await api('/api/admin/products', 'POST', p)); toast('Duplicated – edit the copy'); showList(); } catch (er) { fail(er); }
      return;
    }
    const dl = e.target.closest('[data-del]');
    if (dl) {
      if (dl.dataset.sure !== '1') { dl.dataset.sure = '1'; dl.textContent = 'Click again to delete'; setTimeout(() => { dl.dataset.sure = ''; dl.textContent = 'Delete'; }, 3000); return; }
      try { await api('/api/admin/products/' + dl.dataset.del, 'DELETE'); products = products.filter((p) => p.id !== dl.dataset.del); toast('Deleted'); showList(); } catch (er) { fail(er); }
    }
  };
}

// ---------- product form ----------
function showForm(p) {
  editing = p ? JSON.parse(JSON.stringify(p)) : { name: '', price: '', category: 'T-Shirts', description: '', salePrice: '', tag: '', featured: false, images: [], colors: [{ name: 'White', hex: '#FFFFFF', images: [], sizes: Object.fromEntries(SIZES.map((s) => [s, true])) }], hidden: false };
  editing.colors.forEach((c) => { c.images = c.images || []; });
  // move old shared photos into the first colour so they can be managed per colour
  if (editing.images.length && editing.colors.length && !editing.colors.some((c) => c.images.length)) {
    editing.colors[0].images = editing.images.slice();
  }
  editing.images = [];
  app.onclick = null;
  drawForm();
}

function drawForm() {
  const e = editing;
  const cats = [...new Set(products.map((p) => p.category))];
  app.innerHTML = header() + `<div class="panel"><h2>${e.id ? 'Edit' : 'Add'} t-shirt</h2>
  <div class="row"><div class="field"><label>Name</label><input type="text" id="f-name" value="${esc(e.name)}"></div>
  <div class="field" style="max-width:160px"><label>Price (₹)</label><input type="number" id="f-price" min="0" value="${esc(e.price)}"></div>
  <div class="field"><label>Category</label><input type="text" id="f-cat" list="cats" value="${esc(e.category)}"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
  <div class="row"><div class="field" style="max-width:200px"><label>Sale price (₹) – optional</label><input type="number" id="f-sale" min="0" value="${esc(e.salePrice || '')}" placeholder="e.g. 499"></div>
  <div class="field" style="max-width:200px"><label>Tag on t-shirt</label><select id="f-tag"><option value="">None</option>${TAGS.map((t) => `<option ${e.tag === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <div class="field"><label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-size:.95rem;margin-top:1.4rem"><input type="checkbox" id="f-feat" style="width:auto" ${e.featured ? 'checked' : ''}> ★ Featured (show first)</label></div></div>
  <div class="field"><label>Description</label><textarea id="f-desc">${esc(e.description)}</textarea></div>
  <h2 style="margin-top:1rem">Colours, photos &amp; sizes <small style="font-size:.8rem;color:var(--muted);font-family:var(--sans)">(each colour has its own t-shirt photos; the shop switches photo when the customer picks the colour)</small></h2>
  <div id="cols">${e.colors.map((c, i) => `<div class="crow" data-ci="${i}">
    <div class="row"><button type="button" class="swbtn" data-pick="${i}" style="background:${esc(c.hex)}" title="Choose colour"></button>
    <input type="text" data-k="name" value="${esc(c.name)}" placeholder="Colour name" style="flex:1;min-width:120px">
    <button class="btn btn-ghost btn-sm" data-all="1">All sizes</button><button class="btn btn-ghost btn-sm" data-all="0">Out of stock</button>
    <button class="btn btn-danger btn-sm" data-rc="${i}">Remove</button></div>
    <div class="imgs" style="margin-top:.7rem">${(c.images || []).map((u, j) => `<div class="im"><img src="${esc(u)}"><button data-rm="${i}:${j}" title="Remove photo">×</button></div>`).join('')}
      <label class="addimg" title="Upload t-shirt photo for this colour">+<small>Photo</small><input type="file" accept="image/*" multiple data-up="${i}" hidden></label></div>
    <div class="tg">${SIZES.map((s) => `<label><input type="checkbox" data-sz="${s}" ${c.sizes[s] ? 'checked' : ''}>${s}</label>`).join('')}</div></div>`).join('')}</div>
  <button class="btn btn-ghost btn-sm" id="addc">+ Add colour</button>
  <div class="field" style="margin-top:1.2rem"><label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-size:.95rem"><input type="checkbox" id="f-hide" ${e.hidden ? 'checked' : ''}> Hide this t-shirt from the shop</label></div>
  <div class="row" style="margin-top:1rem"><button class="btn btn-primary" id="save">Save</button><button class="btn btn-ghost" id="cancel">Cancel</button></div></div></div>`;
  bindHeader();
  sync();
  const $ = (s) => document.getElementById(s);

  document.querySelectorAll('[data-up]').forEach((inp) => {
    inp.onchange = async (ev) => {
      sync();
      const c = editing.colors[+inp.dataset.up];
      toast('Uploading…');
      for (const f of ev.target.files) {
        try { c.images.push((await api('/api/admin/upload', 'POST', { dataUrl: await shrink(f) })).url); } catch (er) { fail(er); }
      }
      drawForm();
    };
  });
  $('addc').onclick = () => { sync(); editing.colors.push({ name: '', hex: '#B7A3E0', images: [], sizes: Object.fromEntries(SIZES.map((s) => [s, true])) }); drawForm(); };
  $('cancel').onclick = showList;
  $('save').onclick = async () => {
    sync();
    try {
      const saved = e.id ? await api('/api/admin/products/' + e.id, 'PUT', editing) : await api('/api/admin/products', 'POST', editing);
      products = e.id ? products.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...products];
      toast('Saved ✓'); showList();
    } catch (er) { fail(er); }
  };
  app.onclick = (ev) => {
    const t = ev.target;
    const rm = t.closest('[data-rm]'); if (rm) { sync(); const [ci, j] = rm.dataset.rm.split(':').map(Number); editing.colors[ci].images.splice(j, 1); return drawForm(); }
    const pk = t.closest('[data-pick]'); if (pk) { sync(); return openPalette(+pk.dataset.pick); }
    const rc = t.closest('[data-rc]'); if (rc) { sync(); editing.colors.splice(+rc.dataset.rc, 1); return drawForm(); }
    const all = t.closest('[data-all]'); if (all) { sync(); const c = editing.colors[+all.closest('.crow').dataset.ci]; SIZES.forEach((s) => (c.sizes[s] = all.dataset.all === '1')); drawForm(); }
  };
}

// ---------- colour grid popup ----------
const PALETTE = [
  ['White', '#FFFFFF'], ['Off White', '#F3EFE6'], ['Cream', '#FFF3C4'], ['Light Grey', '#D3D3D8'], ['Grey', '#9A9AA3'], ['Charcoal', '#4A4A52'], ['Black', '#1A1A1D'],
  ['Red', '#D32F3F'], ['Maroon', '#7B1E2E'], ['Pink', '#F4A6C0'], ['Hot Pink', '#E6397F'], ['Peach', '#FFC9A8'], ['Orange', '#F28A2E'], ['Mustard', '#E0A92B'],
  ['Yellow', '#F7DC4A'], ['Lime', '#B7D63F'], ['Green', '#2E8B57'], ['Olive', '#6B7A3A'], ['Bottle Green', '#1F4D3A'], ['Mint', '#A8E0C8'], ['Teal', '#1F8A8A'], ['Sky Blue', '#8FC7EE'],
  ['Royal Blue', '#2F59C7'], ['Navy', '#1E2A52'], ['Lavender', '#B7A3E0'], ['Lilac', '#D8C9F2'], ['Purple', '#6C3FA8'], ['Brown', '#6F4A33'], ['Beige', '#D9C3A0'], ['Coffee', '#4B3326'],
];
function openPalette(ci) {
  const c = editing.colors[ci];
  const m = document.createElement('div');
  m.className = 'modal open';
  m.innerHTML = `<div class="sheet" style="display:block;max-width:460px;padding:1.4rem"><h2 style="margin-top:0;font-family:var(--serif);color:var(--lav-dd)">Choose colour</h2>
    <div class="cgrid">${PALETTE.map(([n, h], i) => `<button type="button" class="cc ${h.toLowerCase() === c.hex.toLowerCase() ? 'on' : ''}" data-i="${i}" style="background:${h}" title="${n}"><span>${n}</span></button>`).join('')}</div>
    <div class="row" style="margin-top:1rem"><label style="font-size:.85rem;color:var(--muted)">Other colour:</label>
    <input type="color" id="cust" value="${esc(c.hex)}" style="width:46px;height:38px;border:0;padding:0;background:none">
    <button type="button" class="btn btn-ghost btn-sm" id="cclose" style="margin-left:auto">Close</button></div></div>`;
  document.body.append(m);
  const wasPreset = PALETTE.some(([n]) => n === c.name);
  const apply = (hex, name) => { if (!c.name.trim() || wasPreset || PALETTE.some(([n]) => n === c.name)) c.name = name; c.hex = hex; m.remove(); drawForm(); };
  m.onclick = (e) => {
    if (e.target === m || e.target.id === 'cclose') return m.remove();
    const b = e.target.closest('.cc'); if (b) { const [n, h] = PALETTE[+b.dataset.i]; apply(h, n); }
  };
  m.querySelector('#cust').onchange = (e) => apply(e.target.value, c.name.trim() || 'Custom');
}

// copy form fields into `editing`
function sync() {
  const g = (id) => document.getElementById(id);
  if (!g('f-name')) return;
  Object.assign(editing, { name: g('f-name').value, price: g('f-price').value, category: g('f-cat').value, description: g('f-desc').value, hidden: g('f-hide').checked, salePrice: g('f-sale').value, tag: g('f-tag').value, featured: g('f-feat').checked });
  document.querySelectorAll('.crow').forEach((row) => {
    const c = editing.colors[+row.dataset.ci];
    c.name = row.querySelector('[data-k=name]').value;
    row.querySelectorAll('[data-sz]').forEach((cb) => (c.sizes[cb.dataset.sz] = cb.checked));
  });
}

// resize photos in the browser so uploads stay small and fast
function shrink(file, max = 1000) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------- settings ----------
async function showSettings() {
  const s = await api('/api/admin/settings');
  app.onclick = null;
  app.innerHTML = header() + `<div class="panel"><h2>Shop settings</h2>
    <div class="field"><label>Friend's WhatsApp number (country code + number, digits only)</label><input type="text" id="s-wa" value="${esc(s.whatsapp)}" placeholder="919876543210"></div>
    <div class="field"><label>Top banner text (leave empty to hide)</label><input type="text" id="s-an" value="${esc(s.announcement)}"></div>
    <div class="field"><label>Instagram username (optional – customers who tap it go to your Instagram page)</label><input type="text" id="s-ig" value="${esc(s.instagram)}" placeholder="lnwardrobe"></div>
    <div class="field"><label>WhatsApp order message (customer's choices fill the {…} parts)</label>
      <textarea id="s-tp" style="min-height:190px">${esc(s.orderTemplate)}</textarea>
      <small style="color:var(--muted)">Use: {product} {colour} {size} {qty} {price} {link} &nbsp;·&nbsp; <a href="#" id="s-reset">Reset to default</a></small></div>
    <button class="btn btn-primary btn-sm" id="s-save">Save settings</button></div>
    <div class="panel"><h2>Backup</h2><p style="margin-top:0;color:var(--muted)">Download all t-shirts and settings as a file. Do this once in a while.</p>
    <a class="btn btn-ghost btn-sm" href="/api/admin/backup" download>⬇ Download backup</a></div>
    <div class="panel"><h2>Change login</h2>
    <div class="row"><div class="field"><label>Username</label><input type="text" id="p-u" value="${esc(s.username)}"></div>
    <div class="field"><label>Current password</label><input type="password" id="p-c"></div>
    <div class="field"><label>New password (min 6)</label><input type="password" id="p-n"></div></div>
    <button class="btn btn-primary btn-sm" id="p-save">Update login</button></div>
    <button class="btn btn-ghost btn-sm" id="back">← Back</button></div>`;
  bindHeader();
  const $ = (i) => document.getElementById(i);
  $('back').onclick = showList;
  $('s-reset').onclick = (ev) => { ev.preventDefault(); $('s-tp').value = s.defaultTemplate; };
  $('s-save').onclick = () => api('/api/admin/settings', 'PUT', { whatsapp: $('s-wa').value, announcement: $('s-an').value, instagram: $('s-ig').value,orderTemplate: $('s-tp').value }).then(() => toast('Settings saved ✓')).catch(fail);
  $('p-save').onclick = () => api('/api/admin/password', 'POST', { username: $('p-u').value, current: $('p-c').value, newPassword: $('p-n').value }).then(() => { toast('Login updated ✓'); $('p-c').value = $('p-n').value = ''; }).catch(fail);
}

init();
