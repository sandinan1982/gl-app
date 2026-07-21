const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, scopeBranch } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

function periodeOf(tanggal) { return tanggal.slice(0, 7); } // YYYY-MM

function isPeriodClosed(cabang_id, tanggal) {
  const periode = periodeOf(tanggal);
  const row = db.prepare('SELECT status FROM period_closing WHERE cabang_id=? AND periode=?').get(cabang_id, periode);
  return row && row.status === 'CLOSED';
}

function generateNoBukti(cabang_id) {
  const branch = db.prepare('SELECT kode_cabang FROM branches WHERE id=?').get(cabang_id);
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `JV-${branch.kode_cabang}-${ym}-`;
  const last = db.prepare(`SELECT no_bukti FROM journal_voucher WHERE no_bukti LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(prefix + '%');
  let seq = 1;
  if (last) seq = parseInt(last.no_bukti.split('-').pop(), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

// LIST voucher (dengan filter cabang, tanggal, status)
router.get('/', requirePermission('TRX_JURNAL', 'view'), scopeBranch, (req, res) => {
  const { cabang_id, dari, sampai, status } = req.query;
  let sql = `SELECT v.*, b.nama_cabang FROM journal_voucher v JOIN branches b ON b.id=v.cabang_id WHERE 1=1`;
  const params = [];
  if (req.branchFilter) { sql += ' AND v.cabang_id=?'; params.push(req.branchFilter); }
  else if (cabang_id) { sql += ' AND v.cabang_id=?'; params.push(cabang_id); }
  if (dari) { sql += ' AND v.tanggal>=?'; params.push(dari); }
  if (sampai) { sql += ' AND v.tanggal<=?'; params.push(sampai); }
  if (status) { sql += ' AND v.status=?'; params.push(status); }
  sql += ' ORDER BY v.tanggal DESC, v.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// DETAIL voucher (header + lines)
router.get('/:no_bukti', requirePermission('TRX_JURNAL', 'view'), (req, res) => {
  const header = db.prepare(`SELECT v.*, b.nama_cabang FROM journal_voucher v
    JOIN branches b ON b.id=v.cabang_id WHERE v.no_bukti=?`).get(req.params.no_bukti);
  if (!header) return res.status(404).json({ error: 'No bukti tidak ditemukan.' });
  const details = db.prepare(`SELECT jd.*, coa.nama_account, dept.nama_department FROM journal_detail jd
    JOIN chart_of_accounts coa ON coa.kode_account=jd.kode_account
    LEFT JOIN departments dept ON dept.kode_department=jd.kode_department
    WHERE jd.no_bukti=? ORDER BY jd.urutan`).all(req.params.no_bukti);
  res.json({ header, details });
});

// CREATE voucher baru + input no bukti + baris jurnal (transaksi ditulis sekaligus)
router.post('/', requirePermission('TRX_JURNAL', 'add'), (req, res) => {
  const { no_bukti, tanggal, cabang_id, keterangan, details } = req.body;
  if (!tanggal || !cabang_id) return res.status(400).json({ error: 'Tanggal dan cabang wajib diisi.' });
  if (!Array.isArray(details) || details.length < 2)
    return res.status(400).json({ error: 'Jurnal minimal harus memiliki 2 baris (debit & kredit).' });
  if (isPeriodClosed(cabang_id, tanggal))
    return res.status(400).json({ error: 'Periode sudah tutup buku, tidak bisa input transaksi.' });

  let totalDebit = 0, totalKredit = 0;
  for (const d of details) {
    if (!d.kode_account) return res.status(400).json({ error: 'Kode account pada baris jurnal wajib diisi.' });
    totalDebit += Number(d.debit || 0);
    totalKredit += Number(d.kredit || 0);
  }
  if (Math.round(totalDebit * 100) !== Math.round(totalKredit * 100))
    return res.status(400).json({ error: `Jurnal tidak balance. Debit ${totalDebit} <> Kredit ${totalKredit}.` });
  if (totalDebit === 0) return res.status(400).json({ error: 'Total jurnal tidak boleh nol.' });

  const finalNoBukti = (no_bukti && no_bukti.trim()) ? no_bukti.trim() : generateNoBukti(cabang_id);
  const exists = db.prepare('SELECT id FROM journal_voucher WHERE no_bukti=?').get(finalNoBukti);
  if (exists) return res.status(400).json({ error: 'No bukti sudah digunakan.' });

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO journal_voucher
      (no_bukti, tanggal, cabang_id, keterangan, status, total_debit, total_kredit, created_by)
      VALUES (?,?,?,?,'DRAFT',?,?,?)`)
      .run(finalNoBukti, tanggal, cabang_id, keterangan || '', totalDebit, totalKredit, req.user.id);

    const insDetail = db.prepare(`INSERT INTO journal_detail
      (no_bukti, urutan, kode_account, kode_department, debit, kredit, keterangan) VALUES (?,?,?,?,?,?,?)`);
    details.forEach((d, i) => {
      insDetail.run(finalNoBukti, i + 1, d.kode_account, d.kode_department || null,
        Number(d.debit || 0), Number(d.kredit || 0), d.keterangan || '');
    });
  });
  tx();
  res.json({ no_bukti: finalNoBukti });
});

// UPDATE voucher DRAFT (ganti header + replace semua baris)
router.put('/:no_bukti', requirePermission('TRX_JURNAL', 'edit'), (req, res) => {
  const header = db.prepare('SELECT * FROM journal_voucher WHERE no_bukti=?').get(req.params.no_bukti);
  if (!header) return res.status(404).json({ error: 'No bukti tidak ditemukan.' });
  if (header.status === 'POSTED') return res.status(400).json({ error: 'Jurnal sudah diposting, tidak bisa diubah.' });

  const { tanggal, keterangan, details } = req.body;
  if (!Array.isArray(details) || details.length < 2)
    return res.status(400).json({ error: 'Jurnal minimal harus memiliki 2 baris (debit & kredit).' });
  if (isPeriodClosed(header.cabang_id, tanggal || header.tanggal))
    return res.status(400).json({ error: 'Periode sudah tutup buku.' });

  let totalDebit = 0, totalKredit = 0;
  details.forEach(d => { totalDebit += Number(d.debit || 0); totalKredit += Number(d.kredit || 0); });
  if (Math.round(totalDebit * 100) !== Math.round(totalKredit * 100))
    return res.status(400).json({ error: `Jurnal tidak balance. Debit ${totalDebit} <> Kredit ${totalKredit}.` });

  const tx = db.transaction(() => {
    db.prepare('UPDATE journal_voucher SET tanggal=?, keterangan=?, total_debit=?, total_kredit=? WHERE no_bukti=?')
      .run(tanggal || header.tanggal, keterangan || '', totalDebit, totalKredit, req.params.no_bukti);
    db.prepare('DELETE FROM journal_detail WHERE no_bukti=?').run(req.params.no_bukti);
    const insDetail = db.prepare(`INSERT INTO journal_detail
      (no_bukti, urutan, kode_account, kode_department, debit, kredit, keterangan) VALUES (?,?,?,?,?,?,?)`);
    details.forEach((d, i) => {
      insDetail.run(req.params.no_bukti, i + 1, d.kode_account, d.kode_department || null,
        Number(d.debit || 0), Number(d.kredit || 0), d.keterangan || '');
    });
  });
  tx();
  res.json({ ok: true });
});

// DELETE voucher DRAFT
router.delete('/:no_bukti', requirePermission('TRX_JURNAL', 'delete'), (req, res) => {
  const header = db.prepare('SELECT * FROM journal_voucher WHERE no_bukti=?').get(req.params.no_bukti);
  if (!header) return res.status(404).json({ error: 'No bukti tidak ditemukan.' });
  if (header.status === 'POSTED') return res.status(400).json({ error: 'Jurnal sudah diposting, tidak bisa dihapus.' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM journal_detail WHERE no_bukti=?').run(req.params.no_bukti);
    db.prepare('DELETE FROM journal_voucher WHERE no_bukti=?').run(req.params.no_bukti);
  });
  tx();
  res.json({ ok: true });
});

// POSTING transaksi
router.post('/:no_bukti/post', requirePermission('TRX_POSTING', 'post'), (req, res) => {
  const header = db.prepare('SELECT * FROM journal_voucher WHERE no_bukti=?').get(req.params.no_bukti);
  if (!header) return res.status(404).json({ error: 'No bukti tidak ditemukan.' });
  if (header.status === 'POSTED') return res.status(400).json({ error: 'Jurnal sudah diposting sebelumnya.' });
  if (isPeriodClosed(header.cabang_id, header.tanggal))
    return res.status(400).json({ error: 'Periode sudah tutup buku, tidak bisa posting.' });
  if (Math.round(header.total_debit * 100) !== Math.round(header.total_kredit * 100))
    return res.status(400).json({ error: 'Jurnal tidak balance, tidak bisa diposting.' });

  db.prepare(`UPDATE journal_voucher SET status='POSTED', posted_by=?, posted_at=CURRENT_TIMESTAMP WHERE no_bukti=?`)
    .run(req.user.id, req.params.no_bukti);
  res.json({ ok: true });
});

// BATAL POSTING - kembalikan jurnal yang sudah diposting menjadi DRAFT lagi
router.post('/:no_bukti/unpost', requirePermission('TRX_BATALPOSTING', 'post'), (req, res) => {
  const header = db.prepare('SELECT * FROM journal_voucher WHERE no_bukti=?').get(req.params.no_bukti);
  if (!header) return res.status(404).json({ error: 'No bukti tidak ditemukan.' });
  if (header.status !== 'POSTED') return res.status(400).json({ error: 'Jurnal ini belum diposting.' });
  if (isPeriodClosed(header.cabang_id, header.tanggal))
    return res.status(400).json({ error: 'Periode sudah tutup buku. Batalkan tutup buku terlebih dahulu sebelum batal posting.' });

  db.prepare(`UPDATE journal_voucher SET status='DRAFT', posted_by=NULL, posted_at=NULL WHERE no_bukti=?`)
    .run(req.params.no_bukti);
  res.json({ ok: true });
});

module.exports = router;
module.exports.isPeriodClosed = isPeriodClosed;
module.exports.periodeOf = periodeOf;
