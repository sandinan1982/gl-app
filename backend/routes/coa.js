const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Pemetaan kelompok laporan & saldo normal untuk kode kategori yang dikenal.
// Kategori baru yang tidak ada di daftar ini akan ditebak dari kata kunci pada namanya.
const KNOWN_CATEGORY_MAP = {
  '01': { kelompok: 'ASET', saldo: 'DEBIT' },
  '12': { kelompok: 'ASET', saldo: 'DEBIT' },
  '20': { kelompok: 'KEWAJIBAN', saldo: 'KREDIT' },
  '21': { kelompok: 'KEWAJIBAN', saldo: 'KREDIT' },
  '30': { kelompok: 'MODAL', saldo: 'KREDIT' },
  '40': { kelompok: 'PENDAPATAN', saldo: 'KREDIT' },
  '50': { kelompok: 'BEBAN', saldo: 'DEBIT' },
  '60': { kelompok: 'BEBAN', saldo: 'DEBIT' },
  '61': { kelompok: 'BEBAN', saldo: 'DEBIT' },
  '70': { kelompok: 'PENDAPATAN', saldo: 'KREDIT' },
  '80': { kelompok: 'MODAL', saldo: 'KREDIT' }
};
function guessCategoryMapping(namaKategori) {
  const n = (namaKategori || '').toLowerCase();
  if (n.includes('aktiva') || n.includes('aset')) return { kelompok: 'ASET', saldo: 'DEBIT' };
  if (n.includes('hutang') || n.includes('kewajiban') || n.includes('utang')) return { kelompok: 'KEWAJIBAN', saldo: 'KREDIT' };
  if (n.includes('ekuitas') || n.includes('modal') || n.includes('ikhtisar')) return { kelompok: 'MODAL', saldo: 'KREDIT' };
  if (n.includes('penjualan') || n.includes('pendapatan')) return { kelompok: 'PENDAPATAN', saldo: 'KREDIT' };
  return { kelompok: 'BEBAN', saldo: 'DEBIT' }; // biaya/pembelian/lainnya
}

// Import Kategori Akun + Kode Account (Induk & Anak) dari file Excel, MENGGANTI seluruh data lama.
// Wajib punya hak akses tambah DAN hapus di menu Kode Account (operasi ini destruktif).
router.post('/import-excel', requirePermission('MASTER_COA', 'add'), requirePermission('MASTER_COA', 'delete'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File Excel tidak ditemukan.' });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  } catch (e) {
    return res.status(400).json({ error: 'Gagal membaca file Excel: ' + e.message });
  }

  const categories = new Map(); // kode_kategori -> {kode_kategori, nama_kategori, kelompok_laporan, saldo_normal}
  const induk = new Map();      // kode_account -> {kode_account, nama_account, kategori}
  const anak = new Map();       // kode_account -> {kode_account, nama_account, kategori, parent_kode}
  const warnings = [];

  rows.forEach((row, idx) => {
    const kodeRaw = row[0], namaRaw = row[1], kategoriRaw = row[3];
    if (!kodeRaw || !namaRaw || !kategoriRaw) return; // baris kosong/tidak relevan
    const kode = String(kodeRaw).trim();
    const nama = String(namaRaw).trim();
    const kategoriStr = String(kategoriRaw).trim();
    const spaceIdx = kategoriStr.indexOf(' ');
    if (spaceIdx < 0) return;
    const kodeKategori = kategoriStr.slice(0, spaceIdx).trim();
    const namaKategori = kategoriStr.slice(spaceIdx + 1).trim();

    if (!categories.has(kodeKategori)) {
      let map = KNOWN_CATEGORY_MAP[kodeKategori];
      if (!map) { map = guessCategoryMapping(namaKategori); warnings.push(`Kategori "${kodeKategori} ${namaKategori}" tidak dikenal, ditebak otomatis sebagai ${map.kelompok}.`); }
      categories.set(kodeKategori, { kode_kategori: kodeKategori, nama_kategori: namaKategori, kelompok_laporan: map.kelompok, saldo_normal: map.saldo });
    }

    const parts = kode.split('-');
    const suffix = parts[parts.length - 1];
    if (suffix === '000') {
      if (!induk.has(kode)) induk.set(kode, { kode_account: kode, nama_account: nama, kategori: kodeKategori });
    } else {
      if (!anak.has(kode)) {
        const parentKode = parts.slice(0, -1).join('-') + '-000';
        anak.set(kode, { kode_account: kode, nama_account: nama, kategori: kodeKategori, parent_kode: parentKode });
      }
    }
  });

  if (categories.size === 0) return res.status(400).json({ error: 'Tidak ada data valid yang ditemukan di file. Pastikan formatnya sesuai (Kode Account, Nama Account, Sub Department, Kategori di kolom A-D).' });

  const result = { categoriesImported: 0, indukImported: 0, anakImported: 0, accountsProtected: [], anakTanpaInduk: [], warnings };

  const tx = db.transaction(() => {
    // 1) Hapus semua kategori lama
    db.prepare('DELETE FROM account_categories').run();

    // 2) Hapus semua Kode Account lama KECUALI yang masih dipakai transaksi (dilindungi dari penghapusan)
    const protectedKodes = new Set(db.prepare('SELECT DISTINCT kode_account FROM journal_detail').all().map(r => r.kode_account));
    const allOldAccounts = db.prepare('SELECT kode_account FROM chart_of_accounts').all().map(r => r.kode_account);
    const delAccStmt = db.prepare('DELETE FROM chart_of_accounts WHERE kode_account=?');
    allOldAccounts.forEach(kode => {
      if (protectedKodes.has(kode)) { result.accountsProtected.push(kode); }
      else { delAccStmt.run(kode); }
    });

    // 3) Insert kategori baru
    const insCat = db.prepare('INSERT INTO account_categories (kode_kategori, nama_kategori, kelompok_laporan, saldo_normal) VALUES (?,?,?,?)');
    categories.forEach(c => { insCat.run(c.kode_kategori, c.nama_kategori, c.kelompok_laporan, c.saldo_normal); result.categoriesImported++; });

    // 4) Insert Akun Induk (header)
    const insAcc = db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (kode_account, nama_account, kategori, saldo_normal, parent_kode, is_header) VALUES (?,?,?,?,?,?)`);
    induk.forEach(a => {
      const cat = categories.get(a.kategori);
      const info = insAcc.run(a.kode_account, a.nama_account, a.kategori, cat ? cat.saldo_normal : 'DEBIT', null, 1);
      if (info.changes > 0) result.indukImported++;
    });

    // 5) Insert Akun Anak (child) - hanya jika induknya berhasil ada
    anak.forEach(a => {
      const parentExists = db.prepare('SELECT 1 FROM chart_of_accounts WHERE kode_account=?').get(a.parent_kode);
      if (!parentExists) { result.anakTanpaInduk.push(a.kode_account); return; }
      const cat = categories.get(a.kategori);
      const info = insAcc.run(a.kode_account, a.nama_account, a.kategori, cat ? cat.saldo_normal : 'DEBIT', a.parent_kode, 0);
      if (info.changes > 0) result.anakImported++;
    });
  });

  try {
    tx();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Gagal mengimpor data: ' + e.message });
  }
});

module.exports = router;

router.get('/', requirePermission('MASTER_COA', 'view'), (req, res) => {
  const rows = db.prepare(`SELECT coa.*, ac.nama_kategori, ac.kelompok_laporan, parent.nama_account as nama_induk
    FROM chart_of_accounts coa
    LEFT JOIN account_categories ac ON ac.kode_kategori = coa.kategori
    LEFT JOIN chart_of_accounts parent ON parent.kode_account = coa.parent_kode
    ORDER BY coa.kode_account`).all();
  res.json(rows);
});

router.post('/', requirePermission('MASTER_COA', 'add'), (req, res) => {
  const { kode_account, nama_account, kategori, saldo_normal, parent_kode, is_header } = req.body;
  if (!kode_account || !nama_account || !kategori || !saldo_normal)
    return res.status(400).json({ error: 'Kode, nama, kategori, dan saldo normal wajib diisi.' });
  const cat = db.prepare('SELECT * FROM account_categories WHERE kode_kategori=?').get(kategori);
  if (!cat) return res.status(400).json({ error: 'Kategori tidak ditemukan. Tambahkan dulu di master Kategori Akun.' });
  if (parent_kode) {
    const parent = db.prepare('SELECT * FROM chart_of_accounts WHERE kode_account=?').get(parent_kode);
    if (!parent) return res.status(400).json({ error: 'Akun induk tidak ditemukan.' });
    if (!parent.is_header) return res.status(400).json({ error: 'Akun yang dipilih sebagai induk harus berstatus Akun Induk (Header).' });
  }
  try {
    const info = db.prepare(`INSERT INTO chart_of_accounts
      (kode_account, nama_account, kategori, saldo_normal, parent_kode, is_header)
      VALUES (?,?,?,?,?,?)`)
      .run(kode_account.trim(), nama_account.trim(), kategori, saldo_normal, parent_kode || null, is_header ? 1 : 0);
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode account sudah digunakan.' }); }
});

router.put('/:kode', requirePermission('MASTER_COA', 'edit'), (req, res) => {
  const { nama_account, kategori, saldo_normal, parent_kode, is_header, status } = req.body;
  if (kategori) {
    const cat = db.prepare('SELECT * FROM account_categories WHERE kode_kategori=?').get(kategori);
    if (!cat) return res.status(400).json({ error: 'Kategori tidak ditemukan. Tambahkan dulu di master Kategori Akun.' });
  }
  if (parent_kode) {
    if (parent_kode === req.params.kode) return res.status(400).json({ error: 'Akun tidak bisa menjadi induk dari dirinya sendiri.' });
    const parent = db.prepare('SELECT * FROM chart_of_accounts WHERE kode_account=?').get(parent_kode);
    if (!parent) return res.status(400).json({ error: 'Akun induk tidak ditemukan.' });
    if (!parent.is_header) return res.status(400).json({ error: 'Akun yang dipilih sebagai induk harus berstatus Akun Induk (Header).' });
  }
  db.prepare(`UPDATE chart_of_accounts SET nama_account=?, kategori=?, saldo_normal=?, parent_kode=?, is_header=?, status=?
    WHERE kode_account=?`)
    .run(nama_account, kategori, saldo_normal, parent_kode || null, is_header ? 1 : 0, status || 'AKTIF', req.params.kode);
  res.json({ ok: true });
});

router.delete('/:kode', requirePermission('MASTER_COA', 'delete'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM journal_detail WHERE kode_account=?').get(req.params.kode).c;
  if (used > 0) return res.status(400).json({ error: 'Account sudah dipakai transaksi, tidak bisa dihapus.' });
  const hasChild = db.prepare('SELECT COUNT(*) c FROM chart_of_accounts WHERE parent_kode=?').get(req.params.kode).c;
  if (hasChild > 0) return res.status(400).json({ error: 'Akun ini masih menjadi induk dari akun lain, tidak bisa dihapus.' });
  db.prepare('DELETE FROM chart_of_accounts WHERE kode_account=?').run(req.params.kode);
  res.json({ ok: true });
});

module.exports = router;
