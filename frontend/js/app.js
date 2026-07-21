// ======================================================================
// GL APP - FRONTEND (Vanilla JS SPA)
// ======================================================================
const API = ''; // same origin

const state = {
  token: localStorage.getItem('gl_token') || null,
  user: JSON.parse(localStorage.getItem('gl_user') || 'null'),
  permissions: JSON.parse(localStorage.getItem('gl_perms') || 'null'),
  branches: [],
  coa: [],
  categories: [],
  departments: [],
  subdepartments: [],
  activeCabang: localStorage.getItem('gl_active_cabang') || null,
  currentPage: null
};

// ---------------------- API HELPER ----------------------
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + '/api' + path, Object.assign({}, opts, { headers }));
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || 'Terjadi kesalahan.');
  return data;
}

function hasPerm(kode, action) {
  if (state.permissions === 'ALL') return true;
  if (!state.permissions) return false;
  const p = state.permissions.find(x => x.kode_menu === kode);
  if (!p) return false;
  const key = { view: 'can_view', add: 'can_add', edit: 'can_edit', delete: 'can_delete', post: 'can_post' }[action];
  return !!p[key];
}

function fmtNum(n) {
  n = Number(n || 0);
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------- LOGIN ----------------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.style.display = 'none';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    state.token = data.token; state.user = data.user; state.permissions = data.permissions;
    localStorage.setItem('gl_token', state.token);
    localStorage.setItem('gl_user', JSON.stringify(state.user));
    localStorage.setItem('gl_perms', JSON.stringify(state.permissions));
    await bootApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  location.reload();
});

// ---------------------- MENU DEFINITION ----------------------
const MENU_STRUCTURE = [
  { group: 'Master Data', items: [
    { kode: 'MASTER_CABANG', label: 'Kode Cabang', page: 'cabang' },
    { kode: 'MASTER_KATEGORI', label: 'Kategori Akun', page: 'kategori' },
    { kode: 'MASTER_COA', label: 'Kode Account', page: 'coa' },
    { kode: 'MASTER_DEPT', label: 'Kode Department', page: 'dept' },
    { kode: 'MASTER_SUBDEPT', label: 'Sub Department', page: 'subdept' }
  ]},
  { group: 'Transaksi', items: [
    { kode: 'TRX_JURNAL', label: 'Jurnal Transaksi', page: 'jurnal' },
    { kode: 'TRX_POSTING', label: 'Posting Transaksi', page: 'posting' },
    { kode: 'TRX_BATALPOSTING', label: 'Batal Posting', page: 'batalposting' },
    { kode: 'TRX_TUTUPBUKU', label: 'Tutup Buku', page: 'tutupbuku' },
    { kode: 'TRX_BATALTUTUPBUKU', label: 'Batal Tutup Buku', page: 'batalttutupbuku' }
  ]},
  { group: 'Laporan', items: [
    { kode: 'LAP_NERACA', label: 'Laporan Neraca', page: 'neraca' },
    { kode: 'LAP_LABARUGI', label: 'Laporan Laba Rugi', page: 'labarugi' },
    { kode: 'LAP_HARIAN', label: 'Laporan Transaksi Harian', page: 'harian' },
    { kode: 'LAP_PREDIKSI', label: 'Prediksi Laba Rugi (AI)', page: 'prediksi' }
  ]},
  { group: 'Setting', items: [
    { kode: 'SET_USER', label: 'Pembuatan User', page: 'user' },
    { kode: 'SET_HAKAKSES', label: 'Hak Akses User', page: 'hakakses' }
  ]}
];

function renderMenu() {
  const nav = document.getElementById('menuNav');
  nav.innerHTML = '';
  MENU_STRUCTURE.forEach(g => {
    const visibleItems = g.items.filter(i => hasPerm(i.kode, 'view'));
    if (visibleItems.length === 0) return;
    const gt = document.createElement('div');
    gt.className = 'menu-group'; gt.textContent = g.group;
    nav.appendChild(gt);
    visibleItems.forEach(i => {
      const a = document.createElement('a');
      a.className = 'menu-item'; a.textContent = i.label; a.dataset.page = i.page;
      a.onclick = () => goPage(i.page, i.label);
      nav.appendChild(a);
    });
  });
}

function goPage(page, label) {
  state.currentPage = page;
  document.querySelectorAll('.menu-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('pageTitle').textContent = label;
  const content = document.getElementById('content');
  content.innerHTML = '<p class="small-text">Memuat...</p>';
  PAGES[page]().catch(e => { content.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; });
}

// ---------------------- BOOT ----------------------
async function bootApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  document.getElementById('userLabel').textContent = `${state.user.nama_lengkap || state.user.username} (${state.user.role}) - ${state.user.cabang_nama || ''}`;
  renderMenu();
  try { state.branches = await api('/branches'); } catch (e) { state.branches = []; }
  try { state.categories = await api('/categories'); } catch (e) { state.categories = []; }
  try { state.coa = await api('/coa'); } catch (e) { state.coa = []; }
  try { state.departments = await api('/departments'); } catch (e) { state.departments = []; }
  try { state.subdepartments = await api('/subdepartments'); } catch (e) { state.subdepartments = []; }

  // Tentukan cabang aktif: user tanpa akses semua cabang selalu terkunci ke cabangnya sendiri.
  if (!state.user.akses_semua_cabang) {
    state.activeCabang = state.user.cabang_id ? String(state.user.cabang_id) : null;
  } else if (!state.activeCabang || !state.branches.find(b => String(b.id) === String(state.activeCabang))) {
    state.activeCabang = state.branches.length ? String(state.branches[0].id) : null;
  }
  localStorage.setItem('gl_active_cabang', state.activeCabang || '');
  renderBranchSwitcher();

  const first = MENU_STRUCTURE.flatMap(g => g.items).find(i => hasPerm(i.kode, 'view'));
  if (first) goPage(first.page, first.label);
  else document.getElementById('content').innerHTML = '<div class="msg error">Anda tidak memiliki akses menu apapun.</div>';
}

function branchOptions(selected) {
  return state.branches.map(b => `<option value="${b.id}" ${String(b.id) === String(selected) ? 'selected' : ''}>${esc(b.kode_cabang)} - ${esc(b.nama_cabang)}</option>`).join('');
}
function branchFilterOptions() {
  return `<option value="">Semua Cabang</option>${branchOptions(state.activeCabang)}`;
}
function renderBranchSwitcher() {
  const wrap = document.getElementById('branchSwitcherWrap');
  if (!wrap) return;
  if (state.user.akses_semua_cabang) {
    wrap.innerHTML = `<label>Cabang Aktif</label><select id="branchSwitcher">${branchOptions(state.activeCabang)}</select>`;
    document.getElementById('branchSwitcher').onchange = (e) => {
      state.activeCabang = e.target.value;
      localStorage.setItem('gl_active_cabang', state.activeCabang);
      if (state.currentPage) {
        const item = MENU_STRUCTURE.flatMap(g => g.items).find(i => i.page === state.currentPage);
        goPage(state.currentPage, item ? item.label : '');
      }
    };
  } else {
    const b = state.branches.find(x => String(x.id) === String(state.activeCabang));
    wrap.innerHTML = `<label>Cabang</label><div class="fixed-branch">${b ? esc(b.kode_cabang) + ' - ' + esc(b.nama_cabang) : '-'}</div>`;
  }
}
function coaOptions(selected) {
  return state.coa.filter(c => c.status === 'AKTIF' && !c.is_header).map(c => `<option value="${c.kode_account}" ${c.kode_account === selected ? 'selected' : ''}>${esc(c.kode_account)} - ${esc(c.nama_account)}</option>`).join('');
}
function categoryOptions(selected) {
  return state.categories.filter(c => c.status === 'AKTIF').map(c => `<option value="${c.kode_kategori}" ${c.kode_kategori === selected ? 'selected' : ''}>${esc(c.kode_kategori)} - ${esc(c.nama_kategori)} (${esc(c.kelompok_laporan)})</option>`).join('');
}
function parentAccountOptions(selected) {
  return '<option value="">-- tanpa induk --</option>' +
    state.coa.filter(c => c.is_header && c.status === 'AKTIF').map(c => `<option value="${c.kode_account}" ${c.kode_account === selected ? 'selected' : ''}>${esc(c.kode_account)} - ${esc(c.nama_account)}</option>`).join('');
}
function deptOptions(selected) {
  const list = state.departments.filter(d => d.status === 'AKTIF');
  return '<option value="">-- tanpa department --</option>' +
    list.map(d => `<option value="${esc(d.kode_department)}" ${d.kode_department === selected ? 'selected' : ''}>${esc(d.kode_department)} - ${esc(d.nama_department)}</option>`).join('');
}
function subDeptOptions(selected) {
  return '<option value="">-- tanpa sub department --</option>' +
    (state.subdepartments || []).filter(s => s.status === 'AKTIF').map(s => `<option value="${esc(s.kode_sub_department)}" ${s.kode_sub_department === selected ? 'selected' : ''}>${esc(s.kode_sub_department)} - ${esc(s.nama_sub_department)} (${esc(s.tipe)})</option>`).join('');
}

// ======================================================================
// PAGES
// ======================================================================
const PAGES = {};

// ---------------------- MASTER: CABANG ----------------------
PAGES.cabang = async function () {
  const rows = await api('/branches');
  const canAdd = hasPerm('MASTER_CABANG', 'add'), canEdit = hasPerm('MASTER_CABANG', 'edit'), canDel = hasPerm('MASTER_CABANG', 'delete');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Cabang</label><input id="f_kode" maxlength="10"></div>
        <div class="field"><label>Nama Cabang</label><input id="f_nama"></div>
        <div class="field"><label>Alamat</label><input id="f_alamat"></div>
        <button class="btn" id="btnAdd">+ Tambah Cabang</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <table><thead><tr><th>Kode</th><th>Nama Cabang</th><th>Alamat</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_cabang)}</td><td>${esc(r.nama_cabang)}</td><td>${esc(r.alamat || '')}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status}</span></td>
        <td>${canDel ? `<button class="btn danger small" onclick="deleteBranch(${r.id})">Hapus</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const kode_cabang = document.getElementById('f_kode').value.trim();
    const nama_cabang = document.getElementById('f_nama').value.trim();
    const alamat = document.getElementById('f_alamat').value.trim();
    try {
      await api('/branches', { method: 'POST', body: JSON.stringify({ kode_cabang, nama_cabang, alamat }) });
      state.branches = await api('/branches');
      goPage('cabang', 'Kode Cabang');
    } catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.deleteBranch = async function (id) {
  if (!confirm('Hapus cabang ini?')) return;
  try { await api('/branches/' + id, { method: 'DELETE' }); state.branches = await api('/branches'); goPage('cabang', 'Kode Cabang'); }
  catch (e) { alert(e.message); }
};

// ---------------------- MASTER: KATEGORI AKUN ----------------------
PAGES.kategori = async function () {
  const rows = await api('/categories'); state.categories = rows;
  const canAdd = hasPerm('MASTER_KATEGORI', 'add'), canDel = hasPerm('MASTER_KATEGORI', 'delete');
  const kelompokLabel = { ASET: 'Aset (Neraca)', KEWAJIBAN: 'Kewajiban (Neraca)', MODAL: 'Modal (Neraca)', PENDAPATAN: 'Pendapatan (Laba Rugi)', BEBAN: 'Beban (Laba Rugi)' };
  document.getElementById('content').innerHTML = `
    <div class="card">
      <p class="small-text">Kategori Akun menentukan pengelompokan Kode Account ke dalam Neraca atau Laba Rugi. Anda bisa membuat kategori sebanyak yang dibutuhkan (contoh: "Aset Lancar" dan "Aset Tetap" sama-sama termasuk kelompok Aset).</p>
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Kategori</label><input id="f_kode" maxlength="20"></div>
        <div class="field"><label>Nama Kategori</label><input id="f_nama"></div>
        <div class="field"><label>Kelompok Laporan</label>
          <select id="f_kelompok"><option value="ASET">Aset (Neraca)</option><option value="KEWAJIBAN">Kewajiban (Neraca)</option>
          <option value="MODAL">Modal (Neraca)</option><option value="PENDAPATAN">Pendapatan (Laba Rugi)</option><option value="BEBAN">Beban (Laba Rugi)</option></select></div>
        <div class="field"><label>Saldo Normal</label><select id="f_saldo"><option value="DEBIT">DEBIT</option><option value="KREDIT">KREDIT</option></select></div>
        <button class="btn" id="btnAdd">+ Tambah Kategori</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <table><thead><tr><th>Kode</th><th>Nama Kategori</th><th>Kelompok Laporan</th><th>Saldo Normal</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_kategori)}</td><td>${esc(r.nama_kategori)}</td><td>${esc(kelompokLabel[r.kelompok_laporan] || r.kelompok_laporan)}</td><td>${esc(r.saldo_normal)}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status}</span></td>
        <td>${canDel ? `<button class="btn danger small" onclick="deleteKategori('${r.kode_kategori}')">Hapus</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      kode_kategori: document.getElementById('f_kode').value.trim(),
      nama_kategori: document.getElementById('f_nama').value.trim(),
      kelompok_laporan: document.getElementById('f_kelompok').value,
      saldo_normal: document.getElementById('f_saldo').value
    };
    try { await api('/categories', { method: 'POST', body: JSON.stringify(body) }); goPage('kategori', 'Kategori Akun'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.deleteKategori = async function (kode) {
  if (!confirm('Hapus kategori ini?')) return;
  try { await api('/categories/' + kode, { method: 'DELETE' }); goPage('kategori', 'Kategori Akun'); } catch (e) { alert(e.message); }
};

// ---------------------- MASTER: COA (Akun Induk & Akun Anak) ----------------------
let coaListCache = [];
PAGES.coa = async function () {
  const rows = await api('/coa'); state.coa = rows; coaListCache = rows;
  if (!state.categories.length) { try { state.categories = await api('/categories'); } catch (e) { /* ignore */ } }
  const canAdd = hasPerm('MASTER_COA', 'add'), canDel = hasPerm('MASTER_COA', 'delete'), canEdit = hasPerm('MASTER_COA', 'edit');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Account</label><input id="f_kode" maxlength="20"></div>
        <div class="field"><label>Nama Account</label><input id="f_nama"></div>
        <div class="field"><label>Kategori</label><select id="f_kategori">${categoryOptions()}</select></div>
        <div class="field"><label>Saldo Normal</label><select id="f_saldo"><option value="DEBIT">DEBIT</option><option value="KREDIT">KREDIT</option></select></div>
        <div class="field"><label>Akun Induk Dari</label><select id="f_parent">${parentAccountOptions()}</select></div>
        <div class="field"><label><input type="checkbox" id="f_header"> Jadikan Akun Induk (Header)</label></div>
        <button class="btn" id="btnAdd">+ Tambah Account</button>
      </div>` : ''}
      <p class="small-text">Buat dulu <strong>Akun Induk</strong> (centang "Jadikan Akun Induk", kosongkan "Akun Induk Dari"), baru buat <strong>Akun Anak</strong> di bawahnya (pilih induknya, jangan centang header). Akun Induk hanya untuk pengelompokan laporan &mdash; tidak bisa dipakai langsung untuk input jurnal.</p>
      <div id="msgBox"></div>
      <div id="editArea"></div>
      <table><thead><tr><th>Kode</th><th>Nama Account</th><th>Tipe</th><th>Induk</th><th>Kategori</th><th>Saldo Normal</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_account)}</td><td>${r.is_header ? '<strong>' + esc(r.nama_account) + '</strong>' : '&nbsp;&nbsp;&nbsp;' + esc(r.nama_account)}</td>
        <td><span class="badge ${r.is_header ? 'open' : 'posted'}">${r.is_header ? 'Induk' : 'Anak'}</span></td>
        <td>${esc(r.nama_induk || '-')}</td>
        <td>${esc(r.nama_kategori || r.kategori)}</td><td>${esc(r.saldo_normal)}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status}</span></td>
        <td>
          ${canEdit ? `<button class="btn secondary small" onclick="editCoaForm('${r.kode_account}')">Edit</button>` : ''}
          ${canDel ? `<button class="btn danger small" onclick="deleteCoa('${r.kode_account}')">Hapus</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      kode_account: document.getElementById('f_kode').value.trim(),
      nama_account: document.getElementById('f_nama').value.trim(),
      kategori: document.getElementById('f_kategori').value,
      saldo_normal: document.getElementById('f_saldo').value,
      parent_kode: document.getElementById('f_parent').value || null,
      is_header: document.getElementById('f_header').checked
    };
    try { await api('/coa', { method: 'POST', body: JSON.stringify(body) }); goPage('coa', 'Kode Account'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.editCoaForm = function (kode) {
  const r = coaListCache.find(x => x.kode_account === kode);
  if (!r) return;
  const area = document.getElementById('editArea');
  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h3 style="margin-top:0;">Edit Account: ${esc(r.kode_account)}</h3>
      <div class="form-grid">
        <div><label>Nama Account</label><input id="e_nama" value="${esc(r.nama_account)}"></div>
        <div><label>Kategori</label><select id="e_kategori">${categoryOptions(r.kategori)}</select></div>
        <div><label>Saldo Normal</label><select id="e_saldo"><option value="DEBIT" ${r.saldo_normal === 'DEBIT' ? 'selected' : ''}>DEBIT</option><option value="KREDIT" ${r.saldo_normal === 'KREDIT' ? 'selected' : ''}>KREDIT</option></select></div>
        <div><label>Akun Induk Dari</label><select id="e_parent">${parentAccountOptions(r.parent_kode)}</select></div>
        <div><label><input type="checkbox" id="e_header" ${r.is_header ? 'checked' : ''}> Jadikan Akun Induk (Header)</label></div>
        <div><label>Status</label><select id="e_status"><option value="AKTIF" ${r.status === 'AKTIF' ? 'selected' : ''}>AKTIF</option><option value="NONAKTIF" ${r.status !== 'AKTIF' ? 'selected' : ''}>NONAKTIF</option></select></div>
      </div>
      <div id="editMsg"></div>
      <button class="btn" id="btnSaveEdit">Simpan Perubahan</button>
      <button class="btn secondary" id="btnCancelEdit">Batal</button>
    </div>`;
  document.getElementById('btnCancelEdit').onclick = () => { area.innerHTML = ''; };
  document.getElementById('btnSaveEdit').onclick = async () => {
    const body = {
      nama_account: document.getElementById('e_nama').value.trim(),
      kategori: document.getElementById('e_kategori').value,
      saldo_normal: document.getElementById('e_saldo').value,
      parent_kode: document.getElementById('e_parent').value || null,
      is_header: document.getElementById('e_header').checked,
      status: document.getElementById('e_status').value
    };
    try {
      await api('/coa/' + kode, { method: 'PUT', body: JSON.stringify(body) });
      area.innerHTML = '';
      goPage('coa', 'Kode Account');
    } catch (e) { showMsg('editMsg', e.message, 'error'); }
  };
};
window.deleteCoa = async function (kode) {
  if (!confirm('Hapus account ini?')) return;
  try { await api('/coa/' + kode, { method: 'DELETE' }); goPage('coa', 'Kode Account'); } catch (e) { alert(e.message); }
};

// ---------------------- MASTER: KODE DEPARTMENT ----------------------
let deptListCache = [];
PAGES.dept = async function () {
  const rows = await api('/departments'); state.departments = rows; deptListCache = rows;
  const canAdd = hasPerm('MASTER_DEPT', 'add'), canDel = hasPerm('MASTER_DEPT', 'delete'), canEdit = hasPerm('MASTER_DEPT', 'edit');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Department</label><input id="f_kode" maxlength="20"></div>
        <div class="field"><label>Nama Department</label><input id="f_nama"></div>
        <button class="btn" id="btnAdd">+ Tambah Department</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <div id="editArea"></div>
      <table><thead><tr><th>Kode Department</th><th>Nama Department</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_department)}</td><td>${esc(r.nama_department)}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status === 'AKTIF' ? 'Aktif' : 'Non Aktif'}</span></td>
        <td>
          ${canEdit ? `<button class="btn secondary small" onclick="editDeptForm(${r.id})">Edit</button>` : ''}
          ${canDel ? `<button class="btn danger small" onclick="deleteDept(${r.id})">Hapus</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      kode_department: document.getElementById('f_kode').value.trim(),
      nama_department: document.getElementById('f_nama').value.trim()
    };
    try { await api('/departments', { method: 'POST', body: JSON.stringify(body) }); goPage('dept', 'Kode Department'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.editDeptForm = function (id) {
  const r = deptListCache.find(x => x.id === id);
  if (!r) return;
  const area = document.getElementById('editArea');
  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h3 style="margin-top:0;">Edit Department: ${esc(r.kode_department)}</h3>
      <div class="form-grid">
        <div><label>Nama Department</label><input id="e_nama" value="${esc(r.nama_department)}"></div>
        <div><label>Status</label><select id="e_status"><option value="AKTIF" ${r.status === 'AKTIF' ? 'selected' : ''}>Aktif</option><option value="NONAKTIF" ${r.status !== 'AKTIF' ? 'selected' : ''}>Non Aktif</option></select></div>
      </div>
      <div id="editMsg"></div>
      <button class="btn" id="btnSaveEdit">Simpan Perubahan</button>
      <button class="btn secondary" id="btnCancelEdit">Batal</button>
    </div>`;
  document.getElementById('btnCancelEdit').onclick = () => { area.innerHTML = ''; };
  document.getElementById('btnSaveEdit').onclick = async () => {
    const body = { nama_department: document.getElementById('e_nama').value.trim(), status: document.getElementById('e_status').value };
    try { await api('/departments/' + id, { method: 'PUT', body: JSON.stringify(body) }); area.innerHTML = ''; goPage('dept', 'Kode Department'); }
    catch (e) { showMsg('editMsg', e.message, 'error'); }
  };
};
window.deleteDept = async function (id) {
  if (!confirm('Hapus department ini?')) return;
  try { await api('/departments/' + id, { method: 'DELETE' }); goPage('dept', 'Kode Department'); } catch (e) { alert(e.message); }
};

// ---------------------- MASTER: SUB DEPARTMENT (Umum & NEQ) ----------------------
let subDeptListCache = [];
PAGES.subdept = async function () {
  const rows = await api('/subdepartments'); state.subdepartments = rows; subDeptListCache = rows;
  if (!state.departments.length) { try { state.departments = await api('/departments'); } catch (e) { /* ignore */ } }
  const canAdd = hasPerm('MASTER_SUBDEPT', 'add'), canDel = hasPerm('MASTER_SUBDEPT', 'delete'), canEdit = hasPerm('MASTER_SUBDEPT', 'edit');
  const deptSelectOptions = () => state.departments.filter(d => d.status === 'AKTIF').map(d => `<option value="${esc(d.kode_department)}">${esc(d.kode_department)} - ${esc(d.nama_department)}</option>`).join('');
  document.getElementById('content').innerHTML = `
    <div class="card">
      <p class="small-text">Sub Department wajib dikaitkan ke salah satu Kode Department yang sudah ada, dengan tipe Umum atau NEQ.</p>
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Sub Department</label><input id="f_kode" maxlength="20"></div>
        <div class="field"><label>Nama Sub Department</label><input id="f_nama"></div>
        <div class="field"><label>Kode Department</label><select id="f_dept">${deptSelectOptions()}</select></div>
        <div class="field"><label>Tipe</label><select id="f_tipe"><option value="UMUM">Umum</option><option value="NEQ">NEQ</option></select></div>
        <button class="btn" id="btnAdd">+ Tambah Sub Department</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <div id="editArea"></div>
      <table><thead><tr><th>Kode Sub Dept</th><th>Nama Sub Department</th><th>Kode Department</th><th>Tipe</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_sub_department)}</td><td>${esc(r.nama_sub_department)}</td>
        <td>${esc(r.kode_department)} - ${esc(r.nama_department)}</td>
        <td><span class="badge ${r.tipe === 'UMUM' ? 'posted' : 'open'}">${esc(r.tipe)}</span></td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status === 'AKTIF' ? 'Aktif' : 'Non Aktif'}</span></td>
        <td>
          ${canEdit ? `<button class="btn secondary small" onclick="editSubDeptForm('${r.kode_sub_department}')">Edit</button>` : ''}
          ${canDel ? `<button class="btn danger small" onclick="deleteSubDept('${r.kode_sub_department}')">Hapus</button>` : ''}
        </td>
      </tr>`).join('') || `<tr><td colspan="6" class="small-text center">Belum ada Sub Department. Pastikan Kode Department sudah dibuat terlebih dahulu.</td></tr>`}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      kode_sub_department: document.getElementById('f_kode').value.trim(),
      nama_sub_department: document.getElementById('f_nama').value.trim(),
      kode_department: document.getElementById('f_dept').value,
      tipe: document.getElementById('f_tipe').value
    };
    try { await api('/subdepartments', { method: 'POST', body: JSON.stringify(body) }); goPage('subdept', 'Sub Department'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.editSubDeptForm = function (kode) {
  const r = subDeptListCache.find(x => x.kode_sub_department === kode);
  if (!r) return;
  const area = document.getElementById('editArea');
  const deptSelectOptions = (selected) => state.departments.filter(d => d.status === 'AKTIF').map(d => `<option value="${esc(d.kode_department)}" ${d.kode_department === selected ? 'selected' : ''}>${esc(d.kode_department)} - ${esc(d.nama_department)}</option>`).join('');
  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h3 style="margin-top:0;">Edit Sub Department: ${esc(r.kode_sub_department)}</h3>
      <div class="form-grid">
        <div><label>Nama Sub Department</label><input id="e_nama" value="${esc(r.nama_sub_department)}"></div>
        <div><label>Kode Department</label><select id="e_dept">${deptSelectOptions(r.kode_department)}</select></div>
        <div><label>Tipe</label><select id="e_tipe"><option value="UMUM" ${r.tipe === 'UMUM' ? 'selected' : ''}>Umum</option><option value="NEQ" ${r.tipe === 'NEQ' ? 'selected' : ''}>NEQ</option></select></div>
        <div><label>Status</label><select id="e_status"><option value="AKTIF" ${r.status === 'AKTIF' ? 'selected' : ''}>Aktif</option><option value="NONAKTIF" ${r.status !== 'AKTIF' ? 'selected' : ''}>Non Aktif</option></select></div>
      </div>
      <div id="editMsg"></div>
      <button class="btn" id="btnSaveEdit">Simpan Perubahan</button>
      <button class="btn secondary" id="btnCancelEdit">Batal</button>
    </div>`;
  document.getElementById('btnCancelEdit').onclick = () => { area.innerHTML = ''; };
  document.getElementById('btnSaveEdit').onclick = async () => {
    const body = {
      nama_sub_department: document.getElementById('e_nama').value.trim(),
      kode_department: document.getElementById('e_dept').value,
      tipe: document.getElementById('e_tipe').value,
      status: document.getElementById('e_status').value
    };
    try { await api('/subdepartments/' + kode, { method: 'PUT', body: JSON.stringify(body) }); area.innerHTML = ''; goPage('subdept', 'Sub Department'); }
    catch (e) { showMsg('editMsg', e.message, 'error'); }
  };
};
window.deleteSubDept = async function (kode) {
  if (!confirm('Hapus sub department ini?')) return;
  try { await api('/subdepartments/' + kode, { method: 'DELETE' }); goPage('subdept', 'Sub Department'); } catch (e) { alert(e.message); }
};

// ---------------------- TRANSAKSI: JURNAL ----------------------
let jurnalRows = [];
PAGES.jurnal = async function () {
  const qs = state.activeCabang ? '?cabang_id=' + state.activeCabang : '';
  const list = await api('/journal' + qs);
  const canAdd = hasPerm('TRX_JURNAL', 'add');
  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="toolbar">
        ${canAdd ? `<button class="btn" id="btnNew">+ Buat Jurnal Baru</button>` : ''}
      </div>
      <div id="formArea"></div>
      <div id="msgBox"></div>
      <table><thead><tr><th>No Bukti</th><th>Tanggal</th><th>Cabang</th><th>Keterangan</th><th class="right">Debit</th><th class="right">Kredit</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td class="mono">${esc(r.no_bukti)}</td><td>${esc(r.tanggal)}</td><td>${esc(r.nama_cabang)}</td><td>${esc(r.keterangan || '')}</td>
        <td class="right">${fmtNum(r.total_debit)}</td><td class="right">${fmtNum(r.total_kredit)}</td>
        <td><span class="badge ${r.status === 'POSTED' ? 'posted' : 'draft'}">${r.status}</span></td>
        <td><button class="btn secondary small" onclick="viewJurnal('${r.no_bukti}')">Lihat</button></td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnNew').onclick = () => renderJurnalForm();
};

let currentJournalHeader = null;
function renderJurnalForm(existing) {
  jurnalRows = existing ? existing.details.map(d => ({ kode_account: d.kode_account, kode_department: d.kode_department || '', debit: d.debit, kredit: d.kredit, keterangan: d.keterangan || '', selected: false })) : [
    { kode_account: '', kode_department: '', debit: 0, kredit: 0, keterangan: '', selected: false },
    { kode_account: '', kode_department: '', debit: 0, kredit: 0, keterangan: '', selected: false }
  ];
  const h = existing ? existing.header : null;
  currentJournalHeader = h;
  const readOnly = h && h.status === 'POSTED';
  const area = document.getElementById('formArea');
  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h3 style="margin-top:0;">${h ? 'Detail Jurnal: ' + esc(h.no_bukti) : 'Input Jurnal Baru'}</h3>
      <div class="form-grid">
        <div><label>No Bukti (kosongkan untuk otomatis)</label><input id="j_nobukti" value="${h ? esc(h.no_bukti) : ''}" ${h ? 'disabled' : ''}></div>
        <div><label>Tanggal</label><input type="date" id="j_tanggal" value="${h ? h.tanggal : todayStr()}" ${readOnly ? 'disabled' : ''}></div>
        <div><label>Cabang</label><select id="j_cabang" ${h ? 'disabled' : ''}>${branchOptions(h ? h.cabang_id : state.activeCabang)}</select></div>
        <div><label>Keterangan</label><input id="j_ket" value="${h ? esc(h.keterangan || '') : ''}" ${readOnly ? 'disabled' : ''}></div>
      </div>
      <table id="jurnalDetailTable"><thead><tr>
        <th style="width:30px;">${!readOnly ? '<input type="checkbox" id="chkAll" onchange="toggleAllRows(this.checked)">' : ''}</th>
        <th>Kode Account</th><th>Department</th><th class="right">Debit</th><th class="right">Kredit</th><th>Keterangan</th><th></th>
      </tr></thead>
      <tbody id="jurnalDetailBody"></tbody>
      <tfoot><tr class="total-row"><td></td><td colspan="2">TOTAL</td><td class="right" id="totDebit">0</td><td class="right" id="totKredit">0</td><td colspan="2"></td></tr></tfoot>
      </table>
      <div style="margin-top:10px;display:flex;gap:8px;">
        ${!readOnly ? `<button class="btn secondary small" id="btnAddRow">+ Tambah Baris</button>` : ''}
        ${!readOnly ? `<button class="btn danger small" id="btnDeleteSelected">Hapus Baris Terpilih</button>` : ''}
      </div>
      <div id="formMsg"></div>
      <div id="actionButtonsArea" style="margin-top:14px;display:inline-block;"></div>
      <button class="btn secondary" id="btnCancel" style="margin-top:14px;">Tutup</button>
    </div>`;
  renderDetailRows(readOnly);
  if (!readOnly) document.getElementById('btnAddRow').onclick = () => { jurnalRows.push({ kode_account: '', kode_department: '', debit: 0, kredit: 0, keterangan: '', selected: false }); renderDetailRows(readOnly); };
  if (!readOnly) document.getElementById('btnDeleteSelected').onclick = () => deleteSelectedRows();
  if (!readOnly) document.getElementById('j_cabang').onchange = () => renderDetailRows(readOnly);
  document.getElementById('btnCancel').onclick = () => { area.innerHTML = ''; };
}

function updateActionButtons(h, readOnly) {
  const area = document.getElementById('actionButtonsArea');
  if (!area) return;
  if (readOnly) {
    area.innerHTML = hasPerm('TRX_BATALPOSTING', 'post') ? `<button class="btn danger" id="btnUnpost">Batal Posting</button>` : '';
    if (document.getElementById('btnUnpost')) document.getElementById('btnUnpost').onclick = () => unpostJurnal(h.no_bukti);
    return;
  }
  if (jurnalRows.length === 0 && h) {
    // Semua baris sudah dihapus dari No Bukti yang sudah tersimpan (masih DRAFT) - tawarkan hapus No Bukti sepenuhnya
    area.innerHTML = `<div class="msg error" style="margin-bottom:10px;">Semua baris jurnal sudah dihapus. Jurnal tidak bisa disimpan tanpa baris (minimal 2). Anda bisa menghapus No Bukti ini sepenuhnya.</div>
      ${hasPerm('TRX_JURNAL', 'delete') ? `<button class="btn danger" id="btnDeleteVoucher">Hapus No Bukti Ini</button>` : '<p class="small-text">Anda tidak memiliki hak akses untuk menghapus No Bukti.</p>'}`;
    if (document.getElementById('btnDeleteVoucher')) document.getElementById('btnDeleteVoucher').onclick = () => deleteVoucher(h.no_bukti);
  } else {
    area.innerHTML = `<button class="btn" id="btnSave">Simpan Draft</button>`;
    document.getElementById('btnSave').onclick = async () => {
      const body = {
        no_bukti: h ? h.no_bukti : document.getElementById('j_nobukti').value.trim(),
        tanggal: document.getElementById('j_tanggal').value,
        cabang_id: document.getElementById('j_cabang').value,
        keterangan: document.getElementById('j_ket').value,
        details: jurnalRows.filter(r => r.kode_account)
      };
      try {
        if (h) { await api('/journal/' + encodeURIComponent(h.no_bukti), { method: 'PUT', body: JSON.stringify(body) }); }
        else { await api('/journal', { method: 'POST', body: JSON.stringify(body) }); }
        document.getElementById('formArea').innerHTML = '';
        goPage('jurnal', 'Jurnal Transaksi');
      } catch (e) { showMsg('formMsg', e.message, 'error'); }
    };
  }
}

function renderDetailRows(readOnly) {
  const body = document.getElementById('jurnalDetailBody');
  body.innerHTML = jurnalRows.map((r, i) => `<tr>
    <td>${!readOnly ? `<input type="checkbox" ${r.selected ? 'checked' : ''} onchange="jurnalRows[${i}].selected=this.checked">` : ''}</td>
    <td><select onchange="jurnalRows[${i}].kode_account=this.value" ${readOnly ? 'disabled' : ''}><option value="">-- pilih --</option>${coaOptions(r.kode_account)}</select></td>
    <td><select onchange="jurnalRows[${i}].kode_department=this.value" ${readOnly ? 'disabled' : ''}>${deptOptions(r.kode_department)}</select></td>
    <td><input type="number" step="0.01" value="${r.debit || 0}" style="width:110px" onchange="handleAmountChange(${i}, 'debit', parseFloat(this.value)||0)" ${readOnly ? 'disabled' : ''}></td>
    <td><input type="number" step="0.01" value="${r.kredit || 0}" style="width:110px" onchange="handleAmountChange(${i}, 'kredit', parseFloat(this.value)||0)" ${readOnly ? 'disabled' : ''}></td>
    <td><input value="${esc(r.keterangan)}" onchange="handleKetChange(${i}, this.value)" ${readOnly ? 'disabled' : ''}></td>
    <td>${!readOnly ? `<button class="btn danger small" onclick="removeJurnalRow(${i})">x</button>` : ''}</td>
  </tr>`).join('');
  updateTotals();
  updateActionButtons(currentJournalHeader, readOnly);
}
window.toggleAllRows = function (checked) {
  jurnalRows.forEach(r => r.selected = checked);
  renderDetailRows(false);
};
window.deleteSelectedRows = function () {
  const toRemove = jurnalRows.map((r, i) => r.selected ? i : -1).filter(i => i !== -1);
  if (toRemove.length === 0) { alert('Pilih baris yang ingin dihapus terlebih dahulu (centang baris atau centang "pilih semua").'); return; }
  if (!confirm(`Hapus ${toRemove.length} baris terpilih?`)) return;
  toRemove.sort((a, b) => b - a).forEach(idx => {
    jurnalRows.splice(idx, 1);
    jurnalRows.forEach(r => {
      if (r.pairWith === idx) r.pairWith = null;
      else if (r.pairWith !== undefined && r.pairWith !== null && r.pairWith > idx) r.pairWith -= 1;
    });
  });
  renderDetailRows(false);
};
window.removeJurnalRow = function (i) {
  jurnalRows.splice(i, 1);
  // Perbaiki referensi pasangan (pairWith) karena index baris bergeser setelah penghapusan
  jurnalRows.forEach(r => {
    if (r.pairWith === i) r.pairWith = null;
    else if (r.pairWith !== undefined && r.pairWith !== null && r.pairWith > i) r.pairWith -= 1;
  });
  renderDetailRows(false);
};
window.deleteVoucher = async function (no_bukti) {
  if (!confirm(`Hapus No Bukti ${no_bukti} beserta seluruh datanya? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await api('/journal/' + encodeURIComponent(no_bukti), { method: 'DELETE' });
    document.getElementById('formArea').innerHTML = '';
    goPage('jurnal', 'Jurnal Transaksi');
  } catch (e) { alert(e.message); }
};
window.updateTotals = function () {
  const td = jurnalRows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const tk = jurnalRows.reduce((s, r) => s + (Number(r.kredit) || 0), 0);
  document.getElementById('totDebit').textContent = fmtNum(td);
  document.getElementById('totKredit').textContent = fmtNum(tk);
};
window.jurnalRows = jurnalRows;

// Sinkronkan nominal (sisi lawan) & keterangan antara dua baris yang berpasangan (debit <-> kredit)
function syncPairedRow(i) {
  const row = jurnalRows[i];
  if (row.pairWith === undefined || row.pairWith === null) return;
  const target = jurnalRows[row.pairWith];
  if (!target) return;
  if (row.debit > 0) target.kredit = row.debit;
  if (row.kredit > 0) target.debit = row.kredit;
  target.keterangan = row.keterangan;
}

// Ketika salah satu sisi (debit/kredit) diisi, otomatis pasangkan dengan baris kosong lain
// supaya jurnal cepat balance tanpa mengetik dua kali, dan keterangan ikut tersinkron.
window.handleAmountChange = function (i, field, value) {
  jurnalRows[i][field] = value;
  if (jurnalRows[i].pairWith === undefined || jurnalRows[i].pairWith === null) {
    if (value > 0) {
      const isFree = j => !jurnalRows[j].debit && !jurnalRows[j].kredit && (jurnalRows[j].pairWith === undefined || jurnalRows[j].pairWith === null);
      let target = -1;
      for (let j = i + 1; j < jurnalRows.length; j++) { if (isFree(j)) { target = j; break; } }
      if (target === -1) { for (let j = 0; j < jurnalRows.length; j++) { if (j !== i && isFree(j)) { target = j; break; } } }
      if (target !== -1) { jurnalRows[i].pairWith = target; jurnalRows[target].pairWith = i; }
    }
  }
  syncPairedRow(i);
  renderDetailRows(false);
};
window.handleKetChange = function (i, value) {
  jurnalRows[i].keterangan = value;
  syncPairedRow(i);
  renderDetailRows(false);
};

window.viewJurnal = async function (no_bukti) {
  try {
    const data = await api('/journal/' + encodeURIComponent(no_bukti));
    document.getElementById('formArea') ? null : (document.getElementById('content').querySelector('.card').insertAdjacentHTML('afterbegin', '<div id="formArea"></div>'));
    renderJurnalForm(data);
  } catch (e) { alert(e.message); }
};


// ---------------------- TRANSAKSI: POSTING ----------------------
PAGES.posting = async function () {
  const qs = state.activeCabang ? '&cabang_id=' + state.activeCabang : '';
  const drafts = (await api('/journal?status=DRAFT' + qs));
  const canPost = hasPerm('TRX_POSTING', 'post');
  document.getElementById('content').innerHTML = `
    <div class="card">
      <p class="small-text">Daftar jurnal berstatus DRAFT yang siap diposting.</p>
      <div id="msgBox"></div>
      <table><thead><tr><th>No Bukti</th><th>Tanggal</th><th>Cabang</th><th>Keterangan</th><th class="right">Debit</th><th class="right">Kredit</th><th></th></tr></thead>
      <tbody>${drafts.map(r => `<tr>
        <td class="mono">${esc(r.no_bukti)}</td><td>${esc(r.tanggal)}</td><td>${esc(r.nama_cabang)}</td><td>${esc(r.keterangan || '')}</td>
        <td class="right">${fmtNum(r.total_debit)}</td><td class="right">${fmtNum(r.total_kredit)}</td>
        <td>${canPost ? `<button class="btn success small" onclick="postJurnal('${r.no_bukti}')">Posting</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="7" class="center small-text">Tidak ada jurnal draft.</td></tr>`}</tbody></table>
    </div>`;
};
window.postJurnal = async function (no_bukti) {
  if (!confirm(`Posting jurnal ${no_bukti}? Setelah diposting, jurnal tidak dapat diubah.`)) return;
  try { await api(`/journal/${encodeURIComponent(no_bukti)}/post`, { method: 'POST' }); goPage('posting', 'Posting Transaksi'); }
  catch (e) { alert(e.message); }
};

// ---------------------- TRANSAKSI: BATAL POSTING ----------------------
PAGES.batalposting = async function () {
  const qs = state.activeCabang ? '&cabang_id=' + state.activeCabang : '';
  const posted = (await api('/journal?status=POSTED' + qs));
  const canUnpost = hasPerm('TRX_BATALPOSTING', 'post');
  document.getElementById('content').innerHTML = `
    <div class="card">
      <p class="small-text">Daftar jurnal berstatus POSTED. Batal posting akan mengembalikan jurnal ke status DRAFT sehingga bisa diedit kembali.</p>
      <div id="msgBox"></div>
      <table><thead><tr><th>No Bukti</th><th>Tanggal</th><th>Cabang</th><th>Keterangan</th><th class="right">Debit</th><th class="right">Kredit</th><th></th></tr></thead>
      <tbody>${posted.map(r => `<tr>
        <td class="mono">${esc(r.no_bukti)}</td><td>${esc(r.tanggal)}</td><td>${esc(r.nama_cabang)}</td><td>${esc(r.keterangan || '')}</td>
        <td class="right">${fmtNum(r.total_debit)}</td><td class="right">${fmtNum(r.total_kredit)}</td>
        <td>${canUnpost ? `<button class="btn danger small" onclick="unpostJurnal('${r.no_bukti}')">Batal Posting</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="7" class="center small-text">Tidak ada jurnal terposting.</td></tr>`}</tbody></table>
    </div>`;
};
window.unpostJurnal = async function (no_bukti) {
  if (!confirm(`Batalkan posting jurnal ${no_bukti}? Jurnal akan kembali berstatus DRAFT dan bisa diedit lagi.`)) return;
  try {
    await api(`/journal/${encodeURIComponent(no_bukti)}/unpost`, { method: 'POST' });
    goPage(state.currentPage === 'jurnal' ? 'jurnal' : 'batalposting', state.currentPage === 'jurnal' ? 'Jurnal Transaksi' : 'Batal Posting');
  } catch (e) { alert(e.message); }
};

// ---------------------- TRANSAKSI: TUTUP BUKU ----------------------
PAGES.tutupbuku = async function () {
  const closings = await api('/closing');
  const canPost = hasPerm('TRX_TUTUPBUKU', 'post');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canPost ? `<div class="toolbar">
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchOptions(state.activeCabang)}</select></div>
        <div class="field"><label>Periode (Tahun-Bulan)</label><input type="month" id="f_periode" value="${todayStr().slice(0,7)}"></div>
        <button class="btn" id="btnTutup">Tutup Buku</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <table><thead><tr><th>Cabang</th><th>Periode</th><th>Status</th><th>Ditutup Oleh / Waktu</th></tr></thead>
      <tbody>${closings.map(r => `<tr>
        <td>${esc(r.nama_cabang)}</td><td>${esc(r.periode)}</td>
        <td><span class="badge ${r.status === 'CLOSED' ? 'closed' : 'open'}">${r.status}</span></td>
        <td class="small-text">${r.closed_at ? esc(r.closed_at) : '-'}</td>
      </tr>`).join('') || `<tr><td colspan="4" class="center small-text">Belum ada periode ditutup.</td></tr>`}</tbody></table>
    </div>`;
  if (canPost) document.getElementById('btnTutup').onclick = async () => {
    const body = { cabang_id: document.getElementById('f_cabang').value, periode: document.getElementById('f_periode').value };
    try { await api('/closing/tutup', { method: 'POST', body: JSON.stringify(body) }); goPage('tutupbuku', 'Tutup Buku'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};

// ---------------------- TRANSAKSI: BATAL TUTUP BUKU ----------------------
PAGES.batalttutupbuku = async function () {
  const closings = (await api('/closing')).filter(c => c.status === 'CLOSED');
  const canPost = hasPerm('TRX_BATALTUTUPBUKU', 'post');
  document.getElementById('content').innerHTML = `
    <div class="card">
      <div id="msgBox"></div>
      <table><thead><tr><th>Cabang</th><th>Periode</th><th>Status</th><th>Ditutup Oleh / Waktu</th><th></th></tr></thead>
      <tbody>${closings.map(r => `<tr>
        <td>${esc(r.nama_cabang)}</td><td>${esc(r.periode)}</td>
        <td><span class="badge closed">${r.status}</span></td>
        <td class="small-text">${r.closed_at ? esc(r.closed_at) : '-'}</td>
        <td>${canPost ? `<button class="btn danger small" onclick="batalTutup(${r.cabang_id},'${r.periode}')">Batal Tutup Buku</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="5" class="center small-text">Tidak ada periode tertutup.</td></tr>`}</tbody></table>
    </div>`;
};
window.batalTutup = async function (cabang_id, periode) {
  if (!confirm(`Batalkan tutup buku periode ${periode}?`)) return;
  try { await api('/closing/batal', { method: 'POST', body: JSON.stringify({ cabang_id, periode }) }); goPage('batalttutupbuku', 'Batal Tutup Buku'); }
  catch (e) { alert(e.message); }
};

// ---------------------- LAPORAN: NERACA ----------------------
PAGES.neraca = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchFilterOptions()}</select></div>
        <div class="field"><label>Per Tanggal</label><input type="date" id="f_tanggal" value="${todayStr()}"></div>
        <button class="btn" id="btnRun">Tampilkan</button>
      </div>
      <div id="reportArea"></div>
    </div>`;
  document.getElementById('btnRun').onclick = async () => {
    const cabang_id = document.getElementById('f_cabang').value;
    const sampai = document.getElementById('f_tanggal').value;
    const qs = new URLSearchParams({ sampai }); if (cabang_id) qs.set('cabang_id', cabang_id);
    const data = await api('/reports/neraca?' + qs.toString());
    const section = (title, arr) => `<h4>${title}</h4><table><tbody>${arr.map(a => `<tr><td class="mono">${esc(a.kode_account)}</td><td>${esc(a.nama_account)}</td><td class="right">${fmtNum(a.saldo)}</td></tr>`).join('') || '<tr><td colspan="3" class="small-text">Tidak ada data</td></tr>'}</tbody></table>`;
    document.getElementById('reportArea').innerHTML = `
      <div class="msg ${data.balance ? 'success' : 'error'}">${data.balance ? 'Neraca BALANCE' : 'Neraca TIDAK BALANCE - periksa kembali data jurnal'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>${section('ASET (Total: ' + fmtNum(data.totalAset) + ')', data.data.ASET)}</div>
        <div>${section('KEWAJIBAN (Total: ' + fmtNum(data.totalKewajiban) + ')', data.data.KEWAJIBAN)}
             ${section('MODAL (Total: ' + fmtNum(data.totalModal) + ')', data.data.MODAL)}</div>
      </div>`;
  };
  document.getElementById('btnRun').click();
};

// ---------------------- LAPORAN: LABA RUGI ----------------------
PAGES.labarugi = async function () {
  const content = document.getElementById('content');
  const firstDay = todayStr().slice(0, 8) + '01';
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchFilterOptions()}</select></div>
        <div class="field"><label>Dari Tanggal</label><input type="date" id="f_dari" value="${firstDay}"></div>
        <div class="field"><label>Sampai Tanggal</label><input type="date" id="f_sampai" value="${todayStr()}"></div>
        <button class="btn" id="btnRun">Tampilkan</button>
      </div>
      <div id="reportArea"></div>
    </div>`;
  document.getElementById('btnRun').onclick = async () => {
    const cabang_id = document.getElementById('f_cabang').value;
    const dari = document.getElementById('f_dari').value, sampai = document.getElementById('f_sampai').value;
    const qs = new URLSearchParams({ dari, sampai }); if (cabang_id) qs.set('cabang_id', cabang_id);
    const data = await api('/reports/laba-rugi?' + qs.toString());
    document.getElementById('reportArea').innerHTML = `
      <h4>Pendapatan (Total: ${fmtNum(data.totalPendapatan)})</h4>
      <table><tbody>${data.pendapatan.map(a => `<tr><td class="mono">${esc(a.kode_account)}</td><td>${esc(a.nama_account)}</td><td class="right">${fmtNum(a.saldo)}</td></tr>`).join('') || '<tr><td colspan="3" class="small-text">Tidak ada data</td></tr>'}</tbody></table>
      <h4>Beban (Total: ${fmtNum(data.totalBeban)})</h4>
      <table><tbody>${data.beban.map(a => `<tr><td class="mono">${esc(a.kode_account)}</td><td>${esc(a.nama_account)}</td><td class="right">${fmtNum(a.saldo)}</td></tr>`).join('') || '<tr><td colspan="3" class="small-text">Tidak ada data</td></tr>'}</tbody></table>
      <div class="msg ${data.labaRugi >= 0 ? 'success' : 'error'}">Laba/Rugi Bersih: ${fmtNum(data.labaRugi)}</div>`;
  };
  document.getElementById('btnRun').click();
};

// ---------------------- LAPORAN: TRANSAKSI HARIAN ----------------------
PAGES.harian = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchFilterOptions()}</select></div>
        <div class="field"><label>Tanggal</label><input type="date" id="f_tanggal" value="${todayStr()}"></div>
        <div class="field"><label>Status</label><select id="f_status"><option value="">Semua</option><option value="DRAFT">DRAFT</option><option value="POSTED">POSTED</option></select></div>
        <button class="btn" id="btnRun">Tampilkan</button>
      </div>
      <div id="reportArea"></div>
    </div>`;
  document.getElementById('btnRun').onclick = async () => {
    const cabang_id = document.getElementById('f_cabang').value;
    const tanggal = document.getElementById('f_tanggal').value, status = document.getElementById('f_status').value;
    const qs = new URLSearchParams({ tanggal }); if (cabang_id) qs.set('cabang_id', cabang_id); if (status) qs.set('status', status);
    const data = await api('/reports/harian?' + qs.toString());
    document.getElementById('reportArea').innerHTML = `
      <table><thead><tr><th>No Bukti</th><th>Cabang</th><th>Kode Account</th><th>Nama Account</th><th>Dept</th><th class="right">Debit</th><th class="right">Kredit</th><th>Status</th></tr></thead>
      <tbody>${data.rows.map(r => `<tr>
        <td class="mono">${esc(r.no_bukti)}</td><td>${esc(r.nama_cabang)}</td><td class="mono">${esc(r.kode_account)}</td><td>${esc(r.nama_account)}</td>
        <td>${esc(r.kode_department || '')}</td><td class="right">${fmtNum(r.debit)}</td><td class="right">${fmtNum(r.kredit)}</td>
        <td><span class="badge ${r.status === 'POSTED' ? 'posted' : 'draft'}">${r.status}</span></td>
      </tr>`).join('') || '<tr><td colspan="8" class="small-text center">Tidak ada transaksi.</td></tr>'}</tbody>
      <tfoot><tr class="total-row"><td colspan="5">TOTAL</td><td class="right">${fmtNum(data.totalDebit)}</td><td class="right">${fmtNum(data.totalKredit)}</td><td></td></tr></tfoot>
      </table>`;
  };
  document.getElementById('btnRun').click();
};

// ---------------------- LAPORAN: PREDIKSI LABA RUGI (AI) ----------------------
PAGES.prediksi = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchFilterOptions()}</select></div>
        <div class="field"><label>Jumlah Bulan Riwayat</label>
          <select id="f_bulan"><option value="3">3 Bulan</option><option value="6" selected>6 Bulan</option><option value="9">9 Bulan</option><option value="12">12 Bulan</option></select>
        </div>
        <button class="btn" id="btnRun">Buat Prediksi</button>
      </div>
      <p class="small-text">Prediksi dibuat otomatis dari analisis tren data Laba Rugi yang sudah terposting (regresi linear). Semakin banyak riwayat bulan yang tersedia, semakin akurat hasilnya. Hasil ini estimasi, bukan jaminan aktual di masa depan.</p>
      <div id="reportArea"></div>
    </div>`;
  document.getElementById('btnRun').onclick = async () => {
    const cabang_id = document.getElementById('f_cabang').value;
    const bulan = document.getElementById('f_bulan').value;
    const qs = new URLSearchParams({ bulan }); if (cabang_id) qs.set('cabang_id', cabang_id);
    const data = await api('/reports/prediksi-laba-rugi?' + qs.toString());
    const area = document.getElementById('reportArea');
    if (data.message) { area.innerHTML = `<div class="msg error">${esc(data.message)}</div>`; return; }
    const monthCols = data.historyMonths.map(m => `<th class="right">${esc(m)}</th>`).join('');
    const rowHtml = (item) => `<tr><td class="mono">${esc(item.kode_account)}</td><td>${esc(item.nama_account)}</td>
      ${item.history.map(v => `<td class="right">${fmtNum(v)}</td>`).join('')}
      <td class="right" style="background:#eef6ff;font-weight:600;">${fmtNum(item.prediksi)}</td></tr>`;
    area.innerHTML = `
      <div class="msg success">Prediksi untuk periode <strong>${esc(data.nextPeriod)}</strong> — metode: ${esc(data.method)}</div>
      <h4>Pendapatan</h4>
      <table><thead><tr><th>Kode</th><th>Nama Account</th>${monthCols}<th class="right" style="background:#dbeafe;">Prediksi ${esc(data.nextPeriod)}</th></tr></thead>
      <tbody>${data.pendapatan.map(rowHtml).join('') || '<tr><td colspan="' + (3 + data.historyMonths.length) + '" class="small-text">Tidak ada data</td></tr>'}
      <tr class="total-row"><td colspan="2">TOTAL PENDAPATAN</td>
        ${data.totalPendapatanHistory.map(v => `<td class="right">${fmtNum(v)}</td>`).join('')}
        <td class="right" style="background:#dbeafe;">${fmtNum(data.totalPendapatanPrediksi)}</td></tr>
      </tbody></table>
      <h4 style="margin-top:20px;">Beban</h4>
      <table><thead><tr><th>Kode</th><th>Nama Account</th>${monthCols}<th class="right" style="background:#dbeafe;">Prediksi ${esc(data.nextPeriod)}</th></tr></thead>
      <tbody>${data.beban.map(rowHtml).join('') || '<tr><td colspan="' + (3 + data.historyMonths.length) + '" class="small-text">Tidak ada data</td></tr>'}
      <tr class="total-row"><td colspan="2">TOTAL BEBAN</td>
        ${data.totalBebanHistory.map(v => `<td class="right">${fmtNum(v)}</td>`).join('')}
        <td class="right" style="background:#dbeafe;">${fmtNum(data.totalBebanPrediksi)}</td></tr>
      </tbody></table>
      <div class="msg ${data.labaRugiPrediksi >= 0 ? 'success' : 'error'}" style="margin-top:16px;font-size:15px;">
        Prediksi Laba/Rugi Bersih ${esc(data.nextPeriod)}: <strong>${fmtNum(data.labaRugiPrediksi)}</strong>
      </div>`;
  };
  document.getElementById('btnRun').click();
};

// ---------------------- SETTING: USER ----------------------
let userListCache = [], roleListCache = [];
PAGES.user = async function () {
  const list = await api('/users'); userListCache = list;
  const roles = await api('/roles').catch(() => []); roleListCache = roles;
  const canAdd = hasPerm('SET_USER', 'add'), canDel = hasPerm('SET_USER', 'delete'), canEdit = hasPerm('SET_USER', 'edit');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Username</label><input id="f_user"></div>
        <div class="field"><label>Password</label><input type="password" id="f_pass"></div>
        <div class="field"><label>Nama Lengkap</label><input id="f_nama"></div>
        <div class="field"><label>Role</label><select id="f_role">${roles.map(r => `<option value="${r.id}">${esc(r.nama_role)}</option>`).join('')}</select></div>
        <div class="field"><label>Cabang</label><select id="f_cabang"><option value="">-</option>${branchOptions()}</select></div>
        <div class="field"><label><input type="checkbox" id="f_allbranch"> Akses Semua Cabang</label></div>
        <button class="btn" id="btnAdd">+ Tambah User</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <div id="editArea"></div>
      <table><thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Cabang</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td class="mono">${esc(r.username)}</td><td>${esc(r.nama_lengkap || '')}</td><td>${esc(r.nama_role)}</td>
        <td>${r.akses_semua_cabang ? 'Semua Cabang' : esc(r.nama_cabang || '-')}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status}</span></td>
        <td>
          ${canEdit ? `<button class="btn secondary small" onclick="editUserForm(${r.id})">Edit</button>` : ''}
          ${canDel ? `<button class="btn danger small" onclick="deleteUser(${r.id})">Hapus</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      username: document.getElementById('f_user').value.trim(),
      password: document.getElementById('f_pass').value,
      nama_lengkap: document.getElementById('f_nama').value.trim(),
      role_id: document.getElementById('f_role').value,
      cabang_id: document.getElementById('f_cabang').value || null,
      akses_semua_cabang: document.getElementById('f_allbranch').checked
    };
    try { await api('/users', { method: 'POST', body: JSON.stringify(body) }); goPage('user', 'Pembuatan User'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.editUserForm = function (id) {
  const u = userListCache.find(x => x.id === id);
  if (!u) return;
  const area = document.getElementById('editArea');
  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h3 style="margin-top:0;">Edit User: ${esc(u.username)}</h3>
      <div class="form-grid">
        <div><label>Nama Lengkap</label><input id="e_nama" value="${esc(u.nama_lengkap || '')}"></div>
        <div><label>Password Baru (kosongkan jika tidak diganti)</label><input type="password" id="e_pass"></div>
        <div><label>Role</label><select id="e_role">${roleListCache.map(r => `<option value="${r.id}" ${r.id === u.role_id ? 'selected' : ''}>${esc(r.nama_role)}</option>`).join('')}</select></div>
        <div><label>Cabang</label><select id="e_cabang"><option value="">-</option>${branchOptions(u.cabang_id)}</select></div>
        <div><label><input type="checkbox" id="e_allbranch" ${u.akses_semua_cabang ? 'checked' : ''}> Akses Semua Cabang</label></div>
        <div><label>Status</label><select id="e_status"><option value="AKTIF" ${u.status === 'AKTIF' ? 'selected' : ''}>AKTIF</option><option value="NONAKTIF" ${u.status !== 'AKTIF' ? 'selected' : ''}>NONAKTIF</option></select></div>
      </div>
      <div id="editMsg"></div>
      <button class="btn" id="btnSaveEdit">Simpan Perubahan</button>
      <button class="btn secondary" id="btnCancelEdit">Batal</button>
    </div>`;
  document.getElementById('btnCancelEdit').onclick = () => { area.innerHTML = ''; };
  document.getElementById('btnSaveEdit').onclick = async () => {
    const body = {
      nama_lengkap: document.getElementById('e_nama').value.trim(),
      role_id: document.getElementById('e_role').value,
      cabang_id: document.getElementById('e_cabang').value || null,
      akses_semua_cabang: document.getElementById('e_allbranch').checked,
      status: document.getElementById('e_status').value
    };
    const pass = document.getElementById('e_pass').value;
    if (pass) body.password = pass;
    try {
      await api('/users/' + id, { method: 'PUT', body: JSON.stringify(body) });
      area.innerHTML = '';
      goPage('user', 'Pembuatan User');
    } catch (e) { showMsg('editMsg', e.message, 'error'); }
  };
};
window.deleteUser = async function (id) {
  if (!confirm('Hapus user ini?')) return;
  try { await api('/users/' + id, { method: 'DELETE' }); goPage('user', 'Pembuatan User'); } catch (e) { alert(e.message); }
};

// ---------------------- SETTING: HAK AKSES ----------------------
PAGES.hakakses = async function () {
  const roles = await api('/roles');
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="field"><label>Role</label><select id="f_role">${roles.map(r => `<option value="${r.id}">${esc(r.nama_role)}</option>`).join('')}</select></div>
        <button class="btn secondary" id="btnNewRole">+ Role Baru</button>
      </div>
      <div id="msgBox"></div>
      <div id="permArea"></div>
    </div>`;
  const loadPerms = async () => {
    const roleId = document.getElementById('f_role').value;
    const perms = await api(`/roles/${roleId}/permissions`);
    const groups = {};
    perms.forEach(p => { (groups[p.grup_menu] = groups[p.grup_menu] || []).push(p); });
    let html = `<table class="perm-table"><thead><tr><th>Menu</th><th>Lihat</th><th>Tambah</th><th>Edit</th><th>Hapus</th><th>Posting</th></tr></thead><tbody>`;
    Object.keys(groups).forEach(g => {
      html += `<tr><td colspan="6" style="background:#eef2f8;font-weight:600;">${esc(g)}</td></tr>`;
      groups[g].forEach(p => {
        html += `<tr data-kode="${p.kode_menu}">
          <td>${esc(p.nama_menu)}</td>
          <td><input type="checkbox" class="pv" ${p.can_view ? 'checked' : ''}></td>
          <td><input type="checkbox" class="pa" ${p.can_add ? 'checked' : ''}></td>
          <td><input type="checkbox" class="pe" ${p.can_edit ? 'checked' : ''}></td>
          <td><input type="checkbox" class="pd" ${p.can_delete ? 'checked' : ''}></td>
          <td><input type="checkbox" class="pp" ${p.can_post ? 'checked' : ''}></td>
        </tr>`;
      });
    });
    html += `</tbody></table><button class="btn" id="btnSavePerm" style="margin-top:12px;">Simpan Hak Akses</button>`;
    document.getElementById('permArea').innerHTML = html;
    document.getElementById('btnSavePerm').onclick = async () => {
      const rows = Array.from(document.querySelectorAll('#permArea tr[data-kode]')).map(tr => ({
        kode_menu: tr.dataset.kode,
        can_view: tr.querySelector('.pv').checked,
        can_add: tr.querySelector('.pa').checked,
        can_edit: tr.querySelector('.pe').checked,
        can_delete: tr.querySelector('.pd').checked,
        can_post: tr.querySelector('.pp').checked
      }));
      try {
        await api(`/roles/${roleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: rows }) });
        showMsg('msgBox', 'Hak akses berhasil disimpan.', 'success');
      } catch (e) { showMsg('msgBox', e.message, 'error'); }
    };
  };
  document.getElementById('f_role').onchange = loadPerms;
  document.getElementById('btnNewRole').onclick = async () => {
    const nama = prompt('Nama role baru (contoh: SUPERVISOR):');
    if (!nama) return;
    try { await api('/roles', { method: 'POST', body: JSON.stringify({ nama_role: nama }) }); goPage('hakakses', 'Hak Akses User'); }
    catch (e) { alert(e.message); }
  };
  loadPerms();
};

// ---------------------- UTIL ----------------------
function showMsg(elId, text, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<div class="msg ${type}">${esc(text)}</div>`;
}

// ---------------------- AUTO LOGIN IF TOKEN EXISTS ----------------------
(async function init() {
  if (state.token && state.user) {
    try { await bootApp(); } catch (e) { localStorage.clear(); location.reload(); }
  }
})();
