const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('MASTER_SUBDEPT', 'view'), (req, res) => {
  // LEFT JOIN (bukan INNER JOIN) supaya baris tetap tampil walau ada ketidakcocokan data,
  // jadi tidak ada data yang "hilang" secara diam-diam dari daftar.
  const rows = db.prepare(`SELECT sd.*, d.nama_department FROM sub_departments sd
    LEFT JOIN departments d ON d.kode_department = sd.kode_department
    ORDER BY sd.kode_department, sd.kode_sub_department`).all();
  res.json(rows);
});

router.post('/', requirePermission('MASTER_SUBDEPT', 'add'), (req, res) => {
  const { kode_sub_department, nama_sub_department, kode_department, tipe } = req.body;
  if (!kode_sub_department || !nama_sub_department || !kode_department || !tipe)
    return res.status(400).json({ error: 'Kode sub department, nama, Kode Department, dan tipe wajib diisi.' });
  if (!['UMUM', 'NEQ'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus UMUM atau NEQ.' });

  const kodeTrim = kode_sub_department.trim();
  const deptKodeTrim = kode_department.trim();

  const dept = db.prepare('SELECT * FROM departments WHERE kode_department=?').get(deptKodeTrim);
  if (!dept) return res.status(400).json({ error: `Kode Department "${deptKodeTrim}" tidak ditemukan. Pilih dari master Kode Department yang sudah ada.` });

  const existing = db.prepare('SELECT * FROM sub_departments WHERE kode_sub_department=?').get(kodeTrim);
  if (existing) return res.status(400).json({ error: `Kode Sub Department "${kodeTrim}" sudah dipakai oleh sub department lain (${existing.nama_sub_department}). Kode sub department dan kode department boleh sama, tapi sesama sub department tidak boleh punya kode kembar.` });

  try {
    const info = db.prepare(`INSERT INTO sub_departments (kode_sub_department, nama_sub_department, kode_department, tipe)
      VALUES (?,?,?,?)`).run(kodeTrim, nama_sub_department.trim(), deptKodeTrim, tipe);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    // Tampilkan pesan asli dari database supaya penyebab sebenarnya terlihat, bukan ditebak.
    res.status(400).json({ error: 'Gagal menyimpan Sub Department: ' + e.message });
  }
});

router.put('/:kode', requirePermission('MASTER_SUBDEPT', 'edit'), (req, res) => {
  const { nama_sub_department, kode_department, tipe, status } = req.body;
  if (!['UMUM', 'NEQ'].includes(tipe)) return res.status(400).json({ error: 'Tipe harus UMUM atau NEQ.' });
  const deptKodeTrim = (kode_department || '').trim();
  const dept = db.prepare('SELECT * FROM departments WHERE kode_department=?').get(deptKodeTrim);
  if (!dept) return res.status(400).json({ error: `Kode Department "${deptKodeTrim}" tidak ditemukan.` });
  try {
    db.prepare(`UPDATE sub_departments SET nama_sub_department=?, kode_department=?, tipe=?, status=? WHERE kode_sub_department=?`)
      .run(nama_sub_department, deptKodeTrim, tipe, status || 'AKTIF', req.params.kode);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Gagal menyimpan perubahan: ' + e.message });
  }
});

router.delete('/:kode', requirePermission('MASTER_SUBDEPT', 'delete'), (req, res) => {
  db.prepare('DELETE FROM sub_departments WHERE kode_sub_department=?').run(req.params.kode);
  res.json({ ok: true });
});

module.exports = router;
