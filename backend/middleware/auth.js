const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'gl-app-secret-key-ganti-ini-di-production';

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan, silakan login.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`SELECT u.*, r.nama_role FROM users u
      JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.status='AKTIF'`).get(payload.id);
    if (!user) return res.status(401).json({ error: 'User tidak valid atau nonaktif.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa.' });
  }
}

// action: 'view' | 'add' | 'edit' | 'delete' | 'post'
function requirePermission(kodeMenu, action = 'view') {
  const col = { view: 'can_view', add: 'can_add', edit: 'can_edit', delete: 'can_delete', post: 'can_post' }[action];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Belum login.' });
    if (req.user.nama_role === 'ADMIN') return next();
    const perm = db.prepare(`SELECT ${col} val FROM role_permissions WHERE role_id=? AND kode_menu=?`)
      .get(req.user.role_id, kodeMenu);
    if (!perm || !perm.val) {
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk aksi ini.' });
    }
    next();
  };
}

// Batasi akses data cabang: user tanpa akses_semua_cabang hanya boleh akses cabang miliknya
function scopeBranch(req, res, next) {
  if (req.user.akses_semua_cabang || req.user.nama_role === 'ADMIN') {
    req.branchFilter = null; // semua cabang
  } else {
    req.branchFilter = req.user.cabang_id;
  }
  next();
}

module.exports = { authRequired, requirePermission, scopeBranch, JWT_SECRET };
