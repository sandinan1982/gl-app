const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.get('/', requirePermission('MASTER_SUBDEPT', 'view'), (req, res) => {
  // LEFT JOIN (bukan INNER JOIN) supaya baris tetap tampil walau ada ketidakcocokan data.
  // Urutkan berdasarkan angka kode sub department (bukan urutan teks) supaya tidak lompat-lompat.
  const rows = db.prepare(`SELECT sd.*, d.nama_department FROM sub_departments sd
    LEFT JOIN departments d ON d.kode_department = sd.kode_department
    ORDER BY CAST(sd.kode_sub_department AS INTEGER), sd.kode_sub_department`).all();
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

function findSheet(wb, nameCandidates) {
  const found = wb.SheetNames.find(n => nameCandidates.includes(n.trim().toLowerCase()));
  return found ? wb.Sheets[found] : null;
}

// Import Sub Department dari Excel, MENGGANTI seluruh data Sub Department yang ada
// (Kode Department TIDAK ikut dihapus/diubah). Prioritaskan sheet "revisi sub dept"
// (format: no, "kode nama department induk", nama sub department - tipe NEQ/UMUM
// ditentukan otomatis dari kata "NEQ" pada namanya). Kalau sheet itu tidak ada,
// jatuh ke format lama sheet "sub dept" (kode+nama saja, self-linked ke department kode sama).
router.post('/import-excel', requirePermission('MASTER_SUBDEPT', 'add'), requirePermission('MASTER_SUBDEPT', 'delete'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File Excel tidak ditemukan.' });

  let wb;
  try { wb = XLSX.read(req.file.buffer, { type: 'buffer' }); }
  catch (e) { return res.status(400).json({ error: 'Gagal membaca file Excel: ' + e.message }); }

  const revisiSheet = findSheet(wb, ['revisi sub dept', 'revisi subdept']);
  const legacySheet = findSheet(wb, ['sub dept', 'subdept', 'sub department']);
  if (!revisiSheet && !legacySheet) return res.status(400).json({ error: 'Sheet "revisi sub dept" atau "sub dept" tidak ditemukan di file.' });

  const parseRows = (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const existingDeptKodes = new Set(db.prepare('SELECT kode_department FROM departments').all().map(r => r.kode_department));

  const subDepartments = []; // { kode, nama, kode_department, tipe }
  const skippedNoParent = [];

  if (revisiSheet) {
    const rows = parseRows(revisiSheet);
    rows.forEach(row => {
      const no = row[0], deptRef = row[1], nama = row[2];
      if (no === null || no === undefined || !deptRef || !nama) return;
      const kode = String(no).trim();
      const namaStr = String(nama).trim();
      const spaceIdx = String(deptRef).indexOf(' ');
      const deptKodeRaw = spaceIdx > 0 ? String(deptRef).slice(0, spaceIdx).trim() : String(deptRef).trim();
      const deptKodeNorm = String(parseInt(deptKodeRaw, 10)); // hilangkan nol di depan, mis. "008" -> "8"
      const tipe = /neq/i.test(namaStr) ? 'NEQ' : 'UMUM';
      if (!existingDeptKodes.has(deptKodeNorm)) { skippedNoParent.push(`${kode} (${namaStr}) - department "${deptKodeRaw}" tidak ditemukan`); return; }
      subDepartments.push({ kode, nama: namaStr, kode_department: deptKodeNorm, tipe });
    });
  } else {
    const rows = parseRows(legacySheet);
    rows.forEach(row => {
      const kodeRaw = row[0], nama = row[1];
      if (kodeRaw === null || kodeRaw === undefined || !nama) return;
      const kode = String(kodeRaw).trim();
      const namaStr = String(nama).trim();
      if (!existingDeptKodes.has(kode)) { skippedNoParent.push(`${kode} (${namaStr}) - department dengan kode sama tidak ditemukan`); return; }
      subDepartments.push({ kode, nama: namaStr, kode_department: kode, tipe: /neq/i.test(namaStr) ? 'NEQ' : 'UMUM' });
    });
  }

  if (subDepartments.length === 0) return res.status(400).json({ error: 'Tidak ada data Sub Department valid yang bisa diimpor. Pastikan Kode Department sudah dibuat lebih dulu.' });

  const result = { subDepartmentsImported: 0, skippedNoParent };
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sub_departments').run();
    const insSub = db.prepare('INSERT OR IGNORE INTO sub_departments (kode_sub_department, nama_sub_department, kode_department, tipe) VALUES (?,?,?,?)');
    subDepartments.forEach(s => {
      const info = insSub.run(s.kode, s.nama, s.kode_department, s.tipe);
      if (info.changes > 0) result.subDepartmentsImported++;
    });
  });

  try { tx(); res.json(result); }
  catch (e) { res.status(500).json({ error: 'Gagal mengimpor data: ' + e.message }); }
});

module.exports = router;
