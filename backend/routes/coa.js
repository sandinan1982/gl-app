const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_COA', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM chart_of_accounts ORDER BY kode_account').all());
});

router.post('/', requirePermission('MASTER_COA', 'add'), (req, res) => {
  const { kode_account, nama_account, kategori, saldo_normal, parent_kode, is_header } = req.body;
  if (!kode_account || !nama_account || !kategori || !saldo_normal)
    return res.status(400).json({ error: 'Kode, nama, kategori, dan saldo normal wajib diisi.' });
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
  db.prepare(`UPDATE chart_of_accounts SET nama_account=?, kategori=?, saldo_normal=?, parent_kode=?, is_header=?, status=?
    WHERE kode_account=?`)
    .run(nama_account, kategori, saldo_normal, parent_kode || null, is_header ? 1 : 0, status || 'AKTIF', req.params.kode);
  res.json({ ok: true });
});

router.delete('/:kode', requirePermission('MASTER_COA', 'delete'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM journal_detail WHERE kode_account=?').get(req.params.kode).c;
  if (used > 0) return res.status(400).json({ error: 'Account sudah dipakai transaksi, tidak bisa dihapus.' });
  db.prepare('DELETE FROM chart_of_accounts WHERE kode_account=?').run(req.params.kode);
  res.json({ ok: true });
});

module.exports = router;
