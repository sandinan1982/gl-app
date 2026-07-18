const express = require('express');
const db = require('../db');
const { authRequired, requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('SET_HAKAKSES', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM roles ORDER BY nama_role').all());
});

router.post('/', requirePermission('SET_HAKAKSES', 'add'), (req, res) => {
  const { nama_role, keterangan } = req.body;
  if (!nama_role) return res.status(400).json({ error: 'Nama role wajib diisi.' });
  try {
    const info = db.prepare('INSERT INTO roles (nama_role, keterangan) VALUES (?,?)').run(nama_role.trim().toUpperCase(), keterangan || '');
    const menus = db.prepare('SELECT kode_menu FROM menus').all();
    const ins = db.prepare(`INSERT INTO role_permissions (role_id, kode_menu, can_view, can_add, can_edit, can_delete, can_post)
      VALUES (?,?,0,0,0,0,0)`);
    menus.forEach(m => ins.run(info.lastInsertRowid, m.kode_menu));
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Nama role sudah digunakan.' }); }
});

router.get('/menus', requirePermission('SET_HAKAKSES', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM menus ORDER BY grup_menu, id').all());
});

// Ambil hak akses (permission matrix) untuk 1 role
router.get('/:id/permissions', requirePermission('SET_HAKAKSES', 'view'), (req, res) => {
  const menus = db.prepare('SELECT * FROM menus ORDER BY grup_menu, id').all();
  const perms = db.prepare('SELECT * FROM role_permissions WHERE role_id=?').all(req.params.id);
  const map = {};
  perms.forEach(p => map[p.kode_menu] = p);
  const merged = menus.map(m => ({
    kode_menu: m.kode_menu, nama_menu: m.nama_menu, grup_menu: m.grup_menu,
    can_view: map[m.kode_menu]?.can_view || 0,
    can_add: map[m.kode_menu]?.can_add || 0,
    can_edit: map[m.kode_menu]?.can_edit || 0,
    can_delete: map[m.kode_menu]?.can_delete || 0,
    can_post: map[m.kode_menu]?.can_post || 0
  }));
  res.json(merged);
});

// Update hak akses (permission matrix) untuk 1 role
router.put('/:id/permissions', requirePermission('SET_HAKAKSES', 'edit'), (req, res) => {
  const { permissions } = req.body; // array of {kode_menu, can_view, can_add, can_edit, can_delete, can_post}
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'Data permission tidak valid.' });
  const upsert = db.prepare(`INSERT INTO role_permissions (role_id, kode_menu, can_view, can_add, can_edit, can_delete, can_post)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(role_id, kode_menu) DO UPDATE SET can_view=excluded.can_view, can_add=excluded.can_add,
      can_edit=excluded.can_edit, can_delete=excluded.can_delete, can_post=excluded.can_post`);
  const tx = db.transaction(() => {
    permissions.forEach(p => {
      upsert.run(req.params.id, p.kode_menu, p.can_view ? 1 : 0, p.can_add ? 1 : 0, p.can_edit ? 1 : 0, p.can_delete ? 1 : 0, p.can_post ? 1 : 0);
    });
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;
