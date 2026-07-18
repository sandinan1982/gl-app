const express = require('express');
const db = require('../db');
const { authRequired, requirePermission, scopeBranch } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('TRX_TUTUPBUKU', 'view'), scopeBranch, (req, res) => {
  let sql = `SELECT pc.*, b.nama_cabang FROM period_closing pc JOIN branches b ON b.id=pc.cabang_id WHERE 1=1`;
  const params = [];
  if (req.branchFilter) { sql += ' AND pc.cabang_id=?'; params.push(req.branchFilter); }
  sql += ' ORDER BY pc.periode DESC, b.nama_cabang';
  res.json(db.prepare(sql).all(...params));
});

// TUTUP BUKU
router.post('/tutup', requirePermission('TRX_TUTUPBUKU', 'post'), (req, res) => {
  const { cabang_id, periode } = req.body; // periode format YYYY-MM
  if (!cabang_id || !periode) return res.status(400).json({ error: 'Cabang dan periode wajib diisi.' });

  const existing = db.prepare('SELECT * FROM period_closing WHERE cabang_id=? AND periode=?').get(cabang_id, periode);
  if (existing && existing.status === 'CLOSED')
    return res.status(400).json({ error: 'Periode ini sudah ditutup.' });

  const draftCount = db.prepare(`SELECT COUNT(*) c FROM journal_voucher
    WHERE cabang_id=? AND substr(tanggal,1,7)=? AND status='DRAFT'`).get(cabang_id, periode).c;
  if (draftCount > 0)
    return res.status(400).json({ error: `Masih ada ${draftCount} jurnal berstatus DRAFT (belum diposting) pada periode ini. Posting terlebih dahulu sebelum tutup buku.` });

  if (existing) {
    db.prepare(`UPDATE period_closing SET status='CLOSED', closed_by=?, closed_at=CURRENT_TIMESTAMP,
      reopened_by=NULL, reopened_at=NULL WHERE id=?`).run(req.user.id, existing.id);
  } else {
    db.prepare(`INSERT INTO period_closing (cabang_id, periode, status, closed_by, closed_at)
      VALUES (?,?,'CLOSED',?,CURRENT_TIMESTAMP)`).run(cabang_id, periode, req.user.id);
  }
  res.json({ ok: true });
});

// BATAL TUTUP BUKU
router.post('/batal', requirePermission('TRX_BATALTUTUPBUKU', 'post'), (req, res) => {
  const { cabang_id, periode } = req.body;
  const existing = db.prepare('SELECT * FROM period_closing WHERE cabang_id=? AND periode=?').get(cabang_id, periode);
  if (!existing || existing.status !== 'CLOSED')
    return res.status(400).json({ error: 'Periode ini belum ditutup.' });

  db.prepare(`UPDATE period_closing SET status='OPEN', reopened_by=?, reopened_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(req.user.id, existing.id);
  res.json({ ok: true });
});

module.exports = router;
