const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, scopeBranch } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_DEPT', 'view'), scopeBranch, (req, res) => {
  let sql = `SELECT d.*, b.nama_cabang FROM departments d JOIN branches b ON b.id=d.cabang_id`;
  const params = [];
  if (req.branchFilter) { sql += ' WHERE d.cabang_id=?'; params.push(req.branchFilter); }
  sql += ' ORDER BY d.kode_department';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', requirePermission('MASTER_DEPT', 'add'), (req, res) => {
  const { kode_department, nama_department, cabang_id } = req.body;
  if (!kode_department || !nama_department || !cabang_id)
    return res.status(400).json({ error: 'Kode, nama department, dan cabang wajib diisi.' });
  try {
    const info = db.prepare('INSERT INTO departments (kode_department, nama_department, cabang_id) VALUES (?,?,?)')
      .run(kode_department.trim(), nama_department.trim(), cabang_id);
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode department sudah dipakai pada cabang ini.' }); }
});

router.put('/:id', requirePermission('MASTER_DEPT', 'edit'), (req, res) => {
  const { nama_department, status } = req.body;
  db.prepare('UPDATE departments SET nama_department=?, status=? WHERE id=?')
    .run(nama_department, status || 'AKTIF', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('MASTER_DEPT', 'delete'), (req, res) => {
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
