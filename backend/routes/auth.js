const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });

  const user = db.prepare(`SELECT u.*, r.nama_role FROM users u
    JOIN roles r ON r.id = u.role_id WHERE u.username = ?`).get(username);
  if (!user) return res.status(401).json({ error: 'Username atau password salah.' });
  if (user.status !== 'AKTIF') return res.status(403).json({ error: 'User nonaktif, hubungi administrator.' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Username atau password salah.' });

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '12h' });
  const cabang = user.cabang_id ? db.prepare('SELECT * FROM branches WHERE id=?').get(user.cabang_id) : null;

  // Ambil daftar permission user untuk membangun menu di frontend
  const perms = db.prepare(`SELECT kode_menu, can_view, can_add, can_edit, can_delete, can_post
    FROM role_permissions WHERE role_id=?`).all(user.role_id);

  res.json({
    token,
    user: {
      id: user.id, username: user.username, nama_lengkap: user.nama_lengkap,
      role: user.nama_role, cabang_id: user.cabang_id, cabang_nama: cabang ? cabang.nama_cabang : 'Semua Cabang',
      akses_semua_cabang: !!user.akses_semua_cabang
    },
    permissions: user.nama_role === 'ADMIN' ? 'ALL' : perms
  });
});

router.get('/me', authRequired, (req, res) => {
  const u = req.user;
  const perms = db.prepare(`SELECT kode_menu, can_view, can_add, can_edit, can_delete, can_post
    FROM role_permissions WHERE role_id=?`).all(u.role_id);
  res.json({
    user: { id: u.id, username: u.username, nama_lengkap: u.nama_lengkap, role: u.nama_role, cabang_id: u.cabang_id },
    permissions: u.nama_role === 'ADMIN' ? 'ALL' : perms
  });
});

module.exports = router;
