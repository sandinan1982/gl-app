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
  departments: [],
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
    { kode: 'MASTER_COA', label: 'Kode Account', page: 'coa' },
    { kode: 'MASTER_DEPT', label: 'Kode Department', page: 'dept' }
  ]},
  { group: 'Transaksi', items: [
    { kode: 'TRX_JURNAL', label: 'Jurnal Transaksi', page: 'jurnal' },
    { kode: 'TRX_POSTING', label: 'Posting Transaksi', page: 'posting' },
    { kode: 'TRX_TUTUPBUKU', label: 'Tutup Buku', page: 'tutupbuku' },
    { kode: 'TRX_BATALTUTUPBUKU', label: 'Batal Tutup Buku', page: 'batalttutupbuku' }
  ]},
  { group: 'Laporan', items: [
    { kode: 'LAP_NERACA', label: 'Laporan Neraca', page: 'neraca' },
    { kode: 'LAP_LABARUGI', label: 'Laporan Laba Rugi', page: 'labarugi' },
    { kode: 'LAP_HARIAN', label: 'Laporan Transaksi Harian', page: 'harian' }
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
  try { state.coa = await api('/coa'); } catch (e) { state.coa = []; }
  try { state.departments = await api('/departments'); } catch (e) { state.departments = []; }
  const first = MENU_STRUCTURE.flatMap(g => g.items).find(i => hasPerm(i.kode, 'view'));
  if (first) goPage(first.page, first.label);
  else document.getElementById('content').innerHTML = '<div class="msg error">Anda tidak memiliki akses menu apapun.</div>';
}

function branchOptions(selected) {
  return state.branches.map(b => `<option value="${b.id}" ${String(b.id) === String(selected) ? 'selected' : ''}>${esc(b.kode_cabang)} - ${esc(b.nama_cabang)}</option>`).join('');
}
function coaOptions(selected) {
  return state.coa.filter(c => c.status === 'AKTIF').map(c => `<option value="${c.kode_account}" ${c.kode_account === selected ? 'selected' : ''}>${esc(c.kode_account)} - ${esc(c.nama_account)}</option>`).join('');
}
function deptOptions(cabangId, selected) {
  const list = state.departments.filter(d => d.status === 'AKTIF' && String(d.cabang_id) === String(cabangId));
  return '<option value="">-- tanpa department --</option>' +
    list.map(d => `<option value="${esc(d.kode_department)}" ${d.kode_department === selected ? 'selected' : ''}>${esc(d.kode_department)} - ${esc(d.nama_department)}</option>`).join('');
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

// ---------------------- MASTER: COA ----------------------
PAGES.coa = async function () {
  const rows = await api('/coa'); state.coa = rows;
  const canAdd = hasPerm('MASTER_COA', 'add'), canDel = hasPerm('MASTER_COA', 'delete');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Account</label><input id="f_kode" maxlength="20"></div>
        <div class="field"><label>Nama Account</label><input id="f_nama"></div>
        <div class="field"><label>Kategori</label>
          <select id="f_kategori"><option value="ASET">ASET</option><option value="KEWAJIBAN">KEWAJIBAN</option>
          <option value="MODAL">MODAL</option><option value="PENDAPATAN">PENDAPATAN</option><option value="BEBAN">BEBAN</option></select></div>
        <div class="field"><label>Saldo Normal</label><select id="f_saldo"><option value="DEBIT">DEBIT</option><option value="KREDIT">KREDIT</option></select></div>
        <button class="btn" id="btnAdd">+ Tambah Account</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <table><thead><tr><th>Kode</th><th>Nama Account</th><th>Kategori</th><th>Saldo Normal</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_account)}</td><td>${esc(r.nama_account)}</td><td>${esc(r.kategori)}</td><td>${esc(r.saldo_normal)}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status}</span></td>
        <td>${canDel ? `<button class="btn danger small" onclick="deleteCoa('${r.kode_account}')">Hapus</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      kode_account: document.getElementById('f_kode').value.trim(),
      nama_account: document.getElementById('f_nama').value.trim(),
      kategori: document.getElementById('f_kategori').value,
      saldo_normal: document.getElementById('f_saldo').value
    };
    try { await api('/coa', { method: 'POST', body: JSON.stringify(body) }); goPage('coa', 'Kode Account'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.deleteCoa = async function (kode) {
  if (!confirm('Hapus account ini?')) return;
  try { await api('/coa/' + kode, { method: 'DELETE' }); goPage('coa', 'Kode Account'); } catch (e) { alert(e.message); }
};

// ---------------------- MASTER: DEPARTMENT ----------------------
PAGES.dept = async function () {
  const rows = await api('/departments');
  const canAdd = hasPerm('MASTER_DEPT', 'add'), canDel = hasPerm('MASTER_DEPT', 'delete');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canAdd ? `<div class="toolbar">
        <div class="field"><label>Kode Dept</label><input id="f_kode" maxlength="10"></div>
        <div class="field"><label>Nama Department</label><input id="f_nama"></div>
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchOptions()}</select></div>
        <button class="btn" id="btnAdd">+ Tambah Department</button>
      </div>` : ''}
      <div id="msgBox"></div>
      <table><thead><tr><th>Kode</th><th>Nama Department</th><th>Cabang</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="mono">${esc(r.kode_department)}</td><td>${esc(r.nama_department)}</td><td>${esc(r.nama_cabang)}</td>
        <td><span class="badge ${r.status === 'AKTIF' ? 'posted' : 'closed'}">${r.status}</span></td>
        <td>${canDel ? `<button class="btn danger small" onclick="deleteDept(${r.id})">Hapus</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  if (canAdd) document.getElementById('btnAdd').onclick = async () => {
    const body = {
      kode_department: document.getElementById('f_kode').value.trim(),
      nama_department: document.getElementById('f_nama').value.trim(),
      cabang_id: document.getElementById('f_cabang').value
    };
    try { await api('/departments', { method: 'POST', body: JSON.stringify(body) }); goPage('dept', 'Kode Department'); }
    catch (e) { showMsg('msgBox', e.message, 'error'); }
  };
};
window.deleteDept = async function (id) {
  if (!confirm('Hapus department ini?')) return;
  try { await api('/departments/' + id, { method: 'DELETE' }); goPage('dept', 'Kode Department'); } catch (e) { alert(e.message); }
};

// ---------------------- TRANSAKSI: JURNAL ----------------------
let jurnalRows = [];
PAGES.jurnal = async function () {
  const list = await api('/journal');
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

function renderJurnalForm(existing) {
  jurnalRows = existing ? existing.details.map(d => ({ kode_account: d.kode_account, kode_department: d.kode_department || '', debit: d.debit, kredit: d.kredit, keterangan: d.keterangan || '' })) : [
    { kode_account: '', kode_department: '', debit: 0, kredit: 0, keterangan: '' },
    { kode_account: '', kode_department: '', debit: 0, kredit: 0, keterangan: '' }
  ];
  const h = existing ? existing.header : null;
  const readOnly = h && h.status === 'POSTED';
  const area = document.getElementById('formArea');
  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h3 style="margin-top:0;">${h ? 'Detail Jurnal: ' + esc(h.no_bukti) : 'Input Jurnal Baru'}</h3>
      <div class="form-grid">
        <div><label>No Bukti (kosongkan untuk otomatis)</label><input id="j_nobukti" value="${h ? esc(h.no_bukti) : ''}" ${h ? 'disabled' : ''}></div>
        <div><label>Tanggal</label><input type="date" id="j_tanggal" value="${h ? h.tanggal : todayStr()}" ${readOnly ? 'disabled' : ''}></div>
        <div><label>Cabang</label><select id="j_cabang" ${h ? 'disabled' : ''}>${branchOptions(h ? h.cabang_id : null)}</select></div>
        <div><label>Keterangan</label><input id="j_ket" value="${h ? esc(h.keterangan || '') : ''}" ${readOnly ? 'disabled' : ''}></div>
      </div>
      <table id="jurnalDetailTable"><thead><tr><th>Kode Account</th><th>Department</th><th class="right">Debit</th><th class="right">Kredit</th><th>Keterangan</th><th></th></tr></thead>
      <tbody id="jurnalDetailBody"></tbody>
      <tfoot><tr class="total-row"><td colspan="2">TOTAL</td><td class="right" id="totDebit">0</td><td class="right" id="totKredit">0</td><td colspan="2"></td></tr></tfoot>
      </table>
      <div style="margin-top:10px;">
        ${!readOnly ? `<button class="btn secondary small" id="btnAddRow">+ Tambah Baris</button>` : ''}
      </div>
      <div id="formMsg"></div>
      <div style="margin-top:14px;">
        ${!readOnly ? `<button class="btn" id="btnSave">Simpan Draft</button>` : ''}
        <button class="btn secondary" id="btnCancel">Tutup</button>
      </div>
    </div>`;
  renderDetailRows(readOnly);
  if (!readOnly) document.getElementById('btnAddRow').onclick = () => { jurnalRows.push({ kode_account: '', kode_department: '', debit: 0, kredit: 0, keterangan: '' }); renderDetailRows(readOnly); };
  if (!readOnly) document.getElementById('j_cabang').onchange = () => renderDetailRows(readOnly);
  document.getElementById('btnCancel').onclick = () => { area.innerHTML = ''; };
  if (!readOnly) document.getElementById('btnSave').onclick = async () => {
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
      area.innerHTML = '';
      goPage('jurnal', 'Jurnal Transaksi');
    } catch (e) { showMsg('formMsg', e.message, 'error'); }
  };
}

function renderDetailRows(readOnly) {
  const body = document.getElementById('jurnalDetailBody');
  const cabangSel = document.getElementById('j_cabang');
  const cabangId = cabangSel ? cabangSel.value : null;
  body.innerHTML = jurnalRows.map((r, i) => `<tr>
    <td><select onchange="jurnalRows[${i}].kode_account=this.value" ${readOnly ? 'disabled' : ''}><option value="">-- pilih --</option>${coaOptions(r.kode_account)}</select></td>
    <td><select onchange="jurnalRows[${i}].kode_department=this.value" ${readOnly ? 'disabled' : ''}>${deptOptions(cabangId, r.kode_department)}</select></td>
    <td><input type="number" step="0.01" value="${r.debit || 0}" style="width:110px" onchange="handleAmountChange(${i}, 'debit', parseFloat(this.value)||0)" ${readOnly ? 'disabled' : ''}></td>
    <td><input type="number" step="0.01" value="${r.kredit || 0}" style="width:110px" onchange="handleAmountChange(${i}, 'kredit', parseFloat(this.value)||0)" ${readOnly ? 'disabled' : ''}></td>
    <td><input value="${esc(r.keterangan)}" onchange="jurnalRows[${i}].keterangan=this.value" ${readOnly ? 'disabled' : ''}></td>
    <td>${!readOnly ? `<button class="btn danger small" onclick="removeJurnalRow(${i})">x</button>` : ''}</td>
  </tr>`).join('');
  updateTotals();
}
window.removeJurnalRow = function (i) { jurnalRows.splice(i, 1); renderDetailRows(false); };
window.updateTotals = function () {
  const td = jurnalRows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const tk = jurnalRows.reduce((s, r) => s + (Number(r.kredit) || 0), 0);
  document.getElementById('totDebit').textContent = fmtNum(td);
  document.getElementById('totKredit').textContent = fmtNum(tk);
};
window.jurnalRows = jurnalRows;

// Ketika salah satu sisi (debit/kredit) diisi, otomatis isikan sisi lawan pada baris kosong lain
// supaya jurnal cepat balance tanpa mengetik dua kali.
window.handleAmountChange = function (i, field, value) {
  jurnalRows[i][field] = value;
  if (value > 0) {
    const opposite = field === 'debit' ? 'kredit' : 'debit';
    let target = -1;
    for (let j = i + 1; j < jurnalRows.length; j++) {
      if (!jurnalRows[j].debit && !jurnalRows[j].kredit) { target = j; break; }
    }
    if (target === -1) {
      for (let j = 0; j < jurnalRows.length; j++) {
        if (j !== i && !jurnalRows[j].debit && !jurnalRows[j].kredit) { target = j; break; }
      }
    }
    if (target !== -1) jurnalRows[target][opposite] = value;
  }
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
  const list = await api('/journal', { }); // list all, filter draft client side via query
  const drafts = (await api('/journal?status=DRAFT'));
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

// ---------------------- TRANSAKSI: TUTUP BUKU ----------------------
PAGES.tutupbuku = async function () {
  const closings = await api('/closing');
  const canPost = hasPerm('TRX_TUTUPBUKU', 'post');
  document.getElementById('content').innerHTML = `
    <div class="card">
      ${canPost ? `<div class="toolbar">
        <div class="field"><label>Cabang</label><select id="f_cabang">${branchOptions()}</select></div>
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
        <div class="field"><label>Cabang</label><select id="f_cabang"><option value="">Semua Cabang</option>${branchOptions()}</select></div>
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
        <div class="field"><label>Cabang</label><select id="f_cabang"><option value="">Semua Cabang</option>${branchOptions()}</select></div>
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
        <div class="field"><label>Cabang</label><select id="f_cabang"><option value="">Semua Cabang</option>${branchOptions()}</select></div>
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
