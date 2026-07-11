const defaultProducts = [
  {id:1,name:'Etiyopya Guji Filtre Kahve 250 g',brand:'KARAHANLI',price:495,oldPrice:550,category:'gida',badge:'Yeni',color:'#72462f',stock:24,image:''},
  {id:2,name:'Brezilya Cerrado Espresso 1 kg',brand:'KARAHANLI',price:1190,oldPrice:1320,category:'gida',badge:'%10',color:'#3f2c24',stock:18,image:''},
  {id:3,name:'Compact Pro Espresso Makinesi',brand:'NOVA',price:28990,oldPrice:null,category:'ekipman',badge:'Çok Satan',color:'#444444',stock:6,image:''},
  {id:4,name:'Elektrikli Kahve Değirmeni',brand:'MAZZ',price:8990,oldPrice:9750,category:'ekipman',badge:'Fırsat',color:'#444444',stock:9,image:''},
  {id:5,name:'Kolombiya Huila Filtre Kahve 250 g',brand:'KARAHANLI',price:475,oldPrice:null,category:'gida',badge:null,color:'#9a694d',stock:32,image:''},
  {id:6,name:'Dual Boiler Espresso Makinesi',brand:'LINEA',price:76900,oldPrice:null,category:'ekipman',badge:'Profesyonel',color:'#444444',stock:3,image:''},
  {id:7,name:'Hassas Barista Terazisi',brand:'FELLOW',price:2590,oldPrice:2890,category:'ekipman',badge:'%10',color:'#444444',stock:14,image:''},
  {id:8,name:'Paslanmaz Çelik Süt Potu 600 ml',brand:'BARISTA',price:890,oldPrice:null,category:'ekipman',badge:null,color:'#444444',stock:20,image:''},
  {id:9,name:'Mutfak Planlama ve Yerinde Keşif Hizmeti',brand:'KARAHANLI',price:1500,oldPrice:null,category:'hizmet',badge:'Popüler',color:'#28392f',stock:99,image:''}
];

const STORAGE_KEY = 'roasteryProducts';
const FAV_KEY = 'karahanliFavorites';
const CART_KEY = 'karahanliCart';
const WHATSAPP_PHONE = "905XXXXXXXXX"; // İşletme WhatsApp Numarası (Configurable)

function loadProducts(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : defaultProducts;
  } catch { return defaultProducts; }
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAV_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

let products = loadProducts();
const cart = loadCart();
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n);
const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const grid=document.getElementById('productGrid');

function renderProducts(filter='all',query=''){
 products=loadProducts();
 const q=query.toLocaleLowerCase('tr-TR');
 const list=products.filter(p=>(filter==='all'||p.category===filter)&&(`${p.name} ${p.brand}`).toLocaleLowerCase('tr-TR').includes(q));
 const favorites = loadFavorites();
 grid.innerHTML=list.map(p=>{
   const isFav = favorites.includes(p.id);
   return `<article class="product-card" data-category="${escapeHTML(p.category)}">
   <div class="product-image ${p.image?'has-image':''}" style="--product-color:${escapeHTML(p.color||'#444')};${p.image?`background-image:url('${escapeHTML(p.image)}')`:''}">${p.badge?`<span class="badge">${escapeHTML(p.badge)}</span>`:''}<button class="favorite-btn ${isFav ? 'active' : ''}" data-favorite="${p.id}" aria-label="Favoriye ekle">${isFav ? '♥' : '♡'}</button>${Number(p.stock)<=0?'<span class="stock-out">Tükendi</span>':''}</div>
   <div class="product-info">
     <span class="product-brand">${escapeHTML(p.brand)}</span>
     <h3>${escapeHTML(p.name)}</h3>
     <div class="rating">★★★★★ <span style="color:#999">(24)</span></div>
     <div class="price-row">
       <div class="price">${p.oldPrice?`<del>${money(p.oldPrice)}</del>`:''}<strong>${money(p.price)}</strong></div>
       ${Number(p.stock) > 0 ? `
       <div class="product-actions">
         <div class="quantity-selector product-quantity" data-id="${p.id}">
           <button type="button" class="quantity-btn decrease" aria-label="Adedi azalt">−</button>
           <input type="number" class="quantity-input" value="1" min="1" step="1" inputmode="numeric" aria-label="Ürün adedi">
           <button type="button" class="quantity-btn increase" aria-label="Adedi artır">+</button>
         </div>
         <button class="add-cart" data-add="${p.id}" aria-label="Sepete ekle">+</button>
       </div>
       ` : `
       <button class="add-cart" disabled aria-label="Tükendi">+</button>
       `}
     </div>
   </div>
   </article>`;
 }).join('');
 if(!list.length) grid.innerHTML='<p>Aramanızla eşleşen ürün bulunamadı.</p>';
}
renderProducts();

// Initialize cart display
updateCart(false);

window.addEventListener('storage',e=>{
  if(e.key===STORAGE_KEY || e.key===FAV_KEY) renderProducts();
  if(e.key===CART_KEY) {
    cart.length = 0;
    cart.push(...loadCart());
    updateCart(false);
  }
});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden) {
    renderProducts();
    cart.length = 0;
    cart.push(...loadCart());
    updateCart(false);
  }
});

// Storefront Filter Tabs
document.getElementById('productTabs').addEventListener('click',e=>{
  if(!e.target.matches('button'))return;
  document.querySelectorAll('#productTabs button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  renderProducts(e.target.dataset.filter);
});

// Storefront Product Card Clicks
grid.addEventListener('click',e=>{
  const add=e.target.closest('[data-add]');
  const fav=e.target.closest('[data-favorite]');
  const decBtn=e.target.closest('.quantity-btn.decrease');
  const incBtn=e.target.closest('.quantity-btn.increase');

  if(decBtn){
    const input = decBtn.closest('.quantity-selector').querySelector('.quantity-input');
    const val = Math.max(1, Number(input.value) - 1);
    input.value = val;
  }
  if(incBtn){
    const input = incBtn.closest('.quantity-selector').querySelector('.quantity-input');
    const val = Number(input.value) + 1;
    input.value = val;
  }
  if(add&&!add.disabled){
    const card = add.closest('.product-card');
    const input = card.querySelector('.quantity-input');
    const qty = input ? Math.max(1, Math.floor(Number(input.value) || 1)) : 1;
    addToCart(Number(add.dataset.add), qty);
    if(input) input.value = 1;
  }
  if(fav){
    const id = Number(fav.dataset.favorite);
    let favs = loadFavorites();
    const isActive = fav.classList.toggle('active');
    if (isActive) {
      if (!favs.includes(id)) favs.push(id);
      fav.textContent = '♥';
      showToast('Favorilere eklendi');
    } else {
      favs = favs.filter(x => x !== id);
      fav.textContent = '♡';
      showToast('Favorilerden çıkarıldı');
    }
    saveFavorites(favs);
  }
});

grid.addEventListener('change', e => {
  if (e.target.matches('.quantity-input')) {
    let val = Math.max(1, Math.floor(Number(e.target.value) || 1));
    e.target.value = val;
  }
});

function addToCart(id, qty = 1){
  products=loadProducts();
  const product=products.find(p=>p.id===id);
  if(!product||Number(product.stock)<=0)return;
  const existing=cart.find(i=>i.id===id);
  existing ? (existing.qty += qty) : cart.push({...product,qty});
  updateCart(true);
  showToast('Ürün sepete eklendi')
}

function updateCart(save = true){
  if (save) saveCart(cart);
  document.getElementById('cartCount').textContent=cart.reduce((s,i)=>s+i.qty,0);
  const box=document.getElementById('cartItems');
  box.innerHTML=cart.length?cart.map(i=>`
    <div class="cart-item">
      <div class="cart-thumb"></div>
      <div class="cart-details">
        <h4>${escapeHTML(i.name)}</h4>
        <div class="cart-meta">
          <div class="quantity-selector cart-quantity" data-id="${i.id}">
            <button type="button" class="quantity-btn decrease-cart" aria-label="Adedi azalt">−</button>
            <input type="number" class="quantity-input cart-qty-input" value="${i.qty}" min="1" step="1" inputmode="numeric" aria-label="Ürün adedi">
            <button type="button" class="quantity-btn increase-cart" aria-label="Adedi artır">+</button>
          </div>
          <span class="cart-item-price">${money(i.price * i.qty)}</span>
        </div>
      </div>
      <button class="remove-item" data-remove="${i.id}">×</button>
    </div>
  `).join(''):'<p class="empty-cart">Sepetiniz henüz boş.</p>';
  document.getElementById('cartTotal').textContent=money(cart.reduce((s,i)=>s+i.price*i.qty,0))
}

document.getElementById('cartItems').addEventListener('click',e=>{
  const btn=e.target.closest('[data-remove]');
  const decBtn = e.target.closest('.decrease-cart');
  const incBtn = e.target.closest('.increase-cart');

  if(btn){
    const idx=cart.findIndex(i=>i.id===Number(btn.dataset.remove));
    if(idx !== -1){
      cart.splice(idx,1);
      updateCart(true);
    }
    return;
  }
  if(decBtn){
    const id = Number(decBtn.closest('.quantity-selector').dataset.id);
    const item = cart.find(i => i.id === id);
    if(item){
      item.qty = Math.max(1, item.qty - 1);
      updateCart(true);
    }
  }
  if(incBtn){
    const id = Number(incBtn.closest('.quantity-selector').dataset.id);
    const item = cart.find(i => i.id === id);
    if(item){
      item.qty++;
      updateCart(true);
    }
  }
});

document.getElementById('cartItems').addEventListener('change', e => {
  if (e.target.matches('.cart-qty-input')) {
    const id = Number(e.target.closest('.quantity-selector').dataset.id);
    const item = cart.find(i => i.id === id);
    if (item) {
      const val = Math.max(1, Math.floor(Number(e.target.value) || 1));
      item.qty = val;
      updateCart(true);
    }
  }
});

const drawer=document.getElementById('cartDrawer'),overlay=document.getElementById('overlay');
function toggleCart(open){
  drawer.classList.toggle('open',open);
  overlay.classList.toggle('open',open);
  drawer.setAttribute('aria-hidden',String(!open))
}
document.getElementById('cartBtn').onclick=()=>toggleCart(true);
document.getElementById('closeCart').onclick=()=>toggleCart(false);
overlay.onclick=()=>toggleCart(false);

// Account Navigation
document.getElementById('accountBtn').onclick = () => {
  try {
    const user = JSON.parse(localStorage.getItem('karahanliUser'));
    if (!user) {
      location.href = 'register.html';
    } else if (user.role === 'admin') {
      location.href = 'admin.html';
    } else {
      location.href = 'account.html';
    }
  } catch(e) {
    location.href = 'register.html';
  }
};

document.getElementById('favoritesBtn').onclick = () => {
  location.href = 'favorites.html';
};

// WhatsApp Order Checkout
document.getElementById('checkoutBtn').onclick = () => {
  if (!cart.length) {
    showToast('Sepetiniz boş. Lütfen önce ürün ekleyin.');
    return;
  }
  
  let userText = '';
  try {
    const user = JSON.parse(localStorage.getItem('karahanliUser'));
    if (user && (user.fullName || user.phone || user.companyName)) {
      userText = `\nMüşteri Bilgileri:\n` +
                 (user.fullName ? `Ad Soyad: ${user.fullName}\n` : '') +
                 (user.phone ? `Telefon: ${user.phone}\n` : '') +
                 (user.companyName ? `Firma: ${user.companyName}\n` : '');
    }
  } catch(e) {}
  
  const itemsText = cart.map((i, idx) => 
    `${idx + 1}. ${i.name}\n` +
    `   Adet: ${i.qty}\n` +
    `   Birim Fiyat: ${money(i.price)}\n` +
    `   Tutar: ${money(i.price * i.qty)}`
  ).join('\n\n');
  
  const subtotalText = money(cart.reduce((s, i) => s + i.price * i.qty, 0));
  
  const message = `Merhaba Karahanlı Gıda,\n\n` +
                  `Aşağıdaki ürünler için sipariş vermek istiyorum:\n\n` +
                  itemsText + `\n\n` +
                  `Ara Toplam: ${subtotalText}\n` +
                  userText + `\n` +
                  `Teslimat ve ödeme detayları için benimle iletişime geçebilirsiniz.`;
                  
  const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

// Mega Menu & Category Nav Logic
const megaMenu = document.getElementById('megaMenu');
const allCategoriesBtn = document.getElementById('allCategoriesBtn');

function toggleMegaMenu(open) {
  const isOpen = open !== undefined ? open : !megaMenu.classList.contains('open');
  megaMenu.classList.toggle('open', isOpen);
  allCategoriesBtn.setAttribute('aria-expanded', String(isOpen));
}

allCategoriesBtn.onclick = (e) => {
  e.stopPropagation();
  toggleMegaMenu();
};

// Close mega menu on click outside
document.addEventListener('click', (e) => {
  if (!megaMenu.contains(e.target) && e.target !== allCategoriesBtn) {
    toggleMegaMenu(false);
  }
});

// Close mega menu on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    toggleMegaMenu(false);
  }
});

// Category Link Clicks in Navbar & Mega Menu
document.getElementById('categoryNav').addEventListener('click', e => {
  const catLink = e.target.closest('[data-cat]');
  const subLink = e.target.closest('[data-sub]');
  
  if (catLink && catLink.id !== 'allCategoriesBtn') {
    e.preventDefault();
    const filter = catLink.dataset.cat;
    document.querySelectorAll('#productTabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
    renderProducts(filter);
    toggleMegaMenu(false);
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  }
  
  if (subLink) {
    e.preventDefault();
    const sub = subLink.dataset.sub;
    document.getElementById('searchInput').value = sub;
    document.querySelectorAll('#productTabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === 'all');
    });
    renderProducts('all', sub);
    toggleMegaMenu(false);
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  }
});

// Mobile Accordion Columns
megaMenu.querySelectorAll('.mega-col-title').forEach(title => {
  title.addEventListener('click', () => {
    if (window.innerWidth <= 980) {
      const col = title.closest('.mega-col');
      const isOpen = col.classList.contains('open');
      megaMenu.querySelectorAll('.mega-col').forEach(c => c.classList.remove('open'));
      if (!isOpen) {
        col.classList.add('open');
      }
    }
  });
});

document.getElementById('mobileMenuBtn').onclick=()=>document.getElementById('categoryNav').classList.toggle('mobile-open');

document.getElementById('searchForm').addEventListener('submit',e=>{
  e.preventDefault();
  const q=document.getElementById('searchInput').value;
  renderProducts('all',q);
  document.getElementById('products').scrollIntoView({behavior:'smooth'})
});

let current=0;
const slides=[...document.querySelectorAll('.hero-slide')],dots=[...document.querySelectorAll('#sliderDots button')];
function showSlide(i){
  current=(i+slides.length)%slides.length;
  slides.forEach((s,n)=>s.classList.toggle('active',n===current));
  dots.forEach((d,n)=>d.classList.toggle('active',n===current))
}
document.getElementById('nextSlide').onclick=()=>showSlide(current+1);
document.getElementById('prevSlide').onclick=()=>showSlide(current-1);
dots.forEach(d=>d.onclick=()=>showSlide(Number(d.dataset.index)));
setInterval(()=>showSlide(current+1),7000);

document.getElementById('newsletterForm').addEventListener('submit',e=>{
  e.preventDefault();
  document.getElementById('newsletterMessage').textContent='Teşekkürler! Kaydınız alındı.';
  e.target.reset()
});

function showToast(message){
  const t=document.getElementById('toast');
  t.textContent=message;
  t.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer=setTimeout(()=>t.classList.remove('show'),1800)
}

// Display registered user's name if logged in & check pending cross-page filters
(function() {
  try {
    const user = JSON.parse(localStorage.getItem('karahanliUser'));
    if (user && user.fullName) {
      const nameEl = document.querySelector('#accountBtn small');
      if (nameEl) nameEl.textContent = user.fullName.split(' ')[0];
    }
  } catch(e) {}

  try {
    const pendingCat = sessionStorage.getItem('pendingCategoryFilter');
    const pendingSub = sessionStorage.getItem('pendingSubCategoryFilter');
    if (pendingCat) {
      sessionStorage.removeItem('pendingCategoryFilter');
      const btn = document.querySelector(`#productTabs button[data-filter="${pendingCat}"]`);
      if (btn) {
        document.querySelectorAll('#productTabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts(pendingCat);
      }
      setTimeout(() => {
        const el = document.getElementById('products');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else if (pendingSub) {
      sessionStorage.removeItem('pendingSubCategoryFilter');
      const input = document.getElementById('searchInput');
      if (input) input.value = pendingSub;
      document.querySelectorAll('#productTabs button').forEach(b => b.classList.remove('active'));
      const allBtn = document.querySelector('#productTabs button[data-filter="all"]');
      if (allBtn) allBtn.classList.add('active');
      renderProducts('all', pendingSub);
      setTimeout(() => {
        const el = document.getElementById('products');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  } catch(e) {}
})();
