const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function findSheet(wb, nameCandidates) {
  const found = wb.SheetNames.find(n => nameCandidates.includes(n.trim().toLowerCase()));
  return found ? wb.Sheets[found] : null;
}

// Import Kode Department + Sub Department dari file Excel (sheet bernama "dept" dan "sub dept"),
// MENGGANTI seluruh data lama. Wajib hak akses tambah DAN hapus di kedua menu tsb.
router.post('/import-excel', requirePermission('MASTER_DEPT', 'add'), requirePermission('MASTER_DEPT', 'delete'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File Excel tidak ditemukan.' });

  let wb;
  try { wb = XLSX.read(req.file.buffer, { type: 'buffer' }); }
  catch (e) { return res.status(400).json({ error: 'Gagal membaca file Excel: ' + e.message }); }

  const deptSheet = findSheet(wb, ['dept', 'department', 'kode department']);
  const subDeptSheet = findSheet(wb, ['sub dept', 'subdept', 'sub department']);
  if (!deptSheet) return res.status(400).json({ error: 'Sheet bernama "dept" tidak ditemukan di file.' });
  if (!subDeptSheet) return res.status(400).json({ error: 'Sheet bernama "sub dept" tidak ditemukan di file.' });

  const parseRows = (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const deptRows = parseRows(deptSheet);
  const subDeptRows = parseRows(subDeptSheet);

  const departments = new Map(); // kode -> nama
  deptRows.forEach(row => {
    const kode = row[0], nama = row[1];
    if (kode === null || kode === undefined || !nama) return;
    const kodeStr = String(kode).trim();
    if (!departments.has(kodeStr)) departments.set(kodeStr, String(nama).trim());
  });

  const subDepartments = new Map(); // kode -> nama
  subDeptRows.forEach(row => {
    const kode = row[0], nama = row[1];
    if (kode === null || kode === undefined || !nama) return;
    const kodeStr = String(kode).trim();
    if (!subDepartments.has(kodeStr)) subDepartments.set(kodeStr, String(nama).trim());
  });

  if (departments.size === 0) return res.status(400).json({ error: 'Sheet "dept" tidak berisi data yang valid.' });

  const result = { departmentsImported: 0, subDepartmentsImported: 0, subDepartmentsSkippedNoParent: [] };

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sub_departments').run();
    db.prepare('DELETE FROM departments').run();

    const insDept = db.prepare('INSERT INTO departments (kode_department, nama_department) VALUES (?,?)');
    departments.forEach((nama, kode) => { insDept.run(kode, nama); result.departmentsImported++; });

    const insSub = db.prepare('INSERT INTO sub_departments (kode_sub_department, nama_sub_department, kode_department, tipe) VALUES (?,?,?,?)');
    subDepartments.forEach((nama, kode) => {
      if (!departments.has(kode)) { result.subDepartmentsSkippedNoParent.push(kode); return; }
      insSub.run(kode, nama, kode, 'UMUM');
      result.subDepartmentsImported++;
    });
  });

  try { tx(); res.json(result); }
  catch (e) { res.status(500).json({ error: 'Gagal mengimpor data: ' + e.message }); }
});

module.exports = router;
