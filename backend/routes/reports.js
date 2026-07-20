const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, scopeBranch } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

// Prediksi sederhana berbasis tren (regresi linear) dari deret waktu bulanan.
// Bukan machine learning kompleks, tapi metode statistik standar untuk forecasting tren.
function linearRegressionPredict(values) {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return Math.max(0, values[0]);
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = (n * sumXX - sumX * sumX);
  if (denom === 0) return Math.max(0, sumY / n);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return Math.max(0, intercept + slope * n);
}

// ============ LAPORAN NERACA (Balance Sheet) - saldo s/d tanggal tertentu ============
router.get('/neraca', requirePermission('LAP_NERACA', 'view'), scopeBranch, (req, res) => {
  const { sampai, cabang_id } = req.query;
  if (!sampai) return res.status(400).json({ error: 'Parameter tanggal (sampai) wajib diisi.' });
  const branch = req.branchFilter || cabang_id || null;

  let sql = `SELECT coa.kode_account, coa.nama_account, coa.saldo_normal, ac.kelompok_laporan,
      COALESCE(SUM(jd.debit),0) tdebit, COALESCE(SUM(jd.kredit),0) tkredit
    FROM chart_of_accounts coa
    JOIN account_categories ac ON ac.kode_kategori = coa.kategori
    LEFT JOIN journal_detail jd ON jd.kode_account = coa.kode_account
    LEFT JOIN journal_voucher jv ON jv.no_bukti = jd.no_bukti AND jv.status='POSTED' AND jv.tanggal<=?`;
  const params = [sampai];
  if (branch) { sql += ' AND jv.cabang_id=?'; params.push(branch); }
  sql += ` WHERE ac.kelompok_laporan IN ('ASET','KEWAJIBAN','MODAL') AND coa.is_header=0
    GROUP BY coa.kode_account ORDER BY coa.kode_account`;

  const rows = db.prepare(sql).all(...params);
  const result = { ASET: [], KEWAJIBAN: [], MODAL: [] };
  let totalAset = 0, totalKewajiban = 0, totalModal = 0;
  rows.forEach(r => {
    const saldo = r.saldo_normal === 'DEBIT' ? (r.tdebit - r.tkredit) : (r.tkredit - r.tdebit);
    const item = { kode_account: r.kode_account, nama_account: r.nama_account, saldo };
    result[r.kelompok_laporan].push(item);
    if (r.kelompok_laporan === 'ASET') totalAset += saldo;
    if (r.kelompok_laporan === 'KEWAJIBAN') totalKewajiban += saldo;
    if (r.kelompok_laporan === 'MODAL') totalModal += saldo;
  });

  // Laba/rugi berjalan otomatis masuk ke Modal agar neraca balance
  const plSql = `SELECT ac.kelompok_laporan, coa.saldo_normal, COALESCE(SUM(jd.debit),0) td, COALESCE(SUM(jd.kredit),0) tk
    FROM chart_of_accounts coa
    JOIN account_categories ac ON ac.kode_kategori = coa.kategori
    LEFT JOIN journal_detail jd ON jd.kode_account=coa.kode_account
    LEFT JOIN journal_voucher jv ON jv.no_bukti=jd.no_bukti AND jv.status='POSTED' AND jv.tanggal<=?
    ${branch ? 'AND jv.cabang_id=?' : ''}
    WHERE ac.kelompok_laporan IN ('PENDAPATAN','BEBAN') GROUP BY ac.kelompok_laporan`;
  const plParams = branch ? [sampai, branch] : [sampai];
  const plRows = db.prepare(plSql).all(...plParams);
  let labaBerjalan = 0;
  plRows.forEach(r => {
    if (r.kelompok_laporan === 'PENDAPATAN') labaBerjalan += (r.tk - r.td);
    if (r.kelompok_laporan === 'BEBAN') labaBerjalan -= (r.td - r.tk);
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

  let sql = `SELECT coa.kode_account, coa.nama_account, coa.saldo_normal, ac.kelompok_laporan,
      COALESCE(SUM(jd.debit),0) tdebit, COALESCE(SUM(jd.kredit),0) tkredit
    FROM chart_of_accounts coa
    JOIN account_categories ac ON ac.kode_kategori = coa.kategori
    LEFT JOIN journal_detail jd ON jd.kode_account = coa.kode_account
    LEFT JOIN journal_voucher jv ON jv.no_bukti = jd.no_bukti AND jv.status='POSTED'
      AND jv.tanggal BETWEEN ? AND ?`;
  const params = [dari, sampai];
  if (branch) { sql += ' AND jv.cabang_id=?'; params.push(branch); }
  sql += ` WHERE ac.kelompok_laporan IN ('PENDAPATAN','BEBAN') AND coa.is_header=0
    GROUP BY coa.kode_account ORDER BY coa.kode_account`;

  const rows = db.prepare(sql).all(...params);
  const pendapatan = [], beban = [];
  let totalPendapatan = 0, totalBeban = 0;
  rows.forEach(r => {
    const saldo = r.kelompok_laporan === 'PENDAPATAN' ? (r.tkredit - r.tdebit) : (r.tdebit - r.tkredit);
    const item = { kode_account: r.kode_account, nama_account: r.nama_account, saldo };
    if (r.kelompok_laporan === 'PENDAPATAN') { pendapatan.push(item); totalPendapatan += saldo; }
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

// ============ PREDIKSI LABA RUGI (AI - trend forecasting) ============
router.get('/prediksi-laba-rugi', requirePermission('LAP_PREDIKSI', 'view'), scopeBranch, (req, res) => {
  const branch = req.branchFilter || req.query.cabang_id || null;
  let bulan = parseInt(req.query.bulan, 10);
  if (!bulan || bulan < 2) bulan = 6;
  if (bulan > 24) bulan = 24;

  let sql = `SELECT coa.kode_account, coa.nama_account, ac.kelompok_laporan, substr(jv.tanggal,1,7) periode,
      SUM(jd.debit) tdebit, SUM(jd.kredit) tkredit
    FROM chart_of_accounts coa
    JOIN account_categories ac ON ac.kode_kategori = coa.kategori
    JOIN journal_detail jd ON jd.kode_account = coa.kode_account
    JOIN journal_voucher jv ON jv.no_bukti = jd.no_bukti AND jv.status='POSTED'
    WHERE ac.kelompok_laporan IN ('PENDAPATAN','BEBAN') AND coa.is_header=0`;
  const params = [];
  if (branch) { sql += ' AND jv.cabang_id=?'; params.push(branch); }
  sql += ` GROUP BY coa.kode_account, periode ORDER BY coa.kode_account, periode`;

  const rows = db.prepare(sql).all(...params);
  if (rows.length === 0) {
    return res.json({
      historyMonths: [], nextPeriod: null, pendapatan: [], beban: [],
      totalPendapatanHistory: [], totalBebanHistory: [],
      totalPendapatanPrediksi: 0, totalBebanPrediksi: 0, labaRugiPrediksi: 0,
      message: 'Belum ada data transaksi terposting yang cukup untuk membuat prediksi.'
    });
  }

  const allPeriods = Array.from(new Set(rows.map(r => r.periode))).sort();
  const historyMonths = allPeriods.slice(-bulan);

  const accMap = {};
  rows.forEach(r => {
    if (!accMap[r.kode_account]) accMap[r.kode_account] = { kode_account: r.kode_account, nama_account: r.nama_account, kelompok_laporan: r.kelompok_laporan, monthly: {} };
    const val = r.kelompok_laporan === 'PENDAPATAN' ? (r.tkredit - r.tdebit) : (r.tdebit - r.tkredit);
    accMap[r.kode_account].monthly[r.periode] = val;
  });

  const buildSeries = (monthly) => historyMonths.map(p => Number(monthly[p] || 0));

  const pendapatan = [], beban = [];
  const totalPendapatanHistory = historyMonths.map(() => 0);
  const totalBebanHistory = historyMonths.map(() => 0);

  Object.values(accMap).forEach(acc => {
    const series = buildSeries(acc.monthly);
    const prediksi = linearRegressionPredict(series);
    const item = { kode_account: acc.kode_account, nama_account: acc.nama_account, history: series, prediksi };
    if (acc.kelompok_laporan === 'PENDAPATAN') { pendapatan.push(item); series.forEach((v, i) => totalPendapatanHistory[i] += v); }
    else { beban.push(item); series.forEach((v, i) => totalBebanHistory[i] += v); }
  });

  const totalPendapatanPrediksi = linearRegressionPredict(totalPendapatanHistory);
  const totalBebanPrediksi = linearRegressionPredict(totalBebanHistory);
  const labaRugiPrediksi = totalPendapatanPrediksi - totalBebanPrediksi;

  const lastPeriod = allPeriods[allPeriods.length - 1];
  const [y, m] = lastPeriod.split('-').map(Number);
  const nd = new Date(y, m, 1); // m 1-indexed -> otomatis maju satu bulan
  const nextPeriod = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`;

  res.json({
    historyMonths, nextPeriod, pendapatan, beban,
    totalPendapatanHistory, totalBebanHistory,
    totalPendapatanPrediksi, totalBebanPrediksi, labaRugiPrediksi,
    method: historyMonths.length >= 3 ? 'Tren regresi linear' : 'Rata-rata sederhana (riwayat data < 3 bulan, prediksi kurang akurat)'
  });
});

module.exports = router;
