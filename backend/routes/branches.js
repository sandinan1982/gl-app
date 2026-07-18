const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_CABANG', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM branches ORDER BY kode_cabang').all());
});

router.post('/', requirePermission('MASTER_CABANG', 'add'), (req, res) => {
  const { kode_cabang, nama_cabang, alamat } = req.body;
  if (!kode_cabang || !nama_cabang) return res.status(400).json({ error: 'Kode dan nama cabang wajib diisi.' });
  try {
    const info = db.prepare('INSERT INTO branches (kode_cabang, nama_cabang, alamat) VALUES (?,?,?)')
      .run(kode_cabang.trim().toUpperCase(), nama_cabang.trim(), alamat || '');
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode cabang sudah digunakan.' }); }
});

router.put('/:id', requirePermission('MASTER_CABANG', 'edit'), (req, res) => {
  const { nama_cabang, alamat, status } = req.body;
  db.prepare('UPDATE branches SET nama_cabang=?, alamat=?, status=? WHERE id=?')
    .run(nama_cabang, alamat || '', status || 'AKTIF', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('MASTER_CABANG', 'delete'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM journal_voucher WHERE cabang_id=?').get(req.params.id).c;
  if (used > 0) return res.status(400).json({ error: 'Cabang sudah memiliki transaksi, tidak bisa dihapus.' });
  db.prepare('DELETE FROM branches WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
