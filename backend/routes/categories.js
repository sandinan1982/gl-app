const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_KATEGORI', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM account_categories ORDER BY kelompok_laporan, kode_kategori').all());
});

router.post('/', requirePermission('MASTER_KATEGORI', 'add'), (req, res) => {
  const { kode_kategori, nama_kategori, kelompok_laporan, saldo_normal } = req.body;
  if (!kode_kategori || !nama_kategori || !kelompok_laporan || !saldo_normal)
    return res.status(400).json({ error: 'Kode, nama, kelompok laporan, dan saldo normal wajib diisi.' });
  try {
    const info = db.prepare(`INSERT INTO account_categories (kode_kategori, nama_kategori, kelompok_laporan, saldo_normal)
      VALUES (?,?,?,?)`).run(kode_kategori.trim().toUpperCase(), nama_kategori.trim(), kelompok_laporan, saldo_normal);
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode kategori sudah digunakan.' }); }
});

router.put('/:kode', requirePermission('MASTER_KATEGORI', 'edit'), (req, res) => {
  const { nama_kategori, kelompok_laporan, saldo_normal, status } = req.body;
  db.prepare(`UPDATE account_categories SET nama_kategori=?, kelompok_laporan=?, saldo_normal=?, status=? WHERE kode_kategori=?`)
    .run(nama_kategori, kelompok_laporan, saldo_normal, status || 'AKTIF', req.params.kode);
  res.json({ ok: true });
});

router.delete('/:kode', requirePermission('MASTER_KATEGORI', 'delete'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM chart_of_accounts WHERE kategori=?').get(req.params.kode).c;
  if (used > 0) return res.status(400).json({ error: 'Kategori sudah dipakai oleh Kode Account, tidak bisa dihapus.' });
  db.prepare('DELETE FROM account_categories WHERE kode_kategori=?').run(req.params.kode);
  res.json({ ok: true });
});

module.exports = router;
