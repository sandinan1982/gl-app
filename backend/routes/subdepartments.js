const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_SUBDEPT', 'view'), (req, res) => {
  const rows = db.prepare(`SELECT sd.*, d.nama_department FROM sub_departments sd
    JOIN departments d ON d.kode_department = sd.kode_department
    ORDER BY sd.kode_department, sd.kode_sub_department`).all();
  res.json(rows);
});

router.post('/', requirePermission('MASTER_SUBDEPT', 'add'), (req, res) => {
  const { kode_sub_department, nama_sub_department, kode_department, tipe } = req.body;
  if (!kode_sub_department || !nama_sub_department || !kode_department || !tipe)
    return res.status(400).json({ error: 'Kode sub department, nama, Kode Department, dan tipe wajib diisi.' });
  if (!['UMUM', 'NEQ'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus UMUM atau NEQ.' });
  const dept = db.prepare('SELECT * FROM departments WHERE kode_department=?').get(kode_department);
  if (!dept) return res.status(400).json({ error: 'Kode Department tidak ditemukan. Pilih dari master Kode Department yang sudah ada.' });
  try {
    const info = db.prepare(`INSERT INTO sub_departments (kode_sub_department, nama_sub_department, kode_department, tipe)
      VALUES (?,?,?,?)`).run(kode_sub_department.trim(), nama_sub_department.trim(), kode_department, tipe);
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode sub department sudah digunakan.' }); }
});

router.put('/:kode', requirePermission('MASTER_SUBDEPT', 'edit'), (req, res) => {
  const { nama_sub_department, kode_department, tipe, status } = req.body;
  if (!['UMUM', 'NEQ'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus UMUM atau NEQ.' });
  const dept = db.prepare('SELECT * FROM departments WHERE kode_department=?').get(kode_department);
  if (!dept) return res.status(400).json({ error: 'Kode Department tidak ditemukan.' });
  db.prepare(`UPDATE sub_departments SET nama_sub_department=?, kode_department=?, tipe=?, status=? WHERE kode_sub_department=?`)
    .run(nama_sub_department, kode_department, tipe, status || 'AKTIF', req.params.kode);
  res.json({ ok: true });
});

router.delete('/:kode', requirePermission('MASTER_SUBDEPT', 'delete'), (req, res) => {
  db.prepare('DELETE FROM sub_departments WHERE kode_sub_department=?').run(req.params.kode);
  res.json({ ok: true });
});

module.exports = router;
