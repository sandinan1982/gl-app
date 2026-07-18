-- =========================================================
-- SCHEMA DATABASE GL (GENERAL LEDGER) MULTI CABANG
-- =========================================================

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_cabang TEXT UNIQUE NOT NULL,
  nama_cabang TEXT NOT NULL,
  alamat TEXT,
  status TEXT NOT NULL DEFAULT 'AKTIF'
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_account TEXT UNIQUE NOT NULL,
  nama_account TEXT NOT NULL,
  kategori TEXT NOT NULL CHECK(kategori IN ('ASET','KEWAJIBAN','MODAL','PENDAPATAN','BEBAN')),
  saldo_normal TEXT NOT NULL CHECK(saldo_normal IN ('DEBIT','KREDIT')),
  parent_kode TEXT,
  is_header INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AKTIF'
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_department TEXT NOT NULL,
  nama_department TEXT NOT NULL,
  cabang_id INTEGER NOT NULL REFERENCES branches(id),
  status TEXT NOT NULL DEFAULT 'AKTIF',
  UNIQUE(kode_department, cabang_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_role TEXT UNIQUE NOT NULL,
  keterangan TEXT
);

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_menu TEXT UNIQUE NOT NULL,
  nama_menu TEXT NOT NULL,
  grup_menu TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  kode_menu TEXT NOT NULL REFERENCES menus(kode_menu),
  can_view INTEGER NOT NULL DEFAULT 0,
  can_add INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_post INTEGER NOT NULL DEFAULT 0,
  UNIQUE(role_id, kode_menu)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nama_lengkap TEXT,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  cabang_id INTEGER REFERENCES branches(id),
  akses_semua_cabang INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AKTIF',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_voucher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_bukti TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  cabang_id INTEGER NOT NULL REFERENCES branches(id),
  keterangan TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED')),
  total_debit REAL NOT NULL DEFAULT 0,
  total_kredit REAL NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_by INTEGER REFERENCES users(id),
  posted_at TEXT
);

CREATE TABLE IF NOT EXISTS journal_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_bukti TEXT NOT NULL REFERENCES journal_voucher(no_bukti),
  urutan INTEGER NOT NULL,
  kode_account TEXT NOT NULL REFERENCES chart_of_accounts(kode_account),
  kode_department TEXT,
  debit REAL NOT NULL DEFAULT 0,
  kredit REAL NOT NULL DEFAULT 0,
  keterangan TEXT
);

CREATE TABLE IF NOT EXISTS period_closing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES branches(id),
  periode TEXT NOT NULL, -- format YYYY-MM
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  closed_by INTEGER REFERENCES users(id),
  closed_at TEXT,
  reopened_by INTEGER REFERENCES users(id),
  reopened_at TEXT,
  UNIQUE(cabang_id, periode)
);

CREATE INDEX IF NOT EXISTS idx_jd_nobukti ON journal_detail(no_bukti);
CREATE INDEX IF NOT EXISTS idx_jv_tanggal ON journal_voucher(tanggal);
CREATE INDEX IF NOT EXISTS idx_jv_cabang ON journal_voucher(cabang_id);
