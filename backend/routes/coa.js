const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

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
