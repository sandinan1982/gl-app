const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('SET_USER', 'view'), (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.username, u.nama_lengkap, u.status, u.akses_semua_cabang,
      r.nama_role, r.id as role_id, b.nama_cabang, u.cabang_id
    FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN branches b ON b.id=u.cabang_id
    ORDER BY u.username`).all();
  res.json(rows);
});

router.post('/', requirePermission('SET_USER', 'add'), (req, res) => {
  const { username, password, nama_lengkap, role_id, cabang_id, akses_semua_cabang } = req.body;
  if (!username || !password || !role_id) return res.status(400).json({ error: 'Username, password, dan role wajib diisi.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`INSERT INTO users (username, password_hash, nama_lengkap, role_id, cabang_id, akses_semua_cabang)
      VALUES (?,?,?,?,?,?)`).run(username.trim(), hash, nama_lengkap || '', role_id, cabang_id || null, akses_semua_cabang ? 1 : 0);
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Username sudah digunakan.' }); }
});

router.put('/:id', requirePermission('SET_USER', 'edit'), (req, res) => {
  const { nama_lengkap, role_id, cabang_id, akses_semua_cabang, status, password } = req.body;
  db.prepare(`UPDATE users SET nama_lengkap=?, role_id=?, cabang_id=?, akses_semua_cabang=?, status=? WHERE id=?`)
    .run(nama_lengkap, role_id, cabang_id || null, akses_semua_cabang ? 1 : 0, status || 'AKTIF', req.params.id);
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.params.id);
  }
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('SET_USER', 'delete'), (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Tidak bisa menghapus user yang sedang login.' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
