const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, scopeBranch } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

// ============ LAPORAN NERACA (Balance Sheet) - saldo s/d tanggal tertentu ============
router.get('/neraca', requirePermission('LAP_NERACA', 'view'), scopeBranch, (req, res) => {
  const { sampai, cabang_id } = req.query;
  if (!sampai) return res.status(400).json({ error: 'Parameter tanggal (sampai) wajib diisi.' });
  const branch = req.branchFilter || cabang_id || null;

  let sql = `SELECT coa.kode_account, coa.nama_account, coa.kategori, coa.saldo_normal,
      COALESCE(SUM(jd.debit),0) tdebit, COALESCE(SUM(jd.kredit),0) tkredit
    FROM chart_of_accounts coa
    LEFT JOIN journal_detail jd ON jd.kode_account = coa.kode_account
    LEFT JOIN journal_voucher jv ON jv.no_bukti = jd.no_bukti AND jv.status='POSTED' AND jv.tanggal<=?`;
  const params = [sampai];
  if (branch) { sql += ' AND jv.cabang_id=?'; params.push(branch); }
  sql += ` WHERE coa.kategori IN ('ASET','KEWAJIBAN','MODAL') AND coa.is_header=0
    GROUP BY coa.kode_account ORDER BY coa.kode_account`;

  const rows = db.prepare(sql).all(...params);
  const result = { ASET: [], KEWAJIBAN: [], MODAL: [] };
  let totalAset = 0, totalKewajiban = 0, totalModal = 0;
  rows.forEach(r => {
    const saldo = r.saldo_normal === 'DEBIT' ? (r.tdebit - r.tkredit) : (r.tkredit - r.tdebit);
    const item = { kode_account: r.kode_account, nama_account: r.nama_account, saldo };
    result[r.kategori].push(item);
    if (r.kategori === 'ASET') totalAset += saldo;
    if (r.kategori === 'KEWAJIBAN') totalKewajiban += saldo;
    if (r.kategori === 'MODAL') totalModal += saldo;
  });

  // Laba/rugi berjalan otomatis masuk ke Modal agar neraca balance
  const plSql = `SELECT coa.kategori, coa.saldo_normal, COALESCE(SUM(jd.debit),0) td, COALESCE(SUM(jd.kredit),0) tk
    FROM chart_of_accounts coa
    LEFT JOIN journal_detail jd ON jd.kode_account=coa.kode_account
    LEFT JOIN journal_voucher jv ON jv.no_bukti=jd.no_bukti AND jv.status='POSTED' AND jv.tanggal<=?
    ${branch ? 'AND jv.cabang_id=?' : ''}
    WHERE coa.kategori IN ('PENDAPATAN','BEBAN') GROUP BY coa.kategori`;
  const plParams = branch ? [sampai, branch] : [sampai];
  const plRows = db.prepare(plSql).all(...plParams);
  let labaBerjalan = 0;
  plRows.forEach(r => {
    if (r.kategori === 'PENDAPATAN') labaBerjalan += (r.tk - r.td);
    if (r.kategori === 'BEBAN') labaBerjalan -= (r.td - r.tk);
  });
  result.MODAL.push({ kode_account: '-', nama_account: 'Laba/Rugi Berjalan', saldo: labaBerjalan });
  totalModal += labaBerjalan;

  res.json({
    sampai, totalAset, totalKewajiban, totalModal,
    balance: Math.round((totalAset - (totalKewajiban + totalModal)) * 100) === 0,
    data: result
  });
});

// ============ LAPORAN LABA RUGI (P&L) - untuk rentang periode ============
router.get('/laba-rugi', requirePermission('LAP_LABARUGI', 'view'), scopeBranch, (req, res) => {
  const { dari, sampai, cabang_id } = req.query;
  if (!dari || !sampai) return res.status(400).json({ error: 'Parameter dari & sampai wajib diisi.' });
  const branch = req.branchFilter || cabang_id || null;

  let sql = `SELECT coa.kode_account, coa.nama_account, coa.kategori, coa.saldo_normal,
      COALESCE(SUM(jd.debit),0) tdebit, COALESCE(SUM(jd.kredit),0) tkredit
    FROM chart_of_accounts coa
    LEFT JOIN journal_detail jd ON jd.kode_account = coa.kode_account
    LEFT JOIN journal_voucher jv ON jv.no_bukti = jd.no_bukti AND jv.status='POSTED'
      AND jv.tanggal BETWEEN ? AND ?`;
  const params = [dari, sampai];
  if (branch) { sql += ' AND jv.cabang_id=?'; params.push(branch); }
  sql += ` WHERE coa.kategori IN ('PENDAPATAN','BEBAN') AND coa.is_header=0
    GROUP BY coa.kode_account ORDER BY coa.kode_account`;

  const rows = db.prepare(sql).all(...params);
  const pendapatan = [], beban = [];
  let totalPendapatan = 0, totalBeban = 0;
  rows.forEach(r => {
    const saldo = r.kategori === 'PENDAPATAN' ? (r.tkredit - r.tdebit) : (r.tdebit - r.tkredit);
    const item = { kode_account: r.kode_account, nama_account: r.nama_account, saldo };
    if (r.kategori === 'PENDAPATAN') { pendapatan.push(item); totalPendapatan += saldo; }
    else { beban.push(item); totalBeban += saldo; }
  });

  res.json({
    dari, sampai, pendapatan, beban, totalPendapatan, totalBeban,
    labaRugi: totalPendapatan - totalBeban
  });
});

// ============ LAPORAN TRANSAKSI HARIAN ============
router.get('/harian', requirePermission('LAP_HARIAN', 'view'), scopeBranch, (req, res) => {
  const { tanggal, cabang_id, status } = req.query;
  if (!tanggal) return res.status(400).json({ error: 'Parameter tanggal wajib diisi.' });
  const branch = req.branchFilter || cabang_id || null;

  let sql = `SELECT jv.no_bukti, jv.tanggal, jv.status, jv.keterangan as ket_voucher, b.nama_cabang,
      jd.kode_account, coa.nama_account, jd.kode_department, jd.debit, jd.kredit, jd.keterangan
    FROM journal_voucher jv
    JOIN branches b ON b.id = jv.cabang_id
    JOIN journal_detail jd ON jd.no_bukti = jv.no_bukti
    JOIN chart_of_accounts coa ON coa.kode_account = jd.kode_account
    WHERE jv.tanggal = ?`;
  const params = [tanggal];
  if (branch) { sql += ' AND jv.cabang_id=?'; params.push(branch); }
  if (status) { sql += ' AND jv.status=?'; params.push(status); }
  sql += ' ORDER BY jv.no_bukti, jd.urutan';

  const rows = db.prepare(sql).all(...params);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalKredit = rows.reduce((s, r) => s + r.kredit, 0);
  res.json({ tanggal, rows, totalDebit, totalKredit });
});

module.exports = router;
