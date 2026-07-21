const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'gl.db');
const isNew = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ================== MIGRASI / PERBAIKAN DATABASE LAMA ==================
// PENTING: semua migrasi di bawah ini WAJIB dijalankan SEBELUM membuat tabel baru
// (schema.sql). Saat SQLite me-rename sebuah tabel (mis. departments -> departments_old),
// tabel LAIN yang punya FOREIGN KEY ke tabel itu otomatis ikut menunjuk ke nama sementara
// tersebut. Kalau tabel yang mereferensikannya (mis. sub_departments) sudah dibuat lebih
// dulu, referensinya jadi rusak begitu tabel sementara itu dihapus. Menjalankan migrasi
// SEBELUM tabel baru dibuat mencegah masalah ini sejak awal.

// Database yang sudah pernah dibuat sebelum fitur Kategori Akun ada masih
// punya CHECK constraint lama pada chart_of_accounts.kategori (hanya 5 nilai tetap).
// Migrasi ini membangun ulang tabelnya tanpa constraint itu, tanpa menghapus data.
function migrateChartOfAccountsConstraint() {
  const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='chart_of_accounts'`).get();
  if (info && info.sql && info.sql.includes('CHECK(kategori')) {
    db.exec(`
      ALTER TABLE chart_of_accounts RENAME TO chart_of_accounts_old;
      CREATE TABLE chart_of_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kode_account TEXT UNIQUE NOT NULL,
        nama_account TEXT NOT NULL,
        kategori TEXT NOT NULL,
        saldo_normal TEXT NOT NULL CHECK(saldo_normal IN ('DEBIT','KREDIT')),
        parent_kode TEXT,
        is_header INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'AKTIF'
      );
      INSERT INTO chart_of_accounts (id, kode_account, nama_account, kategori, saldo_normal, parent_kode, is_header, status)
        SELECT id, kode_account, nama_account, kategori, saldo_normal, parent_kode, is_header, status FROM chart_of_accounts_old;
      DROP TABLE chart_of_accounts_old;
    `);
  }
}

// Perbaikan: kalau journal_detail sempat dibuat SEBELUM migrasi chart_of_accounts di atas
// pernah berjalan (versi database lama), foreign key kode_account-nya akan rusak menunjuk
// ke "chart_of_accounts_old" yang sudah dihapus. Bangun ulang jika terdeteksi rusak.
function repairJournalDetailForeignKey() {
  const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_detail'`).get();
  if (info && info.sql && info.sql.includes('chart_of_accounts_old')) {
    db.exec(`
      ALTER TABLE journal_detail RENAME TO journal_detail_old;
      CREATE TABLE journal_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        no_bukti TEXT NOT NULL REFERENCES journal_voucher(no_bukti),
        urutan INTEGER NOT NULL,
        kode_account TEXT NOT NULL REFERENCES chart_of_accounts(kode_account),
        kode_department TEXT,
        debit REAL NOT NULL DEFAULT 0,
        kredit REAL NOT NULL DEFAULT 0,
        keterangan TEXT
      );
      INSERT INTO journal_detail SELECT * FROM journal_detail_old;
      DROP TABLE journal_detail_old;
    `);
  }
}

// Migrasi departments: sebelumnya wajib terikat cabang_id, sekarang jadi daftar department
// global (tanpa cabang) supaya sesuai struktur baru: Kode Department, Nama Department, Status.
function migrateDepartments() {
  const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='departments'`).get();
  if (info && info.sql && info.sql.includes('cabang_id')) {
    db.exec(`
      ALTER TABLE departments RENAME TO departments_old;
      CREATE TABLE departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kode_department TEXT UNIQUE NOT NULL,
        nama_department TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'AKTIF'
      );
      INSERT OR IGNORE INTO departments (id, kode_department, nama_department, status)
        SELECT id, kode_department, nama_department, status FROM departments_old;
      DROP TABLE departments_old;
    `);
  }
}

// Perbaikan: kalau sub_departments sempat dibuat SEBELUM migrasi departments di atas
// pernah berjalan, foreign key kode_department-nya akan rusak menunjuk ke
// "departments_old" yang sudah dihapus (ini penyebab error "no such table: departments_old").
function repairSubDepartmentsForeignKey() {
  const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='sub_departments'`).get();
  if (info && info.sql && info.sql.includes('departments_old')) {
    db.exec(`
      ALTER TABLE sub_departments RENAME TO sub_departments_old;
      CREATE TABLE sub_departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kode_sub_department TEXT UNIQUE NOT NULL,
        nama_sub_department TEXT NOT NULL,
        kode_department TEXT NOT NULL REFERENCES departments(kode_department),
        tipe TEXT NOT NULL CHECK(tipe IN ('UMUM','NEQ')),
        status TEXT NOT NULL DEFAULT 'AKTIF'
      );
      INSERT INTO sub_departments SELECT * FROM sub_departments_old;
      DROP TABLE sub_departments_old;
    `);
  }
}

// Urutan wajib: benahi chart_of_accounts & departments dulu (beserta tabel yang mungkin
// sudah terlanjur rusak mereferensikannya), baru setelah itu tabel baru dibuat oleh schema.sql.
migrateChartOfAccountsConstraint();
repairJournalDetailForeignKey();
migrateDepartments();
repairSubDepartmentsForeignKey();

// Jalankan schema (idempotent, aman dijalankan berkali-kali) - membuat tabel yang
// belum ada, dengan tabel referensi yang sudah dalam kondisi benar di atas.
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ================== SEED DATA AWAL ==================
function seed() {
  const menuList = [
    ['MASTER_CABANG', 'Kode Cabang', 'Master Data'],
    ['MASTER_KATEGORI', 'Kategori Akun', 'Master Data'],
    ['MASTER_COA', 'Kode Account', 'Master Data'],
    ['MASTER_DEPT', 'Kode Department', 'Master Data'],
    ['MASTER_SUBDEPT', 'Sub Department', 'Master Data'],
    ['TRX_JURNAL', 'Jurnal Transaksi', 'Transaksi'],
    ['TRX_POSTING', 'Posting Transaksi', 'Transaksi'],
    ['TRX_BATALPOSTING', 'Batal Posting', 'Transaksi'],
    ['TRX_TUTUPBUKU', 'Tutup Buku', 'Transaksi'],
    ['TRX_BATALTUTUPBUKU', 'Batal Tutup Buku', 'Transaksi'],
    ['LAP_NERACA', 'Laporan Neraca', 'Laporan'],
    ['LAP_LABARUGI', 'Laporan Laba Rugi', 'Laporan'],
    ['LAP_HARIAN', 'Laporan Transaksi Harian', 'Laporan'],
    ['LAP_PREDIKSI', 'Prediksi Laba Rugi (AI)', 'Laporan'],
    ['SET_USER', 'Pembuatan User', 'Setting'],
    ['SET_HAKAKSES', 'Hak Akses User', 'Setting']
  ];
  const insMenu = db.prepare('INSERT OR IGNORE INTO menus (kode_menu, nama_menu, grup_menu) VALUES (?,?,?)');
  menuList.forEach(m => insMenu.run(...m));

  const roleCount = db.prepare('SELECT COUNT(*) c FROM roles').get().c;
  if (roleCount === 0) {
    const insRole = db.prepare('INSERT INTO roles (nama_role, keterangan) VALUES (?,?)');
    const adminRoleId = insRole.run('ADMIN', 'Akses penuh ke seluruh sistem').lastInsertRowid;
    const staffRoleId = insRole.run('STAFF', 'Input transaksi, tanpa akses setting').lastInsertRowid;

    const insPerm = db.prepare(`INSERT OR IGNORE INTO role_permissions
      (role_id, kode_menu, can_view, can_add, can_edit, can_delete, can_post) VALUES (?,?,?,?,?,?,?)`);
    menuList.forEach(m => insPerm.run(adminRoleId, m[0], 1, 1, 1, 1, 1));
    // STAFF: hanya master (view), transaksi jurnal (full kecuali posting), laporan (view)
    menuList.forEach(m => {
      let v = { view: 1, add: 0, edit: 0, del: 0, post: 0 };
      if (m[0] === 'TRX_JURNAL') v = { view: 1, add: 1, edit: 1, del: 1, post: 0 };
      if (m[0].startsWith('LAP_')) v = { view: 1, add: 0, edit: 0, del: 0, post: 0 };
      if (m[0].startsWith('SET_')) v = { view: 0, add: 0, edit: 0, del: 0, post: 0 };
      insPerm.run(staffRoleId, m[0], v.view, v.add, v.edit, v.del, v.post);
    });
  }

  const branchCount = db.prepare('SELECT COUNT(*) c FROM branches').get().c;
  if (branchCount === 0) {
    db.prepare('INSERT INTO branches (kode_cabang, nama_cabang, alamat) VALUES (?,?,?)')
      .run('PST', 'Kantor Pusat', 'Pusat');
  }

  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (userCount === 0) {
    const adminRole = db.prepare("SELECT id FROM roles WHERE nama_role='ADMIN'").get();
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (username, password_hash, nama_lengkap, role_id, akses_semua_cabang)
      VALUES (?,?,?,?,1)`).run('admin', hash, 'Administrator', adminRole.id);
  }

  const catCount = db.prepare('SELECT COUNT(*) c FROM account_categories').get().c;
  if (catCount === 0) {
    const insCat = db.prepare(`INSERT INTO account_categories (kode_kategori, nama_kategori, kelompok_laporan, saldo_normal) VALUES (?,?,?,?)`);
    const seedCat = [
      ['ASET', 'Aset', 'ASET', 'DEBIT'],
      ['KEWAJIBAN', 'Kewajiban', 'KEWAJIBAN', 'KREDIT'],
      ['MODAL', 'Modal', 'MODAL', 'KREDIT'],
      ['PENDAPATAN', 'Pendapatan', 'PENDAPATAN', 'KREDIT'],
      ['BEBAN', 'Beban', 'BEBAN', 'DEBIT']
    ];
    seedCat.forEach(c => insCat.run(...c));
  }

  const coaCount = db.prepare('SELECT COUNT(*) c FROM chart_of_accounts').get().c;
  if (coaCount === 0) {
    const insCoa = db.prepare(`INSERT INTO chart_of_accounts
      (kode_account, nama_account, kategori, saldo_normal, is_header) VALUES (?,?,?,?,?)`);
    const seedCoa = [
      ['1000', 'Kas', 'ASET', 'DEBIT', 0],
      ['1100', 'Bank', 'ASET', 'DEBIT', 0],
      ['1200', 'Piutang Usaha', 'ASET', 'DEBIT', 0],
      ['1300', 'Persediaan', 'ASET', 'DEBIT', 0],
      ['2000', 'Hutang Usaha', 'KEWAJIBAN', 'KREDIT', 0],
      ['2100', 'Hutang Bank', 'KEWAJIBAN', 'KREDIT', 0],
      ['3000', 'Modal Disetor', 'MODAL', 'KREDIT', 0],
      ['3100', 'Laba Ditahan', 'MODAL', 'KREDIT', 0],
      ['4000', 'Pendapatan Penjualan', 'PENDAPATAN', 'KREDIT', 0],
      ['5000', 'Beban Gaji', 'BEBAN', 'DEBIT', 0],
      ['5100', 'Beban Operasional', 'BEBAN', 'DEBIT', 0]
    ];
    seedCoa.forEach(c => insCoa.run(...c));
  }
}
seed();

module.exports = db;
