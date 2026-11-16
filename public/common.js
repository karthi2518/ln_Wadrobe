const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');

// T-shirt drawing used when a product has no photo
function teeSVG(hex) {
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M70 20 L25 45 L10 90 L42 100 L50 82 L50 180 L150 180 L150 82 L158 100 L190 90 L175 45 L130 20 Q100 40 70 20Z"
   fill="${esc(hex)}" stroke="rgba(0,0,0,.2)" stroke-width="2" stroke-linejoin="round"/>
  <path d="M70 20 Q100 42 130 20" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="3"/></svg>`;
}
const TAGS = ['New', 'Best Seller', 'Few Left', 'Sale'];
const onSale = (p) => p.salePrice > 0 && p.salePrice < p.price;
const effPrice = (p) => (onSale(p) ? p.salePrice : p.price);
const priceHTML = (p) => onSale(p)
  ? `<span class="price">${money(p.salePrice)}</span> <s class="old">${money(p.price)}</s> <span class="off">${Math.round((1 - p.salePrice / p.price) * 100)}% off</span>`
  : `<span class="price">${money(p.price)}</span>`;
const inStock = (c) => Object.values(c.sizes).some(Boolean);
const productInStock = (p) => p.colors.some(inStock);
