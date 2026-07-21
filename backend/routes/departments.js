const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_DEPT', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM departments ORDER BY kode_department').all());
});

router.post('/', requirePermission('MASTER_DEPT', 'add'), (req, res) => {
  const { kode_department, nama_department } = req.body;
  if (!kode_department || !nama_department)
    return res.status(400).json({ error: 'Kode dan nama department wajib diisi.' });
  try {
    const info = db.prepare('INSERT INTO departments (kode_department, nama_department) VALUES (?,?)')
      .run(kode_department.trim(), nama_department.trim());
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode department sudah digunakan.' }); }
});

router.put('/:id', requirePermission('MASTER_DEPT', 'edit'), (req, res) => {
  const { nama_department, status } = req.body;
  db.prepare('UPDATE departments SET nama_department=?, status=? WHERE id=?')
    .run(nama_department, status || 'AKTIF', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('MASTER_DEPT', 'delete'), (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE id=?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department tidak ditemukan.' });
  const usedSub = db.prepare('SELECT COUNT(*) c FROM sub_departments WHERE kode_department=?').get(dept.kode_department).c;
  if (usedSub > 0) return res.status(400).json({ error: 'Department ini masih dipakai oleh Sub Department, tidak bisa dihapus.' });
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
