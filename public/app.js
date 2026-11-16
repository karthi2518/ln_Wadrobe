let products = [], settings = {};
let cat = 'All', q = '', sort = 'featured', stockOnly = false, wishOnly = false;
const $ = (s) => document.querySelector(s);

// ---------- saved items (kept only in this customer's own browser) ----------
let wish = [];
try { wish = JSON.parse(localStorage.getItem('lnw_wish') || '[]'); } catch {}
const saveWish = () => { try { localStorage.setItem('lnw_wish', JSON.stringify(wish)); } catch {} };

async function load() {
  [products, settings] = await Promise.all([fetch('/api/products').then((r) => r.json()), fetch('/api/settings').then((r) => r.json())]);
  products.forEach((p, i) => (p._i = i));
  if (settings.announcement) { $('#announce').textContent = settings.announcement; $('#announce').hidden = false; }
  $('#fab').href = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent('Hi LN Wardrobe! I need some help.')}`;
  const links = [];
  if (settings.instagram) links.push(`<a href="https://instagram.com/${esc(settings.instagram)}" target="_blank" rel="noopener">Instagram @${esc(settings.instagram)}</a>`);
  links.push(`<a href="https://wa.me/${esc(settings.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`);
  $('#flinks').innerHTML = links.join(' · ');
  renderCats(); renderGrid(); openFromHash();
}

const colorImgs = (p, c) => {
  if (c && c.images && c.images.length) return c.images;
  return p.colors.some((x) => x.images && x.images.length) ? [] : p.images || [];
};
function thumb(p) {
  const c = p.colors.find((x) => inStock(x) && colorImgs(p, x).length) || p.colors.find(inStock) || p.colors[0];
  const img = colorImgs(p, c)[0];
  if (img) return `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">`;
  return teeSVG((c || { hex: '#B7A3E0' }).hex);
}

// ---------- filters ----------
function renderCats() {
  const cats = ['All', ...new Set(products.map((p) => p.category))];
  $('#cats').innerHTML = cats.map((c) => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
}
$('#cats').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; renderCats(); renderGrid(); } };
$('#q').oninput = (e) => { q = e.target.value; renderGrid(); };
$('#sort').onchange = (e) => { sort = e.target.value; renderGrid(); };
$('#stockOnly').onchange = (e) => { stockOnly = e.target.checked; renderGrid(); };
$('#wishBtn').onclick = () => { wishOnly = !wishOnly; renderGrid(); };

function renderGrid() {
  wish = wish.filter((id) => products.some((p) => p.id === id));
  $('#wishBtn').classList.toggle('on', wishOnly);
  $('#wishBtn').firstChild.textContent = wishOnly ? '♥ Saved ' : '♡ Saved ';
  $('#wishN').textContent = wish.length ? `(${wish.length})` : '';

  let list = products.filter((p) => (cat === 'All' || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase())
    && (!stockOnly || productInStock(p)) && (!wishOnly || wish.includes(p.id)));
  const by = {
    featured: (a, b) => (b.featured - a.featured) || (a._i - b._i),
    new: (a, b) => a._i - b._i,
    low: (a, b) => effPrice(a) - effPrice(b),
    high: (a, b) => effPrice(b) - effPrice(a),
  }[sort];
  list = list.slice().sort(by);

  $('#empty').hidden = list.length > 0;
  $('#empty').textContent = wishOnly ? 'No saved t-shirts yet. Tap the ♡ on a t-shirt to save it.' : 'No t-shirts found.';
  $('#grid').innerHTML = list.map((p) => {
    const sold = !productInStock(p);
    const tag = sold ? '' : p.tag || (onSale(p) ? 'Sale' : '');
    return `<article class="card ${sold ? 'sold' : ''}" data-id="${p.id}" tabindex="0">
      ${sold ? '<span class="badge bad">Out of stock</span>' : tag ? `<span class="badge">${esc(tag)}</span>` : ''}
      <button class="heart ${wish.includes(p.id) ? 'on' : ''}" data-heart="${p.id}" aria-label="Save">${wish.includes(p.id) ? '♥' : '♡'}</button>
      <div class="pic">${thumb(p)}</div>
      <div class="body"><h3>${esc(p.name)}</h3><div>${priceHTML(p)}</div>
      <div class="dots">${p.colors.map((c) => `<span class="dot ${inStock(c) ? '' : 'out'}" title="${esc(c.name)}" style="background:${esc(c.hex)}"></span>`).join('')}</div></div></article>`;
  }).join('');
}
$('#grid').onclick = (e) => {
  const h = e.target.closest('[data-heart]');
  if (h) { const id = h.dataset.heart; wish = wish.includes(id) ? wish.filter((x) => x !== id) : [...wish, id]; saveWish(); return renderGrid(); }
  const c = e.target.closest('.card'); if (c) openProduct(c.dataset.id);
};
$('#grid').onkeydown = (e) => { if (e.key === 'Enter') { const c = e.target.closest('.card'); if (c) openProduct(c.dataset.id); } };

// ---------- product sheet ----------
let cur = null, selColor = 0, selSize = null, qty = 1, imgIdx = 0;

function openProduct(id) {
  cur = products.find((p) => p.id === id); if (!cur) return;
  selColor = Math.max(0, cur.colors.findIndex(inStock)); selSize = null; qty = 1; imgIdx = 0;
  history.replaceState(null, '', '#p=' + id);
  renderSheet(); $('#modal').classList.add('open'); document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modal').classList.remove('open'); document.body.style.overflow = ''; history.replaceState(null, '', location.pathname); }
function openFromHash() { const m = location.hash.match(/^#p=([\w-]+)/); if (m) openProduct(m[1]); }

function waLink() {
  const c = cur.colors[selColor];
  const vals = { product: cur.name, colour: c.name, size: selSize, qty, price: money(effPrice(cur)), link: `${location.origin}/#p=${cur.id}` };
  const text = (settings.orderTemplate || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
  return `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`;
}

function renderSheet() {
  const p = cur, c = p.colors[selColor];
  const imgs = colorImgs(p, c);
  if (imgIdx >= imgs.length) imgIdx = 0;
  const main = imgs.length ? `<img class="zoomable" src="${esc(imgs[imgIdx])}" alt="${esc(p.name)} ${esc(c ? c.name : '')}" title="Click to zoom">` : teeSVG(c ? c.hex : '#B7A3E0');
  const thumbs = imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<img src="${esc(u)}" class="${i === imgIdx ? 'on' : ''}" data-i="${i}" alt="">`).join('')}</div>` : '';
  let status = '';
  if (!p.colors.length || !productInStock(p)) status = '<div class="status bad">Currently out of stock</div>';
  else if (c && !inStock(c)) status = `<div class="status bad">${esc(c.name)} is out of stock</div>`;
  else if (c) {
    const left = Object.values(c.sizes).filter(Boolean).length;
    if (left <= 2) status = '<div class="status bad">Hurry – only a few sizes left!</div>';
  }
  const ready = c && inStock(c) && selSize;
  const unavailable = !productInStock(p);
  const tag = p.tag || (onSale(p) ? 'Sale' : '');

  $('#sheet').innerHTML = `<button class="x" data-act="close" aria-label="Close">×</button>
  <div class="gal"><div class="main">${main}</div>${thumbs}</div>
  <div class="info">
    ${tag && !unavailable ? `<span class="badge inline">${esc(tag)}</span>` : ''}
    <h2>${esc(p.name)}</h2><div style="font-size:1.3rem">${priceHTML(p)}</div>
    <p style="color:var(--muted);margin:.6rem 0 0">${esc(p.description)}</p>
    ${p.colors.length ? `<div class="lbl">Colour${c ? ' · ' + esc(c.name) : ''}</div>
    <div class="swatches">${p.colors.map((x, i) => `<button class="sw ${i === selColor ? 'on' : ''} ${inStock(x) ? '' : 'out'}" data-col="${i}" style="background:${esc(x.hex)}" title="${esc(x.name)}${inStock(x) ? '' : ' (out of stock)'}" aria-label="${esc(x.name)}"></button>`).join('')}</div>
    <div class="lbl row-between">Size <button class="link" data-act="guide">📏 Size guide</button></div>
    <div class="sizes">${SIZES.filter((s) => p.colors.some((x) => x.sizes[s] !== undefined)).map((s) => `<button class="size ${selSize === s ? 'on' : ''}" data-size="${s}" ${c && c.sizes[s] ? '' : 'disabled'}>${s}</button>`).join('')}</div>` : ''}
    ${status}
    <div class="lbl">Quantity</div>
    <div class="qty"><button data-q="-1" aria-label="Less">−</button><span>${qty}</span><button data-q="1" aria-label="More">+</button></div>
    <a class="wa" ${ready ? `href="${esc(waLink())}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>
      <svg width="22" height="22" viewBox="0 0 32 32" fill="#fff"><path d="M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.600L3 29l7.100-2.100A12.800 12.800 0 0 0 16 28c7 0 12.700-5.600 12.700-12.500S23 3 16 3zm0 23c-2 0-3.900-.6-5.500-1.600l-.4-.2-4.200 1.200 1.300-4-.3-.4A10.400 10.400 0 0 1 5.500 15.500C5.500 9.900 10.200 5.300 16 5.300s10.500 4.600 10.500 10.200S21.800 26 16 26zm5.800-7.800c-.3-.2-1.900-.9-2.200-1s-.5-.2-.7.200-.8 1-1 1.200-.4.200-.7.100a8.500 8.500 0 0 1-4.200-3.700c-.3-.6.300-.5.900-1.600.1-.2 0-.4 0-.5l-1-2.300c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.100-.9.400s-1.200 1.200-1.200 2.800 1.200 3.300 1.400 3.500 2.400 3.700 5.900 5.100c2.200.9 3.100 1 4.200.8.700-.1 1.900-.8 2.200-1.600s.3-1.400.2-1.600-.3-.3-.6-.4z"/></svg>
      Order on WhatsApp</a>
    <div class="hint">${unavailable ? 'This t-shirt is out of stock right now.' : ready ? 'Opens WhatsApp with your choice filled in.' : 'Choose an available colour and size to order.'}</div>
    <div class="row-center"><button class="link" data-act="share">🔗 Share this t-shirt</button>
      <button class="link" data-heart="${p.id}">${wish.includes(p.id) ? '♥ Saved' : '♡ Save'}</button></div>
  </div>`;
}

async function share() {
  const url = `${location.origin}/#p=${cur.id}`;
  const text = `Check out ${cur.name} at LN Wardrobe – ${money(effPrice(cur))}`;
  if (navigator.share) { try { await navigator.share({ title: cur.name, text, url }); return; } catch { return; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank', 'noopener');
}

function openGuide() {
  const rows = [['XS', 36, 26], ['S', 38, 27], ['M', 40, 28], ['L', 42, 29], ['XL', 44, 30], ['XXL', 46, 31], ['3XL', 48, 32]];
  $('#guideBox').innerHTML = `<button class="x" data-act="gclose" aria-label="Close">×</button>
  <div style="padding:1.6rem"><h2>Size guide</h2>
  <p style="color:var(--muted);margin-top:0">T-shirt measurements in inches (approx.). If you are between sizes, choose the bigger one.</p>
  <table class="gt"><tr><th>Size</th><th>Chest</th><th>Length</th></tr>
  ${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}"</td><td>${r[2]}"</td></tr>`).join('')}</table>
  <p style="color:var(--muted);font-size:.85rem">Not sure? Message us on WhatsApp and we will help you pick.</p></div>`;
  $('#guide').classList.add('open');
}

$('#sheet').onclick = (e) => {
  const t = e.target;
  if (t.closest('[data-act=close]')) return closeModal();
  if (t.closest('[data-act=guide]')) return openGuide();
  if (t.closest('[data-act=share]')) return share();
  const h = t.closest('[data-heart]'); if (h) { const id = h.dataset.heart; wish = wish.includes(id) ? wish.filter((x) => x !== id) : [...wish, id]; saveWish(); renderGrid(); return renderSheet(); }
  const z = t.closest('.zoomable'); if (z) { z.classList.toggle('zoomed'); z.style.transformOrigin = '50% 50%'; return; }
  const col = t.closest('[data-col]'); if (col) { selColor = +col.dataset.col; imgIdx = 0; if (!cur.colors[selColor].sizes[selSize]) selSize = null; return renderSheet(); }
  const sz = t.closest('[data-size]'); if (sz && !sz.disabled) { selSize = sz.dataset.size; return renderSheet(); }
  const qb = t.closest('[data-q]'); if (qb) { qty = Math.min(20, Math.max(1, qty + +qb.dataset.q)); return renderSheet(); }
  const im = t.closest('[data-i]'); if (im) { imgIdx = +im.dataset.i; return renderSheet(); }
};
$('#sheet').onmousemove = (e) => {
  const z = e.target.closest('.zoomable.zoomed'); if (!z) return;
  const r = z.getBoundingClientRect();
  z.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
};
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
$('#guide').onclick = (e) => { if (e.target.id === 'guide' || e.target.closest('[data-act=gclose]')) $('#guide').classList.remove('open'); };
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#guide').classList.contains('open')) $('#guide').classList.remove('open'); else closeModal();
});

// ---------- hero quote slider ----------
(function () {
  const slides = [...document.querySelectorAll('#qslides .q')];
  const dots = $('#qdots');
  if (slides.length < 2) return;
  let i = 0, timer;
  dots.innerHTML = slides.map((_, k) => `<button class="${k ? '' : 'on'}" data-k="${k}" aria-label="Quote ${k + 1}"></button>`).join('');
  function go(n) {
    if (n === i) return;
    const old = slides[i];
    old.classList.remove('on'); old.classList.add('out');
    setTimeout(() => old.classList.remove('out'), 750);
    i = n; slides[i].classList.add('on');
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }
  const start = () => { clearInterval(timer); timer = setInterval(() => go((i + 1) % slides.length), 4500); };
  dots.onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { go(+b.dataset.k); start(); } };
  const hero = $('.hero');
  hero.onmouseenter = () => clearInterval(timer);
  hero.onmouseleave = start;
  start();
})();

load();
