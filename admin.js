const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

let products = [];
const labels = { gida: 'Gıda', ekipman: 'Ekipman', hizmet: 'Hizmet' };

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  verifyAdminSession();
  loadProducts();

  $('adminSearch').addEventListener('input', render);
  $('categoryFilter').addEventListener('change', render);
  $('newProductBtn').onclick = () => openModal();
  $('closeModal').onclick = closeModal;
  $('cancelBtn').onclick = closeModal;
  $('modalBackdrop').addEventListener('click', e => { if (e.target === $('modalBackdrop')) closeModal(); });

  $('productForm').addEventListener('submit', handleFormSubmit);
  $('productTable').addEventListener('click', handleRowActions);
  
  if ($('logoutBtn')) {
    $('logoutBtn').onclick = handleLogout;
  }

  $('exportBtn').onclick = handleExport;
  $('importInput').addEventListener('change', handleImport);
  $('resetBtn').onclick = handleReset;
});

function verifyAdminSession() {
  fetch('/api/auth/me')
    .then(res => {
      if (res.status !== 200) {
        localStorage.removeItem('karahanliUser');
        window.location.href = 'register.html';
        throw new Error('Unauthenticated');
      }
      return res.json();
    })
    .then(data => {
      if (data.user.role !== 'admin') {
        window.location.href = 'account.html';
      } else {
        localStorage.setItem('karahanliUser', JSON.stringify(data.user));
      }
    })
    .catch(err => {
      console.error(err);
    });
}

function loadProducts() {
  fetch('/api/products')
    .then(res => res.json())
    .then(data => {
      products = data;
      render();
    })
    .catch(err => {
      showToast('Ürünler yüklenirken hata oluştu.');
    });
}

function render() {
  const q = $('adminSearch').value.toLocaleLowerCase('tr-TR');
  const filter = $('categoryFilter').value;
  const list = products.filter(p => (filter === 'all' || p.category === filter) && (`${p.name} ${p.brand}`).toLocaleLowerCase('tr-TR').includes(q));

  $('productCount').textContent = `${products.length} kayıt`;
  
  $('stats').innerHTML = `
    <article class="stat"><span>Toplam ürün</span><strong>${products.length}</strong></article>
    <article class="stat"><span>Toplam stok</span><strong>${products.reduce((s, p) => s + Number(p.stock || 0), 0)}</strong></article>
    <article class="stat"><span>Stokta olmayan</span><strong>${products.filter(p => Number(p.stock) <= 0).length}</strong></article>
    <article class="stat"><span>Ortalama fiyat</span><strong>${money(products.length ? products.reduce((s, p) => s + Number(p.price), 0) / products.length : 0)}</strong></article>
  `;

  $('productTable').innerHTML = list.length ? list.map(p => `
    <tr>
      <td>
        <div class="product-cell">
          <div class="thumb" style="${p.image ? `background-image:url('${esc(p.image)}')` : `background:${esc(p.color || '#555')}`}">
            ${p.image ? '' : esc((p.brand || '?')[0])}
          </div>
          <div>
            <strong>${esc(p.name)}</strong>
            <small>${esc(p.brand)}</small>
          </div>
        </div>
      </td>
      <td><span class="category-pill">${labels[p.category] || esc(p.category)}</span></td>
      <td><strong>${money(p.price)}</strong>${p.oldPrice ? `<br><small><del>${money(p.oldPrice)}</del></small>` : ''}</td>
      <td><span class="stock-pill ${Number(p.stock) <= 0 ? 'out' : Number(p.stock) < 5 ? 'low' : ''}">${Number(p.stock) || 0}</span></td>
      <td>${esc(p.badge || '—')}</td>
      <td>
        <div class="row-actions">
          <button class="icon-action" data-edit="${p.id}">Düzenle</button>
          <button class="icon-action delete" data-delete="${p.id}">Sil</button>
        </div>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-row">Eşleşen ürün bulunamadı.</td></tr>';
}

function openModal(product) {
  $('productForm').reset();
  $('productId').value = product?.id || '';
  $('modalTitle').textContent = product ? 'Ürünü Düzenle' : 'Yeni Ürün';
  $('name').value = product?.name || '';
  $('brand').value = product?.brand || '';
  $('category').value = product?.category || 'gida';
  $('price').value = product?.price ?? '';
  $('oldPrice').value = product?.oldPrice ?? '';
  $('stock').value = product?.stock ?? 0;
  $('badge').value = product?.badge || '';
  $('color').value = product?.color || '#72462f';
  // Clear the file input
  $('image').value = '';
  $('modalBackdrop').hidden = false;
  $('name').focus();
}

function closeModal() {
  $('modalBackdrop').hidden = true;
}

function handleFormSubmit(e) {
  e.preventDefault();
  const id = $('productId').value;
  const price = Number($('price').value);
  const oldPriceVal = $('oldPrice').value;
  const oldPrice = oldPriceVal ? Number(oldPriceVal) : null;

  if (oldPrice !== null && oldPrice < price) {
    showToast('Eski fiyat satış fiyatından düşük olamaz');
    return;
  }

  const formData = new FormData();
  formData.append('name', $('name').value.trim());
  formData.append('brand', $('brand').value.trim());
  formData.append('category', $('category').value);
  formData.append('price', price);
  formData.append('oldPrice', oldPrice || '');
  formData.append('stock', Number($('stock').value));
  formData.append('badge', $('badge').value.trim());
  formData.append('color', $('color').value);
  
  if ($('image').files[0]) {
    formData.append('image', $('image').files[0]);
  }

  const url = id ? `/api/products/${id}` : '/api/products';
  const method = id ? 'PUT' : 'POST';

  fetch(url, {
    method: method,
    body: formData
  })
  .then(res => {
    if (res.ok) {
      showToast(id ? 'Ürün güncellendi' : 'Ürün eklendi');
      closeModal();
      loadProducts();
    } else {
      return res.json().then(data => {
        showToast(data.message || 'Ürün kaydedilirken hata oluştu.');
      });
    }
  })
  .catch(err => {
    showToast('Sunucu ile iletişim hatası.');
  });
}

function handleRowActions(e) {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  
  if (edit) {
    const p = products.find(p => p.id === Number(edit.dataset.edit));
    openModal(p);
  }
  
  if (del) {
    const id = Number(del.dataset.delete);
    const p = products.find(x => x.id === id);
    if (confirm(`“${p.name}” ürünü silinsin mi?`)) {
      fetch(`/api/products/${id}`, {
        method: 'DELETE'
      })
      .then(res => {
        if (res.ok) {
          showToast('Ürün silindi');
          loadProducts();
        } else {
          showToast('Ürün silinirken hata oluştu.');
        }
      })
      .catch(err => {
        showToast('Sunucu ile iletişim hatası.');
      });
    }
  }
}

function handleLogout(e) {
  e.preventDefault();
  if (confirm('Çıkış yapmak istediğinize emin misiniz?')) {
    fetch('/api/auth/logout', { method: 'POST' })
      .finally(() => {
        localStorage.removeItem('karahanliUser');
        window.location.href = 'index.html';
      });
  }
}

function handleExport() {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'roastery-products.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
    
    // Import each product sequentially to the backend
    showToast('Ürünler sisteme yükleniyor...');
    for (const p of data) {
      const formData = new FormData();
      formData.append('name', p.name);
      formData.append('brand', p.brand);
      formData.append('category', p.category);
      formData.append('price', p.price);
      formData.append('oldPrice', p.oldPrice || '');
      formData.append('stock', p.stock || 0);
      formData.append('badge', p.badge || '');
      formData.append('color', p.color || '#444444');
      
      await fetch('/api/products', {
        method: 'POST',
        body: formData
      });
    }
    showToast('Ürün dosyası başarıyla yüklendi.');
    loadProducts();
  } catch (err) {
    alert('Geçersiz JSON dosyası veya yükleme hatası.');
  }
  e.target.value = '';
}

function handleReset() {
  if (confirm('Veritabanındaki ürünleri varsayılanlar ile sıfırlamak istiyor musunuz?')) {
    // Delete all current products
    showToast('Sıfırlanıyor...');
    
    const deletePromises = products.map(p => fetch(`/api/products/${p.id}`, { method: 'DELETE' }));
    
    Promise.all(deletePromises)
      .then(() => {
        // Import defaults
        const defaults = [
          {name:'Etiyopya Guji Filtre Kahve 250 g',brand:'KARAHANLI',price:495,oldPrice:550,category:'gida',badge:'Yeni',color:'#72462f',stock:24},
          {name:'Brezilya Cerrado Espresso 1 kg',brand:'KARAHANLI',price:1190,oldPrice:1320,category:'gida',badge:'%10',color:'#3f2c24',stock:18},
          {name:'Compact Pro Espresso Makinesi',brand:'NOVA',price:28990,oldPrice:null,category:'ekipman',badge:'Çok Satan',color:'#444444',stock:6},
          {name:'Elektrikli Kahve Değirmeni',brand:'MAZZ',price:8990,oldPrice:9750,category:'ekipman',badge:'Fırsat',color:'#444444',stock:9},
          {name:'Kolombiya Huila Filtre Kahve 250 g',brand:'KARAHANLI',price:475,oldPrice:null,category:'gida',badge:null,color:'#9a694d',stock:32},
          {name:'Dual Boiler Espresso Makinesi',brand:'LINEA',price:76900,oldPrice:null,category:'ekipman',badge:'Profesyonel',color:'#444444',stock:3},
          {name:'Hassas Barista Terazisi',brand:'FELLOW',price:2590,oldPrice:2890,category:'ekipman',badge:'%10',color:'#444444',stock:14},
          {name:'Paslanmaz Çelik Süt Potu 600 ml',brand:'BARISTA',price:890,oldPrice:null,category:'ekipman',badge:null,color:'#444444',stock:20},
          {name:'Mutfak Planlama ve Yerinde Keşif Hizmeti',brand:'KARAHANLI',price:1500,oldPrice:null,category:'hizmet',badge:'Popüler',color:'#28392f',stock:99}
        ];
        
        const createPromises = defaults.map(p => {
          const formData = new FormData();
          formData.append('name', p.name);
          formData.append('brand', p.brand);
          formData.append('category', p.category);
          formData.append('price', p.price);
          formData.append('oldPrice', p.oldPrice || '');
          formData.append('stock', p.stock);
          formData.append('badge', p.badge || '');
          formData.append('color', p.color);
          return fetch('/api/products', { method: 'POST', body: formData });
        });
        
        return Promise.all(createPromises);
      })
      .then(() => {
        showToast('Veritabanı başarıyla sıfırlandı.');
        loadProducts();
      })
      .catch(err => {
        showToast('Sıfırlama sırasında hata oluştu.');
      });
  }
}

function showToast(msg) {
  const t = $('adminToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.t);
  window.t = setTimeout(() => t.classList.remove('show'), 2000);
}
